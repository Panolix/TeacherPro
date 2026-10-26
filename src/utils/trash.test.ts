import { describe, expect, it } from "vitest";
import { getTrashEntryTimestamp, isTrashEntryExpired } from "./trash";

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
