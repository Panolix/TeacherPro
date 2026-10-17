import { useState } from "react";
import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import {
  Database,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import type { Editor } from "@tiptap/react";
import { useTranslation } from "../../i18n/useTranslation";
import type { SubjectDbInfo } from "../../store";
import type { MethodBankItem } from "../../utils/methodBank";

interface Props {
  open: boolean;
  onClose: () => void;
  editor: Editor | null;
  defaultTopic: string;
  defaultGrade: string;
  aiEnabled: boolean;
  vaultPath: string | null;
  activeDb: string | null;
  activeGrade: string | null;
  activeTopic: string | null;
  subjectDatabases: SubjectDbInfo[];
  methodBankItems: MethodBankItem[];
}

export interface DraftPhase {
  time: string;
  phase: string;
  teachingArrangement: string;
  socialForm: string;
  media: string;
}

interface DraftResult {
  title: string;
  objectives: string[];
  phases: DraftPhase[];
}

const DRAFT_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    objectives: { type: "array", items: { type: "string" } },
    phases: {
      type: "array",
      items: {
        type: "object",
        properties: {
          time: { type: "string" },
          phase: { type: "string" },
          teachingArrangement: { type: "string" },
          socialForm: { type: "string" },
          media: { type: "string" },
        },
        required: ["time", "phase", "teachingArrangement", "socialForm", "media"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "objectives", "phases"],
  additionalProperties: false,
};

/** Opt-in AI lesson draft: form -> grammar-enforced JSON -> native Tiptap table. */
export function DraftGeneratorDialog({
  open,
  onClose,
  editor,
  defaultTopic,
  defaultGrade,
  aiEnabled,
  vaultPath,
  activeDb: defaultDb,
  activeGrade: defaultGradeProp,
  activeTopic: defaultTopicProp,
  subjectDatabases,
  methodBankItems,
}: Props) {
  const { t } = useTranslation();
  const [topic, setTopic] = useState(defaultTopic);
  const [grade, setGrade] = useState(defaultGrade);
  const [duration, setDuration] = useState(45);
  const [focus, setFocus] = useState("");
  const [db, setDb] = useState<string | null>(defaultDb);
  const [dbGrade, setDbGrade] = useState<string | null>(defaultGradeProp);
  const [dbTopic, setDbTopic] = useState<string | null>(defaultTopicProp);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DraftResult | null>(null);

  if (!open) return null;

  const generate = async () => {
    if (!aiEnabled) {
      setError(t("editor.aiMenu.enableLocalAiFirst"));
      return;
    }
    if (!topic.trim()) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const systemPrompt = t("editor.aiDraft.systemPrompt", { duration: String(duration) });
      let methodBankBlock = "";
      if (methodBankItems.length > 0) {
        const short = methodBankItems
          .map((m) => {
            const kind = m.type === "phase" ? "Phase" : m.type === "socialForm" ? "Sozialform" : "Methode";
            const dur = m.duration ? ` (${m.duration})` : "";
            return `- ${kind}: ${m.title}${dur}`;
          })
          .join("\n")
          .slice(0, 6000);
        methodBankBlock = `\n\n${t("editor.aiDraft.methodBankBlock")}\n${short}`;
      }
      let knowledgeBlock = "";
      if (db && vaultPath) {
        try {
          interface ScoredChunkDto {
            text: string;
            source: string;
            page: number | null;
          }
          const chunks = await tauriInvoke<ScoredChunkDto[]>("subject_db_query", {
            vaultPath,
            subject: db,
            grade: dbGrade ?? null,
            topic: dbTopic ?? null,
            query: `${topic.trim()} ${focus.trim()}`.trim(),
            topK: 6,
          });
          if (chunks && chunks.length > 0) {
            const parts = chunks.map(
              (c) => `[${c.source}${c.page != null ? `, S. ${c.page}` : ""}]\n${c.text}`,
            );
            knowledgeBlock =
              `\n\n${t("editor.aiDraft.knowledgeBlock", { name: db })}\n${parts.join("\n\n---\n\n")}`;
          }
        } catch (e) {
          console.error("draft knowledge query failed:", e);
        }
      }
      const userPrompt =
        t("editor.aiDraft.userPrompt", {
          topic: topic.trim(),
          grade: grade.trim() || t("editor.aiDraft.gradeFallback"),
          duration: String(duration),
          focus: focus.trim() || t("editor.aiDraft.focusFallback"),
        }) + methodBankBlock + knowledgeBlock;
      const value = await tauriInvoke<DraftResult>("ai_structured", {
        requestId: `draft-${Date.now()}`,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        schema: DRAFT_SCHEMA,
        temperature: 0.7,
        maxTokens: 4096,
      });
      const phases = Array.isArray(value.phases)
        ? value.phases
            .map((p: Partial<DraftPhase>) => ({
              time: String(p.time ?? ""),
              phase: String(p.phase ?? ""),
              teachingArrangement: String(p.teachingArrangement ?? ""),
              socialForm: String(p.socialForm ?? ""),
              media: String(p.media ?? ""),
            }))
            .filter((p: DraftPhase) => p.phase && p.teachingArrangement)
            .slice(0, 12)
        : [];
      if (!phases.length) {
        throw new Error(t("editor.chat.noResponse"));
      }
      setResult({
        title: String(value.title ?? topic.trim()),
        objectives: Array.isArray(value.objectives)
          ? value.objectives.map(String).filter((o: string) => o.trim()).slice(0, 6)
          : [],
        phases,
      });
    } catch (e) {
      setError(t("editor.aiDraft.failed", { error: String(e) }));
    } finally {
      setBusy(false);
    }
  };

  const insert = () => {
    if (!editor || !result) return;
    const colWidths = [80, 120, 350, 140, 150];
    const cell = (width: number, text: string) => ({
      type: "tableCell",
      attrs: { colwidth: [width] },
      content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : [] }],
    });
    editor
      .chain()
      .focus()
      .insertContent({
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              { type: "tableHeader", attrs: { colwidth: [colWidths[0]] }, content: [{ type: "paragraph", content: [{ type: "text", text: t("editor.table.time") }] }] },
              { type: "tableHeader", attrs: { colwidth: [colWidths[1]] }, content: [{ type: "paragraph", content: [{ type: "text", text: t("editor.table.phase") }] }] },
              { type: "tableHeader", attrs: { colwidth: [colWidths[2]] }, content: [{ type: "paragraph", content: [{ type: "text", text: t("editor.table.lta") }] }] },
              { type: "tableHeader", attrs: { colwidth: [colWidths[3]] }, content: [{ type: "paragraph", content: [{ type: "text", text: t("editor.table.socialForm") }] }] },
              { type: "tableHeader", attrs: { colwidth: [colWidths[4]] }, content: [{ type: "paragraph", content: [{ type: "text", text: t("editor.table.media") }] }] },
            ],
          },
          ...result.phases.map((p) => ({
            type: "tableRow",
            content: [
              cell(colWidths[0], p.time),
              cell(colWidths[1], p.phase),
              cell(colWidths[2], p.teachingArrangement),
              cell(colWidths[3], p.socialForm),
              cell(colWidths[4], p.media),
            ],
          })),
        ],
      })
      .run();
    if (result.objectives.length > 0) {
      editor
        .chain()
        .focus()
        .insertContent({
          type: "bulletList",
          content: result.objectives.map((o) => ({
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: o }] }],
          })),
        })
        .run();
    }
    onClose();
  };

  const inputStyle = {
    background: "var(--tp-panel-muted)",
    borderColor: "var(--tp-border-strong)",
    color: "var(--tp-text-primary)",
  };

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.55)" }}>
      <div
        className="w-[720px] max-w-[94vw] max-h-[90vh] overflow-y-auto rounded-xl border shadow-2xl p-6"
        style={{ background: "var(--tp-panel-elevated)", borderColor: "var(--tp-border-strong)", color: "var(--tp-text-primary)" }}
      >
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[var(--tp-accent)]" />
          <span className="flex-1 text-sm font-semibold text-[var(--tp-text-primary)]">
            {t("editor.aiDraft.title")}
          </span>
          <button
            onClick={onClose}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--tp-text-muted)] hover:bg-[var(--tp-bg-4)] hover:text-[var(--tp-t-1)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-[13px] font-medium" style={{ color: "var(--tp-t-4)" }}>
            {t("editor.aiDraft.topic")}
            <input
              className="tp-input mt-1"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={t("editor.aiDraft.topicPlaceholder")}
              style={inputStyle}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-[13px] font-medium" style={{ color: "var(--tp-t-4)" }}>
              {t("editor.aiDraft.grade")}
              <input
                className="tp-input mt-1"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                placeholder={t("editor.aiDraft.gradePlaceholder")}
                style={inputStyle}
              />
            </label>
            <label className="text-[13px] font-medium" style={{ color: "var(--tp-t-4)" }}>
              {t("editor.aiDraft.duration")}
              <select
                className="tp-input mt-1"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                style={inputStyle}
              >
                <option value={45}>45 min</option>
                <option value={60}>60 min</option>
                <option value={90}>90 min</option>
                <option value={135}>135 min</option>
              </select>
            </label>
          </div>
          <label className="text-[13px] font-medium" style={{ color: "var(--tp-t-4)" }}>
            {t("editor.aiDraft.focus")}
            <textarea
              className="tp-input mt-1 min-h-[64px] resize-none"
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              placeholder={t("editor.aiDraft.focusPlaceholder")}
              style={inputStyle}
            />
          </label>
          {db && (
            <div className="inline-flex items-center gap-1.5 text-[12.5px]" style={{ color: "var(--tp-t-4)" }}>
              <Database className="w-3 h-3 shrink-0 text-[var(--tp-accent)]" />
              {t("editor.aiDraft.usingDb", {
                name: `${db}${dbGrade ? ` > ${dbGrade}` : ""}${dbTopic ? ` > ${dbTopic}` : ""}`,
              })}
            </div>
          )}

          {subjectDatabases.length > 0 ? (
            <div>
              <span className="text-[13px] font-medium" style={{ color: "var(--tp-text-secondary)" }}>
                {t("editor.aiDraft.kbLabel")}
              </span>
              <div className="mt-1 grid grid-cols-3 gap-2">
                <select
                  className="tp-input"
                  value={db ?? ""}
                  onChange={(e) => {
                    setDb(e.target.value || null);
                    setDbGrade(null);
                    setDbTopic(null);
                  }}
                >
                  <option value="">{t("subjectDb.noDbSelected")}</option>
                  {subjectDatabases.map((s) => (
                    <option key={s.subject} value={s.subject}>
                      {s.subject}
                    </option>
                  ))}
                </select>
                <select
                  className="tp-input"
                  value={dbGrade ?? ""}
                  disabled={!db}
                  onChange={(e) => {
                    setDbGrade(e.target.value || null);
                    setDbTopic(null);
                  }}
                >
                  <option value="">{t("editor.aiDraft.allGrades")}</option>
                  {db &&
                    subjectDatabases
                      .find((s) => s.subject === db)
                      ?.grades.map((g) => (
                        <option key={g.name} value={g.name}>
                          {g.name}
                        </option>
                      ))}
                </select>
                <select
                  className="tp-input"
                  value={dbTopic ?? ""}
                  disabled={!dbGrade}
                  onChange={(e) => setDbTopic(e.target.value || null)}
                >
                  <option value="">{t("editor.aiDraft.allTopics")}</option>
                  {db &&
                    dbGrade &&
                    subjectDatabases
                      .find((s) => s.subject === db)
                      ?.grades.find((g) => g.name === dbGrade)
                      ?.topics.filter((tp) => tp.chunk_count > 0)
                      .map((tp) => (
                        <option key={tp.name} value={tp.name}>
                          {tp.name} ({tp.chunk_count})
                        </option>
                      ))}
                </select>
              </div>
            </div>
          ) : (
            <div>
              <span className="text-[13px] font-medium" style={{ color: "var(--tp-text-secondary)" }}>
                {t("editor.aiDraft.kbLabel")}
              </span>
              <div className="mt-1 text-[12.5px]" style={{ color: "var(--tp-text-muted)" }}>
                {t("editor.aiDraft.noKb")}
              </div>
            </div>
          )}

          <button
            className="tp-btn inline-flex items-center justify-center gap-2"
            disabled={busy || !topic.trim()}
            onClick={() => void generate()}
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {busy ? t("editor.aiDraft.generating") : result ? t("editor.aiDraft.regenerate") : t("editor.aiDraft.generate")}
          </button>

          {error && (
            <div className="rounded-md px-3 py-2 text-[12.5px]" style={{ background: "var(--tp-bg-2)", border: "1px solid var(--tp-b-2)", color: "#f87171" }}>
              {error}
            </div>
          )}

          {result && (
            <div className="rounded-lg border p-3" style={{ borderColor: "var(--tp-border-strong)", background: "var(--tp-bg-2)" }}>
              <div className="text-[13px] font-semibold text-[var(--tp-text-primary)]">{result.title}</div>
              {result.objectives.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-[12.5px] text-[var(--tp-text-secondary)]">
                  {result.objectives.map((o, i) => (
                    <li key={`obj-${i}`}>{o}</li>
                  ))}
                </ul>
              )}
              <table className="mt-3 w-full text-[11px]" style={{ color: "var(--tp-text-primary)" }}>
                <thead>
                  <tr style={{ color: "var(--tp-t-4)" }}>
                    <th className="py-1 pr-2 text-left font-medium">{t("editor.table.time")}</th>
                    <th className="py-1 pr-2 text-left font-medium">{t("editor.table.phase")}</th>
                    <th className="py-1 pr-2 text-left font-medium">{t("editor.table.lta")}</th>
                    <th className="py-1 pr-2 text-left font-medium">{t("editor.table.socialForm")}</th>
                    <th className="py-1 text-left font-medium">{t("editor.table.media")}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.phases.map((p, i) => (
                    <tr key={`ph-${i}`} style={{ borderTop: "1px solid var(--tp-b-1)" }}>
                      <td className="py-1 pr-2 align-top whitespace-nowrap">{p.time}</td>
                      <td className="py-1 pr-2 align-top">{p.phase}</td>
                      <td className="py-1 pr-2 align-top">{p.teachingArrangement}</td>
                      <td className="py-1 pr-2 align-top">{p.socialForm}</td>
                      <td className="py-1 align-top">{p.media}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result && (
            <button
              className="tp-btn inline-flex items-center justify-center gap-2"
              style={{ background: "var(--tp-accent)", color: "#fff" }}
              onClick={insert}
            >
              {t("editor.aiDraft.insert")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
