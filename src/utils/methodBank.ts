export type MethodBankType = "phase" | "socialForm" | "method";

export interface MethodBankItem {
  id: string;
  type: MethodBankType;
  title: string;
  summary: string;
  description: string;
  duration: string;
  tags: string[];
}

export interface MethodDropPayload {
  id: string;
  type: MethodBankType;
  title: string;
  summary: string;
  duration: string;
}

export const METHOD_TYPE_ACCENT: Record<MethodBankType, string> = {
  phase: "text-cyan-300",
  socialForm: "text-emerald-300",
  method: "text-amber-300",
};

export function normalizeMethodBankItem(raw: unknown): MethodBankItem | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as Partial<MethodBankItem>;
  const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
  const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
  const summary = typeof candidate.summary === "string" ? candidate.summary.trim() : "";
  const description = typeof candidate.description === "string" ? candidate.description.trim() : "";
  const duration = typeof candidate.duration === "string" ? candidate.duration.trim() : "";
  const type =
    candidate.type === "phase" || candidate.type === "socialForm" || candidate.type === "method"
      ? candidate.type
      : null;

  if (!id || !title || !summary || !description || !duration || !type) {
    return null;
  }

  const tags = Array.isArray(candidate.tags)
    ? candidate.tags
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim())
        .filter(Boolean)
    : [];

  return {
    id,
    type,
    title,
    summary,
    description,
    duration,
    tags,
  };
}

export function parseMethodBankSeed(raw: unknown): MethodBankItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const parsed: MethodBankItem[] = [];
  for (const entry of raw) {
    const normalized = normalizeMethodBankItem(entry);
    if (normalized) {
      parsed.push(normalized);
    }
  }

  return parsed;
}

export function getMethodDropPayload(dataTransfer: DataTransfer): MethodDropPayload | null {
  const structuredPayload = dataTransfer.getData("application/teacherpro-method");
  if (!structuredPayload) {
    return null;
  }

  try {
    const parsed = JSON.parse(structuredPayload) as Partial<MethodDropPayload>;
    if (
      typeof parsed.id !== "string" ||
      typeof parsed.type !== "string" ||
      typeof parsed.title !== "string" ||
      typeof parsed.summary !== "string" ||
      typeof parsed.duration !== "string"
    ) {
      return null;
    }

    if (parsed.type !== "phase" && parsed.type !== "socialForm" && parsed.type !== "method") {
      return null;
    }

    return {
      id: parsed.id,
      type: parsed.type,
      title: parsed.title,
      summary: parsed.summary,
      duration: parsed.duration,
    };
  } catch {
    return null;
  }
}
