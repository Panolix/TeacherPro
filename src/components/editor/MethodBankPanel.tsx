import { useEffect, useState } from "react";
import { BookOpen, X } from "lucide-react";
import { useTranslation } from "../../i18n/useTranslation";
import { METHOD_TYPE_ACCENT } from "../../utils/methodBank";
import type { MethodBankItem, MethodBankType } from "../../utils/methodBank";

interface Props {
  open: boolean;
  onClose: () => void;
  loading: boolean;
  error: string | null;
  items: MethodBankItem[];
  onInsert: (item: MethodBankItem) => void;
}

/** Slide-in Method Bank browser with search, type filters and insertion. */
export function MethodBankPanel({ open, onClose, loading, error, items, onInsert }: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<MethodBankType | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const normalizedSearch = search.trim().toLowerCase();
  const filtered = items.filter((entry) => {
    if (typeFilter && entry.type !== typeFilter) {
      return false;
    }
    if (!normalizedSearch) {
      return true;
    }
    const searchable = `${entry.title}\n${entry.summary}\n${entry.description}\n${entry.duration}\n${entry.tags.join(" ")}`.toLowerCase();
    return searchable.includes(normalizedSearch);
  });

  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedId(null);
      return;
    }
    const hasSelected = filtered.some((entry) => entry.id === selectedId);
    if (!hasSelected) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId]);

  const selectedItem = selectedId
    ? filtered.find((entry) => entry.id === selectedId) || null
    : null;

  const getTypeLabel = (type: MethodBankType): string => {
    if (type === "phase") return t("editor.methodBank.phase");
    if (type === "socialForm") return t("editor.methodBank.social");
    return t("editor.methodBank.method");
  };

  return (
      <div
        className={`fixed left-0 top-0 bottom-0 z-[200] w-[336px] max-w-[336px] print:hidden flex flex-col transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col border-r border-[var(--tp-border-strong)] bg-[var(--tp-panel-elevated)] shadow-2xl">
          <div className="flex shrink-0 items-center gap-2 border-b border-[var(--tp-border-strong)] px-3 py-2">
            <BookOpen className="h-3.5 w-3.5 shrink-0 text-[var(--tp-accent)]" />
            <span className="flex-1 truncate text-sm font-semibold text-[var(--tp-text-primary)]">{t("editor.panels.methodBank")}</span>
            <button
              onClick={() => onClose()}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--tp-text-muted)] hover:bg-[var(--tp-bg-4)] hover:text-[var(--tp-t-1)]"
              title={t("editor.panels.closeMethodBank")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="shrink-0 space-y-2 border-b border-[var(--tp-border-strong)] bg-[var(--tp-panel-muted)] px-3 py-3">
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("editor.methodBank.searchMethods")}
              className="h-9 w-full rounded-md border border-[var(--tp-border-strong)] bg-[var(--tp-panel-elevated)] px-3 text-sm text-[var(--tp-text-primary)] outline-none placeholder:text-[var(--tp-text-muted)] focus:border-[var(--tp-accent)]"
            />
            <div className="flex flex-wrap gap-1.5">
              {([
                { key: "phase", label: t("editor.methodBank.phase") },
                { key: "socialForm", label: t("editor.methodBank.social") },
                { key: "method", label: t("editor.methodBank.method") },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setTypeFilter((previous) => (previous === key ? null : key))}
                  className={`rounded-full border px-3 py-1 text-[12.5px] font-medium transition-colors ${
                    typeFilter === key
                      ? "border-[var(--tp-accent)] bg-[var(--tp-accent)]/20 text-[var(--tp-accent)]"
                      : "border-[var(--tp-border-strong)] text-[var(--tp-text-muted)] hover:bg-[var(--tp-bg-4)] hover:text-[var(--tp-t-1)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--tp-app-bg)] py-3 pl-3 pr-2 [scrollbar-gutter:stable] [scrollbar-width:thin] [scrollbar-color:#3a3a3a_#161616] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-[#161616] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#3a3a3a]">
            {loading && (
              <p className="text-[12.5px] text-[var(--tp-text-muted)]">{t("editor.methodBank.loading")}</p>
            )}

            {!loading && error && (
              <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-200">
                {error}
              </p>
            )}

            {!loading && !error && filtered.length === 0 && (
              <p className="text-[12.5px] text-[var(--tp-text-muted)]">{t("editor.methodBank.noMethodsMatch")}</p>
            )}

            {!loading && !error && filtered.length > 0 && (
              <div className="space-y-1.5">
                {filtered.map((entry) => {
                  const isSelected = selectedId === entry.id;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      draggable={false}
                      onClick={() => setSelectedId(entry.id)}
                      onDoubleClick={() => onInsert(entry)}
                      title={entry.title}
                      className={`w-full rounded-md border px-2 py-2 text-left transition-colors ${
                        isSelected
                          ? "border-[var(--tp-accent)] bg-[var(--tp-accent)]/15"
                          : "border-[var(--tp-border-strong)] bg-[var(--tp-panel-elevated)] hover:bg-[var(--tp-bg-4)] hover:border-[var(--tp-accent)]/60"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-[13px] font-semibold text-[var(--tp-text-primary)]">
                            {entry.title}
                          </p>
                          <span className={`shrink-0 text-[11px] font-medium ${METHOD_TYPE_ACCENT[entry.type]}`}>
                            {getTypeLabel(entry.type)}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-[12px] text-[var(--tp-text-muted)]">
                          {entry.summary}
                        </p>
                        <p className="mt-1 text-[11px] text-[var(--tp-text-muted)]">{entry.duration}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-[var(--tp-border-strong)] bg-[var(--tp-panel-muted)] p-3">
            {selectedItem ? (
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-[var(--tp-text-primary)]">{selectedItem.title}</p>
                  <span className={`text-[12px] font-medium ${METHOD_TYPE_ACCENT[selectedItem.type]}`}>
                    {getTypeLabel(selectedItem.type)}
                  </span>
                </div>
                <p className="text-[12px] leading-relaxed text-[var(--tp-text-muted)]">{selectedItem.description}</p>
                <div className="flex flex-wrap gap-1">
                  {selectedItem.tags.map((tag) => (
                    <span
                      key={`${selectedItem.id}-${tag}`}
                      className="rounded-full border border-[var(--tp-border-strong)] px-2 py-0.5 text-[11px] text-[var(--tp-text-muted)]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
  );
}