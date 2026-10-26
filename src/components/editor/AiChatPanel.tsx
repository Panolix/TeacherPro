import { useEffect, useRef } from "react";
import {
  Brain,
  MessageSquare,
  Send,
  Sparkles,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { useTranslation } from "../../i18n/useTranslation";
import type { SubjectDbInfo } from "../../store";
import { ChatContextBar } from "../ChatContextBar";
import { AiMarkdown } from "./AiMarkdown";
import { SubjectDbPicker, type SubjectDbScope } from "./SubjectDbPicker";

export interface AiChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  thinking?: string;
  citations?: { source: string; page: number }[];
  timestamp: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  messages: AiChatMessage[];
  onClearMessages: () => void;
  input: string;
  onInputChange: (value: string) => void;
  onSend: (prompt?: string) => void;
  busy: boolean;
  modelId: string;
  thinkingEnabled: boolean;
  onToggleThinking: () => void;
  modelSupportsThinking: boolean;
  expandedThinking: Set<string>;
  onToggleThinkingMessage: (id: string) => void;
  subjectDatabases: SubjectDbInfo[];
  activeDb: string | null;
  activeGrade: string | null;
  activeTopic: string | null;
  activeFile: string | null;
  onSelectDb: (scope: SubjectDbScope) => void;
  streaming: boolean;
  onStopStreaming: () => void;
  onOpenDraftGenerator: () => void;
}

/** Slide-in AI chat panel (lesson-aware chat with RAG context selector). */
export function AiChatPanel({
  open,
  onClose,
  messages,
  onClearMessages,
  input,
  onInputChange,
  onSend,
  busy,
  modelId,
  thinkingEnabled,
  onToggleThinking,
  modelSupportsThinking,
  expandedThinking,
  onToggleThinkingMessage,
  subjectDatabases,
  activeDb,
  activeGrade,
  activeTopic,
  activeFile,
  onSelectDb,
  streaming,
  onStopStreaming,
  onOpenDraftGenerator,
}: Props) {
  const { t } = useTranslation();
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    requestAnimationFrame(() => {
      chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
    });
  }, [open, messages, busy]);

  return (
      <div
        inert={!open}
        aria-hidden={!open}
        role="dialog"
        aria-label={t("editor.panels.aiChat")}
        className={`fixed left-0 top-0 bottom-0 z-[200] w-[336px] max-w-[336px] print:hidden flex flex-col transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
          <div className="flex flex-col h-full border-r border-[var(--tp-border-strong)] bg-[var(--tp-panel-elevated)] shadow-2xl">
            {/* Header */}
            <div className="flex shrink-0 items-center gap-2 border-b border-[var(--tp-border-strong)] px-3 py-2">
              <MessageSquare className="w-3.5 h-3.5 shrink-0 text-[var(--tp-accent)]" />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--tp-text-primary)]">
                {t("editor.panels.aiChat")}
              </span>
              <span className="inline-flex max-w-[112px] shrink items-center truncate rounded-full bg-[var(--tp-panel-muted)] px-2 py-0.5 text-[11px] font-medium text-[var(--tp-text-muted)]">
                {modelId}
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={onOpenDraftGenerator}
                  title={t("editor.aiDraft.title")}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--tp-accent)] hover:bg-[var(--tp-bg-4)]"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onClearMessages()}
                  title={t("editor.panels.clearChatHistory")}
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                    messages.length > 0
                      ? "text-[var(--tp-text-muted)] hover:bg-[var(--tp-bg-4)] hover:text-red-400"
                      : "text-[var(--tp-border-strong)] cursor-default pointer-events-none"
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    if (modelSupportsThinking) {
                      onToggleThinking();
                    }
                  }}
                  title={
                    !modelSupportsThinking
                      ? t("editor.chat.thinkingUnsupported")
                      : thinkingEnabled
                        ? t("editor.chat.thinkingEnabled")
                        : t("editor.chat.thinkingDisabled")
                  }
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                    modelSupportsThinking && thinkingEnabled
                      ? "text-[var(--tp-accent)] hover:bg-[var(--tp-bg-4)]"
                      : modelSupportsThinking
                        ? "text-[var(--tp-text-muted)] hover:bg-[var(--tp-bg-4)]"
                        : "text-[var(--tp-border-strong)] cursor-not-allowed"
                  }`}
                  aria-disabled={!modelSupportsThinking}
                >
                  <Brain className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onClose()}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--tp-text-muted)] hover:bg-[var(--tp-bg-4)] hover:text-[var(--tp-t-1)]"
                  title={t("editor.panels.closeAiChat")}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Knowledge-base scope picker (shared with the lesson-draft dialog) */}
            {subjectDatabases.length > 0 && (
              <div className="shrink-0 border-b border-[var(--tp-border-strong)] px-3 py-1.5">
                <SubjectDbPicker
                  databases={subjectDatabases}
                  value={{ subject: activeDb, grade: activeGrade, topic: activeTopic, file: activeFile }}
                  onChange={onSelectDb}
                />
              </div>
            )}

            {/* Token Context Bar */}
            <ChatContextBar />

            {/* Messages */}
            <div
              ref={chatScrollRef}
              role="log"
              aria-live="polite"
              aria-relevant="additions"
              className="flex-1 overflow-y-auto bg-[var(--tp-app-bg)] px-4 py-4 space-y-4 [scrollbar-width:thin] [scrollbar-color:#3a3a3a_#161616] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-[#161616] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#3a3a3a]"
            >
              {messages.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center gap-4">
                  <p className="text-[12.5px] text-[var(--tp-text-muted)] text-center max-w-xs leading-relaxed">
                    {t("editor.panels.messageAi")}
                  </p>
                  <div className="flex flex-col gap-1.5 w-full">
                    {([
                      { label: t("editor.chat.summarize"), prompt: t("editor.chat.promptSummarize") },
                      { label: t("editor.chat.keyThemes"), prompt: t("editor.chat.promptKeyThemes") },
                      { label: t("editor.chat.checkObjectives"), prompt: t("editor.chat.promptCheckObjectives") },
                      { label: t("editor.chat.suggestImprovements"), prompt: t("editor.chat.promptSuggestImprovements") },
                      { label: t("editor.chat.activityIdeas"), prompt: t("editor.chat.promptActivityIdeas") },
                    ] as const).map(({ label, prompt }) => (
                      <button
                        key={label}
                        disabled={busy}
                        onClick={() => void onSend(prompt)}
                        className="w-full text-left px-3 py-2 rounded-lg border border-[var(--tp-border-strong)] bg-[var(--tp-panel-muted)] text-[12.5px] text-gray-300 hover:bg-[var(--tp-bg-4)] hover:text-[var(--tp-t-1)] disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((message) => (
                <div key={message.id} className="w-full">
                  {message.role === "user" ? (
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-[var(--tp-accent)] px-3.5 py-2 text-[13px] leading-relaxed text-white whitespace-pre-wrap">
                        {message.text}
                      </div>
                    </div>
                  ) : (
                    <div className="w-full">
                      <div className="mb-1 flex items-center gap-1.5">
                        <MessageSquare className="w-3 h-3 text-[var(--tp-accent)]" />
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--tp-accent)] opacity-70">AI</span>
                      </div>
                      <div className="w-full text-[13px] leading-relaxed text-[var(--tp-text-primary)]">
                        <AiMarkdown text={message.text} />
                      </div>
                      {message.citations && message.citations.length > 0 && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] font-medium text-[var(--tp-text-muted)]">
                            {t("editor.chat.sources")}:
                          </span>
                          {message.citations.map((c, i) => (
                            <span
                              key={`${c.source}-${c.page}-${i}`}
                              title={c.source}
                              className="inline-flex max-w-full items-center truncate rounded-full bg-[var(--tp-panel-muted)] px-2 py-0.5 text-[11px] text-[var(--tp-text-muted)]"
                            >
                              {c.source}, S.{c.page}
                            </span>
                          ))}
                        </div>
                      )}
                      {message.thinking != null && (
                        <div className="mt-2">
                          <button
                            onClick={() => {
                              onToggleThinkingMessage(message.id);
                            }}
                            className="flex items-center gap-1.5 text-[11px] text-[var(--tp-text-muted)] hover:text-[var(--tp-t-1)]"
                          >
                            <Brain className="w-3 h-3" />
                            {expandedThinking.has(message.id) ? t("editor.chat.hideThinking") : t("editor.chat.showThinking")}
                          </button>
                          {expandedThinking.has(message.id) && (
                            <div className="mt-1.5 rounded-md bg-[var(--tp-panel-muted)] px-3 py-2 text-[11px] text-[var(--tp-text-muted)] leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto">
                              {message.thinking}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {busy && (
                <div className="w-full">
                  <div className="mb-1 flex items-center gap-1.5">
                    <MessageSquare className="w-3 h-3 text-[var(--tp-accent)]" />
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--tp-accent)] opacity-70">AI</span>
                  </div>
                  <div className="flex items-center gap-2 py-1">
                    {streaming ? (
                      <button
                        onClick={onStopStreaming}
                        title={t("editor.chat.stopGenerating")}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--tp-border-strong)] bg-[var(--tp-panel-muted)] px-2.5 py-1 text-[11px] text-[var(--tp-text-primary)] hover:bg-[var(--tp-bg-4)] transition-colors"
                      >
                        <Square className="w-2.5 h-2.5 fill-current" />
                        {t("editor.chat.stopGenerating")}
                      </button>
                    ) : (
                      <div className="flex items-center gap-1.5 py-1">
                        <span className="inline-block w-2 h-2 rounded-full bg-[var(--tp-text-muted)] animate-bounce [animation-delay:0ms]" />
                        <span className="inline-block w-2 h-2 rounded-full bg-[var(--tp-text-muted)] animate-bounce [animation-delay:150ms]" />
                        <span className="inline-block w-2 h-2 rounded-full bg-[var(--tp-text-muted)] animate-bounce [animation-delay:300ms]" />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Input bar */}
            <div className="shrink-0 border-t border-[var(--tp-border-strong)] bg-[var(--tp-panel-elevated)] px-3 py-3">
              <div className="flex items-center gap-2 rounded-xl border border-[var(--tp-border-strong)] bg-[var(--tp-panel-muted)] px-3 py-2 focus-within:border-[var(--tp-accent)]">
                <textarea
                  value={input}
                  aria-label={t("editor.panels.messageAi")}
                  onChange={(event) => onInputChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      if (!busy) void onSend();
                    }
                  }}
                  placeholder={t("editor.panels.messageAi")}
                  rows={1}
                  className="flex-1 min-h-[24px] max-h-32 resize-none bg-transparent text-sm text-[var(--tp-text-primary)] placeholder:text-[var(--tp-text-muted)] outline-none leading-6"
                  style={{ fieldSizing: "content" } as React.CSSProperties}
                />
                <button
                  onClick={() => { void onSend(); }}
                  disabled={busy || !input.trim()}
                  className="h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-lg bg-[var(--tp-accent)] text-white hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
                  title={busy ? t("editor.panels.aiIsResponding") : t("editor.panels.send")}
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="mt-1.5 text-center text-[11px] text-[var(--tp-text-muted)]">{t("editor.panels.enterToSend")}</p>
            </div>
          </div>
      </div>
  );
}
