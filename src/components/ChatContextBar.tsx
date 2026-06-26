import { BarChart3 } from "lucide-react";
import { useAppStore } from "../store";
import { useTranslation } from "../i18n/useTranslation";

const BAR_COLORS: Record<string, string> = {
  lesson: "bg-blue-400",
  history: "bg-amber-400",
  rag: "bg-emerald-400",
  system: "bg-violet-400",
  free: "bg-gray-600",
};

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export function ChatContextBar() {
  const { t } = useTranslation();
  const { chatContextBudget } = useAppStore();

  if (!chatContextBudget) return null;

  const { totalTokens, usedByLesson, usedByHistory, usedByRag, usedBySystem, freeTokens } = chatContextBudget;
  const used = usedByLesson + usedByHistory + usedByRag + usedBySystem;
  const pct = totalTokens > 0 ? Math.min(100, Math.round((used / totalTokens) * 100)) : 0;

  const segments: Array<{ key: string; label: string; value: number; color: string }> = [];
  if (usedByLesson > 0) segments.push({ key: "lesson", label: t("editor.chat.contextLesson"), value: usedByLesson, color: BAR_COLORS.lesson });
  if (usedByHistory > 0) segments.push({ key: "history", label: t("editor.chat.contextHistory"), value: usedByHistory, color: BAR_COLORS.history });
  if (usedByRag > 0) segments.push({ key: "rag", label: t("editor.chat.contextRag"), value: usedByRag, color: BAR_COLORS.rag });
  if (usedBySystem > 0) segments.push({ key: "system", label: t("editor.chat.contextSystem"), value: usedBySystem, color: BAR_COLORS.system });

  const totalWidth = Math.max(1, used);

  return (
    <div className="px-3 py-1.5 border-b border-[var(--tp-border-strong)] bg-[var(--tp-panel-muted)/50]">
      {/* Bar */}
      <div className="flex items-center gap-2 text-[10px] text-[var(--tp-text-muted)]">
        <BarChart3 className="w-3 h-3 shrink-0 text-[var(--tp-text-muted)]" />
        <div className="flex-1 h-2 rounded-full bg-gray-700 overflow-hidden flex">
          {segments.map((seg) => (
            <div
              key={seg.key}
              className={`h-full ${seg.color} transition-all duration-300`}
              style={{ width: `${(seg.value / totalWidth) * 100}%` }}
              title={`${seg.key}: ${formatTokens(seg.value)}`}
            />
          ))}
          {freeTokens > 0 && (
            <div
              className="h-full bg-gray-600"
              style={{ width: `${(freeTokens / totalWidth) * 100}%` }}
              title={`free: ${formatTokens(freeTokens)}`}
            />
          )}
        </div>
        <span className="shrink-0 whitespace-nowrap">
          {formatTokens(used)}/{formatTokens(totalTokens)} ({pct}%)
        </span>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
        {segments.map((seg) => (
          <span key={seg.key} className="flex items-center gap-1 text-[9px] text-[var(--tp-text-muted)]">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${seg.color}`} />
            <span>{seg.label}</span>
          </span>
        ))}
        {freeTokens > 0 && (
          <span className="flex items-center gap-1 text-[9px] text-[var(--tp-text-muted)]">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-600" />
            <span>{t("editor.chat.contextFree")}</span>
          </span>
        )}
      </div>
    </div>
  );
}
