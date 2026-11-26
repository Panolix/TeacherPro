const INVALID_FILE_NAME_CHARS = /[\u0000-\u001F<>:"/\\|?*]+/g;
const FORBIDDEN_ENTRY_NAME_CHARS = /[\u0000-\u001F<>:"/\\|?*]/;
const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const LEGACY_UNTITLED_STEM =
  /^(?:Lesson|Stunde)-\d{4}-\d{2}-\d{2}-[a-z0-9]+-[a-z0-9]+$/i;
const PLACEHOLDER_STEM =
  /^(?:Stunde|Lesson)(?:-\d+)?(?: \(Copy\)(?:-\d+)?)?$/i;

/** Keeps generated lesson filenames well clear of Windows path limits. */
export const LESSON_FILE_STEM_MAX_LENGTH = 64;

export function lessonFileStem(fileName: string): string {
  return fileName.trim().replace(/\.json$/i, "").trim();
}

/**
 * Turns a lesson topic into a safe, readable filename stem. Returns an empty
 * string when the topic has no usable characters, so callers keep the
 * existing placeholder name instead of inventing one.
 */
export function sanitizeLessonFileStem(topic: string): string {
  let stem = topic
    .replace(INVALID_FILE_NAME_CHARS, " ")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "");

  if (!stem) return "";
  if (RESERVED_WINDOWS_NAMES.test(stem)) stem = `_${stem}`;

  stem = Array.from(stem).slice(0, LESSON_FILE_STEM_MAX_LENGTH).join("");
  return stem.replace(/[.\s]+$/g, "").trim();
}

/**
 * True for names the app generates itself: "Stunde", "Lesson-2", their
 * duplicates, and the legacy untitled/date-id pattern. Only these are
 * renamed automatically when a topic is first set.
 */
export function isPlaceholderLessonFileName(fileName: string): boolean {
  const stem = lessonFileStem(fileName);
  return (
    PLACEHOLDER_STEM.test(stem) ||
    LEGACY_UNTITLED_STEM.test(stem) ||
    /^Untitled-Lesson/i.test(stem)
  );
}

/**
 * Validates a single file or folder entry name inside a vault directory,
 * rejecting path separators, traversal segments, forbidden Windows/control
 * characters, trailing dots, and reserved Windows device names.
 */
export function isValidVaultEntryName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed || trimmed === "." || trimmed === "..") return false;
  if (trimmed.endsWith(".")) return false;
  if (FORBIDDEN_ENTRY_NAME_CHARS.test(trimmed)) return false;
  const stemBeforeDot = trimmed.split(".")[0] ?? "";
  if (RESERVED_WINDOWS_NAMES.test(trimmed) || RESERVED_WINDOWS_NAMES.test(stemBeforeDot)) {
    return false;
  }
  return true;
}
