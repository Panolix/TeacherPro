import { useState, useEffect, useCallback } from "react";
import { BrainCircuit, Plus, Trash2, RefreshCw, FileText, Loader2, CheckCircle2, AlertCircle, FolderPlus } from "lucide-react";
import { useKnowledgeStore } from "./knowledgeStore";
import { useTranslation } from "../i18n/useTranslation";

export function KnowledgePanel() {
  const { t } = useTranslation();
  const {
    sources, categories, isIndexing, importProgress, loadIndex,
    addSource, removeSource, reindexAll, addCategory,
    selectedSourceId, setSelectedSource,
    enabledInChat, chatCategoryFilter, setChatCategoryFilter,
  } = useKnowledgeStore();

  const [selectedCategory, setSelectedCategory] = useState(categories[0]?.id || "allgemein");
  const [newCategoryMode, setNewCategoryMode] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  useEffect(() => {
    void loadIndex();
  }, [loadIndex]);

  const handleAdd = useCallback((category?: string) => {
    void addSource(category);
  }, [addSource]);

  const handleRemove = useCallback((id: string) => {
    void removeSource(id);
  }, [removeSource]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "indexed": return <CheckCircle2 className="w-3 h-3 text-emerald-400" />;
      case "indexing": return <Loader2 className="w-3 h-3 text-amber-400 animate-spin" />;
      case "error": return <AlertCircle className="w-3 h-3 text-red-400" />;
      default: return <FileText className="w-3 h-3" style={{ color: "var(--tp-t-4)" }} />;
    }
  };

  const totalChunks = sources.reduce((s, src) => s + src.chunkCount, 0);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 px-3 pt-3 pb-2 flex gap-2">
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="tp-input text-[12px] flex-1 min-w-0"
          style={{ height: 36, padding: "0 8px" }}
        >
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
        <button
          onClick={() => handleAdd(selectedCategory)}
          disabled={isIndexing}
          className="tp-action-btn h-9 w-9 inline-flex items-center justify-center rounded-md shrink-0"
          style={{ background: "var(--tp-accent)", color: "#fff" }}
          title={t("knowledge.addSource")}
        >
          {isIndexing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Plus className="w-3.5 h-3.5" />
          )}
        </button>
        <button
          onClick={() => setNewCategoryMode(true)}
          className="tp-action-btn h-9 w-9 inline-flex items-center justify-center rounded-md shrink-0"
          style={{ background: "var(--tp-bg-3)", color: "var(--tp-t-2)" }}
          title="Neue Kategorie"
        >
          <FolderPlus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* New Category Input */}
      {newCategoryMode && (
        <div className="mx-3 mb-2 flex gap-1">
          <input
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newCategoryName.trim()) {
                addCategory(newCategoryName.trim());
                setSelectedCategory(newCategoryName.trim().toLowerCase().replace(/\s+/g, "-"));
                setNewCategoryName("");
                setNewCategoryMode(false);
              }
            }}
            className="tp-input flex-1 text-[12px]"
            placeholder="Neue Kategorie"
            style={{ height: 28, padding: "0 8px" }}
            autoFocus
          />
          <button
            onClick={() => { setNewCategoryMode(false); setNewCategoryName(""); }}
            className="h-7 w-7 flex items-center justify-center rounded text-[var(--tp-t-4)] hover:text-[var(--tp-t-1)]"
          >
            X
          </button>
        </div>
      )}

      {/* Import Progress */}
      {importProgress && (
        <div className="mx-3 mb-2 p-2 rounded-md text-[11px]" style={{ background: "var(--tp-bg-3)" }}>
          <div className="flex items-center gap-1.5 text-[var(--tp-t-2)] mb-1">
            <Loader2 className="w-3 h-3 animate-spin shrink-0" />
            <span className="truncate">{importProgress.sourceName}</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-[var(--tp-t-4)]">
            <span>{t("knowledge.file")} {importProgress.current}/{importProgress.total}</span>
            <span>·</span>
            <span>
              {importProgress.stage === "extracting" && t("knowledge.extracting")}
              {importProgress.stage === "chunking" && t("knowledge.chunking")}
              {importProgress.stage === "embedding" && t("knowledge.embedding")}
            </span>
          </div>
          <div className="mt-1.5 w-full h-1.5 rounded-full overflow-hidden" style={{ background: "var(--tp-bg-2)" }}>
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.round((importProgress.current / importProgress.total) * 100)}%`,
                background: "var(--tp-accent)",
              }}
            />
          </div>
        </div>
      )}

      {/* Category Filter */}
      {enabledInChat && categories.length > 0 && (
        <div className="mx-3 mb-2 flex flex-wrap gap-1">
          <button
            onClick={() => setChatCategoryFilter(null)}
            className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${
              chatCategoryFilter === null ? "bg-[var(--tp-accent)] text-white" : ""
            }`}
            style={{ background: chatCategoryFilter === null ? "var(--tp-accent)" : "var(--tp-bg-3)", color: "var(--tp-t-2)" }}
          >
            {t("common.all")}
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setChatCategoryFilter(chatCategoryFilter === cat.id ? null : cat.id)}
              className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${
                chatCategoryFilter === cat.id ? "bg-[var(--tp-accent)] text-white" : ""
              }`}
              style={{ background: chatCategoryFilter === cat.id ? "var(--tp-accent)" : "var(--tp-bg-3)", color: "var(--tp-t-2)" }}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Sources List */}
      <div className="flex-1 overflow-y-auto px-3 pb-2" style={{ minHeight: 0 }}>
        {sources.length === 0 && !isIndexing && (
          <div className="text-center py-8 text-[12px]" style={{ color: "var(--tp-t-4)" }}>
            <BrainCircuit className="w-8 h-8 mx-auto mb-2 opacity-40" />
            {t("knowledge.empty")}
          </div>
        )}
        <ul className="space-y-0.5">
          {sources.map((src) => (
            <li
              key={src.id}
              onClick={() => setSelectedSource(selectedSourceId === src.id ? null : src.id)}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-[12px] transition-colors ${
                selectedSourceId === src.id ? "bg-[var(--tp-bg-3)]" : "hover:bg-[var(--tp-bg-3)]"
              }`}
              style={{ color: "var(--tp-t-1)" }}
            >
              {getStatusIcon(src.status)}
              <span className="flex-1 truncate">{src.name}</span>
              <span className="text-[10px]" style={{ color: "var(--tp-t-4)" }}>
                {src.chunkCount > 0 ? `${src.chunkCount}` : ""}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); handleRemove(src.id); }}
                className="p-0.5 rounded hover:bg-[var(--tp-bg-2)]"
                style={{ color: "var(--tp-t-4)" }}
                title={t("common.remove")}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Status Footer */}
      <div className="shrink-0 border-t px-3 py-2" style={{ borderColor: "var(--tp-b-1)", background: "var(--tp-bg-2)" }}>
        <div className="flex items-center justify-between text-[10px]" style={{ color: "var(--tp-t-4)" }}>
          <span>
            {sources.length} {t("knowledge.sources")} · {totalChunks} {t("knowledge.chunks")}
          </span>
          <button
            onClick={() => void reindexAll()}
            disabled={isIndexing}
            className="flex items-center gap-1 hover:text-[var(--tp-t-1)] transition-colors"
          >
            <RefreshCw className={`w-3 h-3 ${isIndexing ? "animate-spin" : ""}`} />
            {t("settings.ai.refresh")}
          </button>
        </div>
      </div>
    </div>
  );
}
