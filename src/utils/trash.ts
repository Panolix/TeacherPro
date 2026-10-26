const TRASH_ENTRY_PATTERN = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z-/;

export const TRASH_SECTIONS = ["Lesson Plans", "Mindmaps", "Materials"] as const;
export type TrashSection = (typeof TRASH_SECTIONS)[number];

export interface TrashManifestEntry {
  trashName: string;
  section: TrashSection;
  /** Path relative to the section root, e.g. "Englisch/Lesson.json". */
  originalRelativePath: string;
  deletedAt: string;
  isDirectory: boolean;
}

export interface TrashManifest {
  version: 1;
  entries: TrashManifestEntry[];
}

export function isTrashSection(value: unknown): value is TrashSection {
  return typeof value === "string" && (TRASH_SECTIONS as readonly string[]).includes(value);
}

export function emptyTrashManifest(): TrashManifest {
  return { version: 1, entries: [] };
}

export function parseTrashManifest(raw: string | null | undefined): TrashManifest {
  if (!raw) {
    return emptyTrashManifest();
  }

  try {
    const parsed = JSON.parse(raw) as { version?: unknown; entries?: unknown };
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.entries)) {
      return emptyTrashManifest();
    }

    const entries = parsed.entries.filter((entry): entry is TrashManifestEntry => {
      if (!entry || typeof entry !== "object") return false;
      const candidate = entry as Partial<TrashManifestEntry>;
      return (
        typeof candidate.trashName === "string" &&
        candidate.trashName.length > 0 &&
        isTrashSection(candidate.section) &&
        typeof candidate.originalRelativePath === "string" &&
        candidate.originalRelativePath.length > 0 &&
        typeof candidate.deletedAt === "string" &&
        typeof candidate.isDirectory === "boolean"
      );
    });

    return { version: 1, entries };
  } catch {
    return emptyTrashManifest();
  }
}

export function addTrashManifestEntry(
  manifest: TrashManifest,
  entry: TrashManifestEntry,
): TrashManifest {
  return {
    version: 1,
    entries: [
      ...manifest.entries.filter(
        (existing) =>
          existing.section !== entry.section || existing.trashName !== entry.trashName,
      ),
      entry,
    ],
  };
}

export function removeTrashManifestEntry(
  manifest: TrashManifest,
  section: TrashSection,
  trashName: string,
): TrashManifest {
  return {
    version: 1,
    entries: manifest.entries.filter(
      (entry) => entry.section !== section || entry.trashName !== trashName,
    ),
  };
}

export function findTrashManifestEntry(
  manifest: TrashManifest,
  section: TrashSection,
  trashName: string,
): TrashManifestEntry | undefined {
  return manifest.entries.find(
    (entry) => entry.section === section && entry.trashName === trashName,
  );
}

export function stripTrashEntryName(trashName: string, section: TrashSection): string {
  const withoutTimestamp = trashName.replace(TRASH_ENTRY_PATTERN, "");
  if (section !== "Materials") {
    return withoutTimestamp;
  }
  return withoutTimestamp.replace(/^(file|folder)-/, "");
}

/**
 * Trash entry names start with the UTC timestamp at which the item was moved
 * to the Trash (see createTrashName). The timestamp must be the source of
 * truth for retention: rename preserves the original file's mtime, so using
 * mtime here would permanently delete old documents immediately after they
 * were trashed.
 */
export function getTrashEntryTimestamp(trashName: string): number | null {
  const match = TRASH_ENTRY_PATTERN.exec(trashName);
  if (!match) {
    return null;
  }

  const [, date, hours, minutes, seconds, milliseconds] = match;
  const timestamp = Date.parse(`${date}T${hours}:${minutes}:${seconds}.${milliseconds}Z`);
  return Number.isFinite(timestamp) ? timestamp : null;
}

/**
 * Unknown or legacy names (for example a folder the user created by hand)
 * deliberately count as "not expired" so they are never deleted by mistake.
 */
export function isTrashEntryExpired(trashName: string, cutoffTime: number): boolean {
  const timestamp = getTrashEntryTimestamp(trashName);
  return timestamp !== null && timestamp < cutoffTime;
}
