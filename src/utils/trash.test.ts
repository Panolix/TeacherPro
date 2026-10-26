import { describe, expect, it } from "vitest";
import {
  addTrashManifestEntry,
  emptyTrashManifest,
  findTrashManifestEntry,
  getTrashEntryTimestamp,
  isTrashEntryExpired,
  parseTrashManifest,
  removeTrashManifestEntry,
  stripTrashEntryName,
  type TrashManifestEntry,
} from "./trash";

describe("trash entry timestamp", () => {
  it("parses the deletion timestamp embedded in the trash name", () => {
    const name = "2026-01-02T03-04-05-678Z-Lesson-2026-01-02.json";
    expect(getTrashEntryTimestamp(name)).toBe(
      Date.parse("2026-01-02T03:04:05.678Z"),
    );
  });

  it("treats unknown/legacy names as not expired", () => {
    expect(getTrashEntryTimestamp("My old folder")).toBeNull();
    expect(isTrashEntryExpired("My old folder", Date.now())).toBe(false);
  });

  it("expires only entries older than the cutoff", () => {
    const name = "2026-01-02T03-04-05-678Z-Lesson.json";
    expect(isTrashEntryExpired(name, Date.parse("2026-01-03T00:00:00Z"))).toBe(true);
    expect(isTrashEntryExpired(name, Date.parse("2026-01-01T00:00:00Z"))).toBe(false);
  });
});

function manifestEntry(overrides: Partial<TrashManifestEntry> = {}): TrashManifestEntry {
  return {
    trashName: "2026-01-02T03-04-05-678Z-Lesson.json",
    section: "Lesson Plans",
    originalRelativePath: "Englisch/Lesson.json",
    deletedAt: "2026-01-02T03:04:05.678Z",
    isDirectory: false,
    ...overrides,
  };
}

describe("trash manifest", () => {
  it("returns an empty manifest for missing or invalid data", () => {
    expect(parseTrashManifest(null)).toEqual(emptyTrashManifest());
    expect(parseTrashManifest("not json")).toEqual(emptyTrashManifest());
    expect(parseTrashManifest('{"version":2,"entries":[]}')).toEqual(emptyTrashManifest());
  });

  it("adds, finds and replaces entries by section and trash name", () => {
    const entry = manifestEntry();
    const withEntry = addTrashManifestEntry(emptyTrashManifest(), entry);
    expect(findTrashManifestEntry(withEntry, "Lesson Plans", entry.trashName)).toEqual(entry);

    const replacement = { ...entry, originalRelativePath: "Geschichte/Lesson.json" };
    const replaced = addTrashManifestEntry(withEntry, replacement);
    expect(replaced.entries).toHaveLength(1);
    expect(findTrashManifestEntry(replaced, "Lesson Plans", entry.trashName)?.originalRelativePath)
      .toBe("Geschichte/Lesson.json");
  });

  it("removes entries without touching other sections", () => {
    const lesson = manifestEntry();
    const mindmap = manifestEntry({
      trashName: "2026-01-02T03-04-05-678Z-Mind.json",
      section: "Mindmaps",
    });
    let manifest = addTrashManifestEntry(emptyTrashManifest(), lesson);
    manifest = addTrashManifestEntry(manifest, mindmap);
    manifest = removeTrashManifestEntry(manifest, "Lesson Plans", lesson.trashName);

    expect(findTrashManifestEntry(manifest, "Lesson Plans", lesson.trashName)).toBeUndefined();
    expect(findTrashManifestEntry(manifest, "Mindmaps", mindmap.trashName)).toEqual(mindmap);
  });

  it("strips timestamps and material type prefixes for display", () => {
    const lessonName = "2026-01-02T03-04-05-678Z-Lesson.json";
    expect(stripTrashEntryName(lessonName, "Lesson Plans")).toBe("Lesson.json");
    expect(stripTrashEntryName("2026-01-02T03-04-05-678Z-file-Report.pdf", "Materials"))
      .toBe("Report.pdf");
    expect(stripTrashEntryName("2026-01-02T03-04-05-678Z-folder-Unit 1", "Materials"))
      .toBe("Unit 1");
  });
});
