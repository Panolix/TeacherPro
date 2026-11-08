// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LessonData } from "../../store";
import { useLessonMetadata } from "./useLessonMetadata";
import { duplicateLessonData, ensureLessonIdentity, lessonDocumentKey, LessonIdentityRegistry } from "../../utils/lessonIdentity";

const lesson: LessonData = {
  version: 1, id: "original", notes: "saved notes",
  metadata: { teacher: "Teacher", subject: "English", plannedFor: null, createdAt: "2026-01-01T12:00:00Z" },
  content: { type: "doc", content: [] },
};
let metadata: ReturnType<typeof useLessonMetadata>;
let root: Root;
function Harness({ data }: { data: LessonData }) {
  metadata = useLessonMetadata(data);
  return <output>{metadata.lessonNotes}</output>;
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  root = createRoot(document.createElement("div"));
});
afterEach(async () => { await act(async () => root.unmount()); vi.unstubAllGlobals(); });

describe("lesson editing state and identity", () => {
  it("preserves newer notes and every metadata field when an old save echoes", async () => {
    const key = lessonDocumentKey("/vault", lesson, "/vault/Lesson Plans/A.json");
    await act(async () => { root.render(<Harness key={key} data={lesson} />); });
    await act(async () => {
      metadata.setLessonNotes("typed while saving"); metadata.setTeacher("New teacher");
      metadata.setSubject("Math"); metadata.setPlannedForInput("12/11/2026");
    });
    await act(async () => { root.render(<Harness key={key} data={{ ...lesson, notes: "older save snapshot" }} />); });
    expect(metadata.lessonNotes).toBe("typed while saving");
    expect(metadata.teacher).toBe("New teacher"); expect(metadata.subject).toBe("Math");
    expect(metadata.plannedForInput).toBe("12/11/2026");
  });

  it("resets editing state only when a different document is opened", async () => {
    await act(async () => { root.render(<Harness key={lesson.id} data={lesson} />); });
    await act(async () => metadata.setLessonNotes("unsaved"));
    const copied = duplicateLessonData(lesson);
    await act(async () => { root.render(<Harness key={copied.id} data={copied} />); });
    expect(metadata.lessonNotes).toBe("saved notes");
    expect(copied.id).not.toBe(lesson.id);
  });

  it("keeps identity through renames but separates vaults and legacy copies", () => {
    const first = lessonDocumentKey("/vault", lesson, "A.json");
    expect(lessonDocumentKey("/vault", lesson, "Renamed.json")).toBe(first);
    expect(lessonDocumentKey("/other", lesson, "A.json")).not.toBe(first);
    const legacy = { ...lesson, id: undefined };
    expect(ensureLessonIdentity(legacy).id).not.toBe(ensureLessonIdentity(legacy).id);
    expect(ensureLessonIdentity(lesson).id).toBe(lesson.id);
  });

  it("preserves legacy IDs across reopening and folder moves without writing the file", () => {
    const registry = new LessonIdentityRegistry();
    const legacy = { ...lesson, id: undefined };
    const first = registry.identify("/vault/Folder/A.json", legacy);
    expect(registry.identify("/vault/Folder/A.json", legacy).id).toBe(first.id);
    expect(registry.identify("/vault/Folder/A copy.json", legacy).id).not.toBe(first.id);
    registry.rebind("/vault/Folder", "/vault/Renamed");
    expect(registry.identify("/vault/Renamed/A.json", legacy).id).toBe(first.id);
    registry.rebind("/vault/Renamed/A.json", null);
    expect(registry.identify("/vault/Renamed/A.json", legacy).id).not.toBe(first.id);
    expect(legacy.id).toBeUndefined();
  });
});
