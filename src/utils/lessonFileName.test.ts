import { describe, expect, it } from "vitest";
import {
  isPlaceholderLessonFileName,
  lessonFileStem,
  sanitizeLessonFileStem,
} from "./lessonFileName";

describe("sanitizeLessonFileStem", () => {
  it("keeps a normal topic readable", () => {
    expect(sanitizeLessonFileStem("Bruchrechnung - Einstieg")).toBe(
      "Bruchrechnung - Einstieg",
    );
  });

  it("replaces characters that are invalid in filenames", () => {
    expect(sanitizeLessonFileStem('Mathe: "Brüche" / Übung?')).toBe(
      "Mathe Brüche Übung",
    );
  });

  it("collapses whitespace and trims trailing dots", () => {
    expect(sanitizeLessonFileStem("  Bruch   rechnung ...  ")).toBe(
      "Bruch rechnung",
    );
  });

  it("escapes reserved Windows device names", () => {
    expect(sanitizeLessonFileStem("CON")).toBe("_CON");
    expect(sanitizeLessonFileStem("lpt1")).toBe("_lpt1");
  });

  it("caps very long topics", () => {
    expect(Array.from(sanitizeLessonFileStem("a".repeat(200)))).toHaveLength(64);
  });

  it("returns an empty stem when nothing usable remains", () => {
    expect(sanitizeLessonFileStem("  ...  ")).toBe("");
    expect(sanitizeLessonFileStem("///")).toBe("");
  });
});

describe("isPlaceholderLessonFileName", () => {
  it("matches app-generated names", () => {
    for (const name of [
      "Stunde.json",
      "Stunde-2.json",
      "Lesson.json",
      "Lesson-12.json",
      "Stunde (Copy).json",
      "Lesson-3 (Copy)-1.json",
      "Lesson-2026-01-01-m3k2l1a-bc12d.json",
      "Untitled-Lesson.json",
    ]) {
      expect(isPlaceholderLessonFileName(name), name).toBe(true);
    }
  });

  it("leaves user-chosen names alone", () => {
    for (const name of [
      "A.json",
      "Bruchrechnung.json",
      "2026-04-17-English.json",
      "Lessonplan.json",
      "Stundenplan.json",
    ]) {
      expect(isPlaceholderLessonFileName(name), name).toBe(false);
    }
  });
});

describe("lessonFileStem", () => {
  it("strips the JSON extension and surrounding whitespace", () => {
    expect(lessonFileStem("  Bruchrechnung.JSON ")).toBe("Bruchrechnung");
  });
});
