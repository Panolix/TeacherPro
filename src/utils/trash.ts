const TRASH_ENTRY_PATTERN = /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z-/;

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
