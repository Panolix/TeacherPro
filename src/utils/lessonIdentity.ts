import type { LessonData } from "../store";

/** A filename can change; a document's identity must not. */
export function ensureLessonIdentity(lesson: LessonData): LessonData {
  return {
    ...lesson,
    id: typeof lesson.id === "string" && lesson.id.trim()
      ? lesson.id
      : crypto.randomUUID(),
  };
}

export function duplicateLessonData(lesson: LessonData): LessonData {
  return {
    ...lesson,
    id: crypto.randomUUID(),
    metadata: { ...lesson.metadata, createdAt: new Date().toISOString() },
  };
}

export function lessonDocumentKey(vaultPath: string | null, lesson: LessonData | null, filePath: string | null): string {
  return `${vaultPath ?? ""}:lesson:${lesson?.id ?? filePath ?? ""}`;
}

/** Legacy files need a session identity without writing to disk just to open them. */
export class LessonIdentityRegistry {
  private ids = new Map<string, string>();

  identify(filePath: string, lesson: LessonData): LessonData {
    const path = filePath.replace(/\\/g, "/");
    const identified = ensureLessonIdentity({ ...lesson, id: lesson.id || this.ids.get(path) });
    this.ids.set(path, identified.id!);
    return identified;
  }

  rebind(source: string, target: string | null): void {
    const from = source.replace(/\\/g, "/").replace(/\/+$/, "");
    const to = target?.replace(/\\/g, "/").replace(/\/+$/, "");
    for (const [path, id] of Array.from(this.ids)) {
      if (path === from || path.startsWith(`${from}/`)) {
        this.ids.delete(path);
        if (to) this.ids.set(to + path.slice(from.length), id);
      }
    }
  }
}
