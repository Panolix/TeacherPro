import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerCloseFlusher } from "./utils/closeFlush";
import { enqueueDocumentWrite, waitForDocumentWrites } from "./utils/documentWriteQueue";
import { useAppStore, type LessonData } from "./store";

const mocks = vi.hoisted(() => ({
  files: new Map<string, string>(), settings: new Map<string, unknown>(),
  open: vi.fn(), ask: vi.fn(), invoke: vi.fn(),
  write: vi.fn(), rename: vi.fn(), copy: vi.fn(),
}));
const normalize = (path: string) => path.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mocks.open, ask: mocks.ask }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/api/path", () => ({ join: async (...parts: string[]) => normalize(parts.join("/")) }));
vi.mock("./i18n/translations", () => ({ t: (_language: string, key: string) => key }));
vi.mock("@tauri-apps/plugin-store", () => ({ load: async () => ({
  get: async (key: string) => mocks.settings.get(key),
  set: async (key: string, value: unknown) => { mocks.settings.set(key, value); },
  save: async () => {},
}) }));
vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: async (path: string) => mocks.files.has(normalize(path)),
  readDir: async () => [], mkdir: async () => {},
  readTextFile: async (path: string) => {
    const text = mocks.files.get(normalize(path));
    if (text === undefined) throw new Error("File not found");
    return text;
  },
  writeTextFile: mocks.write, rename: mocks.rename, copyFile: mocks.copy,
  remove: async (path: string) => { mocks.files.delete(normalize(path)); },
}));

const lesson: LessonData = {
  version: 1, id: "lesson-a", notes: "original notes",
  metadata: { teacher: "Teacher", subject: "English", createdAt: "2026-01-01T12:00:00Z", plannedFor: null },
  content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Original" }] }] },
};
const pathA = "/vaultA/Lesson Plans/A.json";
let unregister: (() => void) | undefined;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.files.clear(); mocks.settings.clear();
  mocks.files.set(pathA, JSON.stringify(lesson));
  mocks.open.mockResolvedValue("/vaultB");
  mocks.ask.mockResolvedValue(false);
  mocks.invoke.mockResolvedValue(undefined);
  mocks.write.mockImplementation(async (path: string, contents: string) => { mocks.files.set(normalize(path), contents); });
  mocks.rename.mockImplementation(async (from: string, to: string) => {
    if (!mocks.files.has(normalize(from))) throw new Error("File not found");
    mocks.files.set(normalize(to), mocks.files.get(normalize(from))!);
    mocks.files.delete(normalize(from));
  });
  mocks.copy.mockImplementation(async (from: string, to: string) => { mocks.files.set(normalize(to), mocks.files.get(normalize(from))!); });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  vi.stubGlobal("alert", vi.fn());
  useAppStore.setState({ ...useAppStore.getInitialState(),
    vaultPath: "/vaultA", activeFilePath: pathA, activeFileContent: lesson, refreshVault: async () => {},
  }, true);
});
afterEach(async () => {
  unregister?.(); unregister = undefined;
  await waitForDocumentWrites();
  vi.unstubAllGlobals();
});

describe("vault switching", () => {
  it("flushes against the old vault before registering the new root", async () => {
    unregister = registerCloseFlusher(() => {
      expect(useAppStore.getState().vaultPath).toBe("/vaultA");
      expect(mocks.invoke).not.toHaveBeenCalled();
      return useAppStore.getState().saveLessonAtPath(pathA, { ...lesson, notes: "latest notes" });
    });
    await useAppStore.getState().openVault();
    expect(JSON.parse(mocks.files.get(pathA)!).notes).toBe("latest notes");
    expect(useAppStore.getState().vaultPath).toBe("/vaultB");
    expect([...mocks.files.keys()].some(p => p.startsWith("/vaultA/.teacherpro/document-backups/"))).toBe(true);
    expect([...mocks.files.keys()].some(p => p.startsWith("/vaultB/.teacherpro/document-backups/"))).toBe(false);
  });

  it("keeps the old document on a failed flush unless discard is confirmed", async () => {
    unregister = registerCloseFlusher(async () => false);
    await useAppStore.getState().openVault();
    expect(mocks.ask).toHaveBeenCalledOnce();
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(useAppStore.getState().activeFilePath).toBe(pathA);
    mocks.ask.mockResolvedValueOnce(true);
    await useAppStore.getState().openVault();
    expect(useAppStore.getState().vaultPath).toBe("/vaultB");
  });

  it("retains the old vault if backend registration is rejected", async () => {
    mocks.invoke.mockRejectedValueOnce(new Error("Invalid root"));
    await useAppStore.getState().openVault();
    expect(useAppStore.getState().vaultPath).toBe("/vaultA");
    expect(useAppStore.getState().activeFilePath).toBe(pathA);
    expect(mocks.settings.get("vault")).toBeUndefined();
  });

  it("clears old mindmaps, knowledge selection, indexes, and recent entries", async () => {
    useAppStore.setState({
      activeMindmapContent: { version: 1, nodes: [{ id: "old" }], edges: [] },
      activeChatDb: "English", subjectDatabases: [{ subject: "English", files: [], grades: [] }],
      lessonSearchIndex: { "A.json": "old" }, recents: [{ type: "lesson", relativePath: "A.json", openedAt: 1 }],
    });
    await useAppStore.getState().openVault();
    const state = useAppStore.getState();
    expect(state.activeMindmapContent).toBeNull();
    expect(state.activeChatDb).toBeNull();
    expect(state.subjectDatabases).toEqual([]);
    expect(state.lessonSearchIndex).toEqual({});
    expect(state.recents).toEqual([]);
  });
});

describe("lesson metadata", () => {
  it("drops the legacy default heading and fills the extended fields", async () => {
    const legacyPath = "/vaultA/Lesson Plans/legacy.json";
    mocks.files.set(legacyPath, JSON.stringify({
      version: 1,
      metadata: { teacher: "Old", subject: "English", createdAt: "2026-01-01T12:00:00Z", plannedFor: null },
      notes: "",
      content: {
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Neue Stunde" }] },
          { type: "paragraph", content: [{ type: "text", text: "Body" }] },
        ],
      },
    }));

    await useAppStore.getState().openLesson("legacy.json");
    const opened = useAppStore.getState().activeFileContent!;
    expect(opened.content.content).toEqual([
      { type: "paragraph", content: [{ type: "text", text: "Body" }] },
    ]);
    expect(opened.metadata.className).toBe("");
    expect(opened.metadata.period).toBe("");
    expect(opened.metadata.room).toBe("");
    expect(opened.metadata.topic).toBe("");
  });

  it("keeps a user-written heading", async () => {
    const customPath = "/vaultA/Lesson Plans/custom.json";
    mocks.files.set(customPath, JSON.stringify({
      version: 1,
      metadata: { subject: "", createdAt: "2026-01-01T12:00:00Z", plannedFor: null },
      content: {
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "My own title" }] },
        ],
      },
    }));

    await useAppStore.getState().openLesson("custom.json");
    const opened = useAppStore.getState().activeFileContent!;
    expect(opened.content.content[0].content[0].text).toBe("My own title");
  });

  it("drops the legacy default heading after leading empty paragraphs", async () => {
    const leadingPath = "/vaultA/Lesson Plans/leading-empty.json";
    mocks.files.set(leadingPath, JSON.stringify({
      version: 1,
      metadata: { subject: "", createdAt: "2026-01-01T12:00:00Z", plannedFor: null },
      content: {
        type: "doc",
        content: [
          { type: "paragraph" },
          { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "New Lesson Plan" }] },
          { type: "paragraph", content: [{ type: "text", text: "Body" }] },
        ],
      },
    }));

    await useAppStore.getState().openLesson("leading-empty.json");
    const opened = useAppStore.getState().activeFileContent!;
    expect(opened.content.content).toEqual([
      { type: "paragraph" },
      { type: "paragraph", content: [{ type: "text", text: "Body" }] },
    ]);
  });

  it("normalizes whitespace in the extended metadata fields", async () => {
    const spacedPath = "/vaultA/Lesson Plans/spaced.json";
    mocks.files.set(spacedPath, JSON.stringify({
      version: 1,
      metadata: {
        subject: "English",
        createdAt: "2026-01-01T12:00:00Z",
        plannedFor: null,
        className: "  9a ",
        period: " 3  Stunde ",
        room: "\t204 ",
        topic: "  Bruch   rechnung ",
      },
      content: { type: "doc", content: [{ type: "paragraph" }] },
    }));

    await useAppStore.getState().openLesson("spaced.json");
    const opened = useAppStore.getState().activeFileContent!;
    expect(opened.metadata.className).toBe("9a");
    expect(opened.metadata.period).toBe("3 Stunde");
    expect(opened.metadata.room).toBe("204");
    expect(opened.metadata.topic).toBe("Bruch rechnung");
  });

  it("indexes class, period, room and topic for the calendar after a save", async () => {
    useAppStore.setState({
      lessonClassIndex: { "A.json": "" },
      lessonPeriodIndex: { "A.json": "" },
      lessonRoomIndex: { "A.json": "" },
      lessonTopicIndex: { "A.json": "" },
    });
    await useAppStore.getState().openLesson("A.json");

    const saved = await useAppStore.getState().saveActiveLesson(
      lesson.content,
      {
        subject: "English",
        className: "9a",
        period: "3",
        room: "204",
        topic: "Bruchrechnung",
      },
    );

    expect(saved).toBe(true);
    const state = useAppStore.getState();
    expect(state.lessonClassIndex["A.json"]).toBe("9a");
    expect(state.lessonPeriodIndex["A.json"]).toBe("3");
    expect(state.lessonRoomIndex["A.json"]).toBe("204");
    expect(state.lessonTopicIndex["A.json"]).toBe("Bruchrechnung");
    expect(state.lessonSearchIndex["A.json"]).toContain("bruchrechnung");
    expect(JSON.parse(mocks.files.get(pathA)!).metadata.topic).toBe("Bruchrechnung");
  });
});

describe("lesson file naming", () => {
  it("renames a placeholder lesson once its first topic is saved", async () => {
    const placeholderPath = "/vaultA/Lesson Plans/Stunde-2.json";
    mocks.files.set(placeholderPath, JSON.stringify({
      version: 1,
      id: "placeholder",
      metadata: { subject: "English", createdAt: "2026-01-01T12:00:00Z", plannedFor: null, topic: "" },
      notes: "",
      content: { type: "doc", content: [{ type: "paragraph" }] },
    }));

    await useAppStore.getState().openLesson("Stunde-2.json");
    const saved = await useAppStore.getState().saveActiveLesson(
      { type: "doc", content: [{ type: "paragraph" }] },
      { subject: "English", topic: "Bruchrechnung: Einstieg" },
    );

    expect(saved).toBe(true);
    const renamedPath = "/vaultA/Lesson Plans/Bruchrechnung Einstieg.json";
    expect(mocks.files.has(renamedPath)).toBe(true);
    expect(mocks.files.has(placeholderPath)).toBe(false);
    expect(useAppStore.getState().activeFilePath).toBe(renamedPath);
    expect(useAppStore.getState().activeFileContent?.metadata.topic).toBe("Bruchrechnung: Einstieg");
    expect(useAppStore.getState().recents[0]?.relativePath).toBe("Bruchrechnung Einstieg.json");
  });

  it("does not rename a user-chosen filename when the topic changes", async () => {
    await useAppStore.getState().openLesson("A.json");
    const saved = await useAppStore.getState().saveActiveLesson(
      lesson.content,
      { subject: "English", topic: "Bruchrechnung" },
    );

    expect(saved).toBe(true);
    expect(mocks.files.has(pathA)).toBe(true);
    expect(useAppStore.getState().activeFilePath).toBe(pathA);
  });

  it("keeps queued saves on the renamed path", async () => {
    const placeholderPath = "/vaultA/Lesson Plans/Lesson.json";
    mocks.files.set(placeholderPath, JSON.stringify({
      version: 1,
      id: "placeholder-queued",
      metadata: { subject: "English", createdAt: "2026-01-01T12:00:00Z", plannedFor: null, topic: "" },
      notes: "",
      content: { type: "doc", content: [{ type: "paragraph" }] },
    }));

    await useAppStore.getState().openLesson("Lesson.json");
    const content = { type: "doc", content: [{ type: "paragraph" }] };
    const first = useAppStore.getState().saveActiveLesson(content, { subject: "English", topic: "Bruchrechnung" });
    const second = useAppStore.getState().saveActiveLesson(content, { subject: "English", topic: "Bruchrechnung" });

    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
    expect(mocks.files.has("/vaultA/Lesson Plans/Bruchrechnung.json")).toBe(true);
    expect(mocks.files.has(placeholderPath)).toBe(false);
  });

  it("updates recents when a lesson is renamed manually", async () => {
    await useAppStore.getState().openLesson("A.json");
    await useAppStore.getState().renameLesson("A.json", "Renamed");
    expect(useAppStore.getState().recents[0]?.relativePath).toBe("Renamed.json");
  });
});

describe("document persistence", () => {
  it("waits for the outgoing save before unmounting into the weekly view", async () => {
    let release!: () => void;
    unregister = registerCloseFlusher(async () => {
      await new Promise<void>(resolve => { release = resolve; });
      return useAppStore.getState().saveLessonAtPath(pathA, { ...lesson, notes: "latest before weekly view" });
    });
    const switching = useAppStore.getState().setCurrentView("calendar");
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    expect(useAppStore.getState().currentView).toBe("editor");
    release(); await switching;
    expect(useAppStore.getState().currentView).toBe("calendar");
    expect(useAppStore.getState().activeFileContent?.notes).toBe("latest before weekly view");
  });

  it("duplicates the latest flushed lesson with a distinct identity", async () => {
    unregister = registerCloseFlusher(() => useAppStore.getState().saveLessonAtPath(pathA, { ...lesson, notes: "latest" }));
    await useAppStore.getState().duplicateVaultPath("Lesson Plans", "A.json");
    const duplicate = JSON.parse(mocks.files.get("/vaultA/Lesson Plans/A copy.json")!);
    expect(duplicate.notes).toBe("latest");
    expect(duplicate.id).not.toBe(lesson.id);
    expect(duplicate.metadata.createdAt).not.toBe(lesson.metadata.createdAt);
    expect(JSON.parse(mocks.files.get(pathA)!).id).toBe(lesson.id);
  });

  it("does not convert binary material copies to text", async () => {
    mocks.files.set("/vaultA/Materials/test.pdf", "binary fixture");
    await useAppStore.getState().duplicateVaultPath("Materials", "test.pdf");
    expect(mocks.copy).toHaveBeenCalledWith("/vaultA/Materials/test.pdf", "/vaultA/Materials/test copy.pdf");
  });

  it("keeps the original and a recovery copy when atomic replacement fails", async () => {
    mocks.rename.mockRejectedValueOnce(new Error("Target is locked"));
    await expect(useAppStore.getState().saveLessonAtPath(pathA, { ...lesson, notes: "newer" }, { silent: true })).resolves.toBe(false);
    expect(JSON.parse(mocks.files.get(pathA)!).notes).toBe("original notes");
    const recovery = [...mocks.files.entries()].find(([p]) => p.startsWith(`${pathA}.`) && p.endsWith(".tmp"));
    expect(JSON.parse(recovery![1]).notes).toBe("newer");
    expect(mocks.write).not.toHaveBeenCalledWith(pathA, expect.any(String));
  });

  it("does not resurrect deleted documents", async () => {
    mocks.files.delete(pathA);
    await expect(useAppStore.getState().saveLessonAtPath(pathA, lesson)).resolves.toBe(false);
    expect(mocks.files.has(pathA)).toBe(false);
  });

  it("does not publish an outgoing save over a newly opened lesson", async () => {
    let release!: () => void;
    const blocked = enqueueDocumentWrite(() => new Promise<void>(resolve => { release = resolve; }));
    const saving = useAppStore.getState().saveActiveLesson(lesson.content, {}, "saved A");
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    const other = { ...lesson, id: "lesson-b", notes: "B" };
    useAppStore.setState({ activeFilePath: "/vaultA/Lesson Plans/B.json", activeFileContent: other });
    release(); await blocked; await saving;
    expect(useAppStore.getState().activeFileContent).toBe(other);
    expect(JSON.parse(mocks.files.get(pathA)!).notes).toBe("saved A");
  });

  it("opens uppercase JSON extensions", async () => {
    mocks.files.set("/vaultA/Lesson Plans/UPPER.JSON", JSON.stringify(lesson));
    await useAppStore.getState().openLesson("UPPER.JSON");
    expect(useAppStore.getState().activeFilePath).toBe("/vaultA/Lesson Plans/UPPER.JSON");
  });

  it("opens uppercase mindmap JSON extensions", async () => {
    mocks.files.set("/vaultA/Mindmaps/UPPER.JSON", JSON.stringify({ version: 1, nodes: [], edges: [] }));
    await useAppStore.getState().openMindmap("UPPER.JSON");
    expect(useAppStore.getState().activeFilePath).toBe("/vaultA/Mindmaps/UPPER.JSON");
  });
});
