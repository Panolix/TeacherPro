import { useState, useEffect } from "react";
import {
  X,
  Settings as SettingsIcon,
  FileText,
  Sparkles,
  HardDrive,
  SlidersHorizontal,
  Save,
  Minus,
  Plus,
  HardDriveDownload,
  Loader2,
  CheckCircle2,
  Database,
  Trash2,
  Gauge,
  Languages,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { AI_CONTEXT_SIZES, useAppStore, type AccentColor } from "../store";
import { useTranslation } from "../i18n/useTranslation";
import { SubjectDbManager } from "./SubjectDbManager";

const ACCENT_OPTIONS: Array<{ value: AccentColor; label: string; labelKey: string; color: string }> = [
  { value: "blue", label: "Blue", labelKey: "settings.accentLabels.blue", color: "#2d86a5" },
  { value: "emerald", label: "Emerald", labelKey: "settings.accentLabels.emerald", color: "#22c55e" },
  { value: "indigo", label: "Indigo", labelKey: "settings.accentLabels.indigo", color: "#3b82f6" },
  { value: "violet", label: "Violet", labelKey: "settings.accentLabels.violet", color: "#a855f7" },
  { value: "amber", label: "Amber", labelKey: "settings.accentLabels.amber", color: "#f59e0b" },
  { value: "rose", label: "Rose", labelKey: "settings.accentLabels.rose", color: "#e11d48" },
];

interface EngineStatusDto {
  state: string;
  modelId: string | null;
  port: number | null;
  ctx: number | null;
  variant: string | null;
  usedMtp: boolean;
  startupMs: number | null;
  warmupMs: number | null;
  error: string | null;
}

interface DownloadProgressDto {
  modelId: string;
  state: string;
  received: number;
  total: number;
  error: string | null;
}

interface CatalogModelDto {
  id: string;
  name: string;
  tier: string;
  origin: string;
  sizeBytes: number;
  minRamGb: number;
  minVramGb: number;
  numCtx: number;
  supportsThinking: boolean;
  recommended: boolean;
  recommendedForHardware: boolean;
  translationQuality: "excellent" | "good" | "basic" | "limited";
  downloaded: boolean;
  filePresent: boolean;
  mtpAvailable: boolean;
  mtpDownloaded: boolean;
  mtpSize: number;
  legacyPresent: boolean;
  legacySizeBytes: number;
}

interface CatalogInfoDto {
  enginePin: string;
  engineVariant: string | null;
  engineInstalled: boolean;
  modelsDir: string;
  models: CatalogModelDto[];
  recommendedId: string | null;
  autoStartId: string | null;
  cudaPackAvailable: boolean;
  cudaPackInstalled: boolean;
  cudaPackSize: number;
}

interface HardwareInfoDto {
  gpu: {
    name: string;
    vramMb: number;
    vendor?: string;
    unifiedMemory?: boolean;
  } | null;
  totalRamGb: number;
}

interface BenchmarkResultDto {
  modelId: string;
  modelName: string;
  backend: string | null;
  usedMtp: boolean;
  ctx: number | null;
  ttftMs: number;
  totalMs: number;
  promptTokens: number;
  completionTokens: number;
  tokensPerSec: number;
}

function engineBackendLabel(variant: string | null | undefined): string {
  if (!variant) return "CPU";
  if (variant.includes("metal")) return "Metal";
  if (variant.includes("cuda")) return "CUDA";
  if (variant.includes("vulkan")) return "Vulkan";
  return "CPU";
}

const TRANSLATE_LANGUAGES = [
  { code: "en", name: "English" },
  { code: "de", name: "German" },
  { code: "fr", name: "French" },
  { code: "es", name: "Spanish" },
  { code: "it", name: "Italian" },
  { code: "nl", name: "Dutch" },
  { code: "pt", name: "Portuguese" },
  { code: "ru", name: "Russian" },
  { code: "zh", name: "Chinese" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "tr", name: "Turkish" },
  { code: "ar", name: "Arabic" },
  { code: "el", name: "Greek" },
];

type SettingsTab = "appearance" | "lessons" | "ai" | "databases" | "backup" | "advanced";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SettingsModal({ open, onClose }: Props) {
  const {
    accentColor,
    setAccentColor,
    defaultTeacherName,
    setDefaultTeacherName,
    subjects,
    setSubjects,
    defaultLessonTableBodyRows,
    setDefaultLessonTableBodyRows,
    aiEnabled,
    setAiEnabled,
    aiV3ChatModelId,
    setAiV3ChatModelId,
    aiV3RewriteModelId,
    setAiV3RewriteModelId,
    aiV3ContextSize,
    setAiV3ContextSize,
    aiPersistChats,
    setAiPersistChats,
    aiChatHistoryLimit,
    setAiChatHistoryLimit,
    aiTemperature,
    setAiTemperature,
    aiSystemPrompt,
    setAiSystemPrompt,
    aiThinkingEnabled,
    setAiThinkingEnabled,
    aiTranslateTargetLanguage,
    setAiTranslateTargetLanguage,
    showActionButtonLabels,
    setShowActionButtonLabels,
    trashAutoClearDays,
    setTrashAutoClearDays,
    language,
    setLanguage,
  } = useAppStore();

  const { t } = useTranslation();

  const translationLabel = (quality: CatalogModelDto["translationQuality"]) =>
    t(
      quality === "excellent"
        ? "settings.aiV3.translationExcellent"
        : quality === "good"
          ? "settings.aiV3.translationGood"
          : quality === "limited"
            ? "settings.aiV3.translationLimited"
            : "settings.aiV3.translationBasic",
    );

  const translationBadgeStyle = (quality: CatalogModelDto["translationQuality"]) => {
    switch (quality) {
      case "excellent":
        return { background: "rgba(34,197,94,0.16)", color: "#4ade80" };
      case "good":
        return { background: "rgba(59,130,246,0.16)", color: "#60a5fa" };
      case "limited":
        return { background: "rgba(239,68,68,0.16)", color: "#f87171" };
      default:
        return { background: "rgba(245,158,11,0.16)", color: "#fbbf24" };
    }
  };

  const [tab, setTab] = useState<SettingsTab>("appearance");

  // ===== AI runtime / model management state =====

  // P0 debug engine card (temporary — replaced by the P1 engine UI)
  const [engineStatus, setEngineStatus] = useState<EngineStatusDto | null>(null);
  const [catalog, setCatalog] = useState<CatalogInfoDto | null>(null);
  const [v3Downloads, setV3Downloads] = useState<Record<string, DownloadProgressDto>>({});
  const [hardware, setHardware] = useState<HardwareInfoDto | null>(null);
  const [packProgress, setPackProgress] = useState<DownloadProgressDto | null>(null);
  const [deletingModelId, setDeletingModelId] = useState<string | null>(null);
  const [benchmarking, setBenchmarking] = useState(false);
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkResultDto | null>(null);
  const [benchmarkError, setBenchmarkError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || tab !== "ai") return;
    let alive = true;
    void invoke<HardwareInfoDto>("ai_hardware_info")
      .then((h) => {
        if (alive) setHardware(h);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open, tab]);


  useEffect(() => {
    if (!open || tab !== "ai") return;
    let alive = true;
    const tick = async () => {
      try {
        const s = await invoke<EngineStatusDto>("ai_engine_status");
        if (alive) setEngineStatus(s);
      } catch {
        /* backend not running the v3 engine commands */
      }
      try {
        const cat = await invoke<CatalogInfoDto>("ai_catalog_info");
        if (alive) {
          setCatalog(cat);
          setV3Downloads((prev) => {
            const next = { ...prev };
            for (const m of cat.models) {
              if (m.downloaded && !next[m.id]?.error) {
                // keep completed states cached; refresh handled by downloads
              }
            }
            return next;
          });
        }
      } catch {
        /* catalog unavailable */
      }
      try {
        const p = await invoke<DownloadProgressDto>("ai_engine_pack_status");
        if (alive) setPackProgress(p);
      } catch {
        /* pack commands unavailable */
      }
    };
    void tick();
    const handle = window.setInterval(tick, 1000);
    return () => {
      alive = false;
      window.clearInterval(handle);
    };
  }, [open, tab]);

  const pollDownload = async (modelId: string) => {
    try {
      const d = await invoke<DownloadProgressDto>("ai_download_model_progress", { modelId });
      setV3Downloads((prev) => ({ ...prev, [modelId]: d }));
      if (["queued", "downloading", "verifying"].includes(d.state)) {
        window.setTimeout(() => void pollDownload(modelId), 750);
      }
    } catch {
      /* job finished and cleared */
    }
  };

  const startDownload = async (modelId: string) => {
    try {
      const d = await invoke<DownloadProgressDto>("ai_download_model_start", { modelId });
      setV3Downloads((prev) => ({ ...prev, [modelId]: d }));
      if (["queued", "downloading", "verifying"].includes(d.state)) {
        window.setTimeout(() => void pollDownload(modelId), 750);
      }
    } catch (e) {
      setV3Downloads((prev) => ({
        ...prev,
        [modelId]: { modelId, state: "failed", received: 0, total: 0, error: String(e) },
      }));
    }
  };

  const cancelDownload = async (modelId: string) => {
    try {
      const d = await invoke<DownloadProgressDto>("ai_download_model_cancel", { modelId });
      setV3Downloads((prev) => ({ ...prev, [modelId]: d }));
    } catch (e) {
      console.error("cancel failed:", e);
    }
  };

  const deleteModel = async (modelId: string) => {
    const model = catalog?.models.find((m) => m.id === modelId);
    const confirmed = await ask(
      t("settings.aiV3.deleteConfirm", { name: model?.name ?? modelId }),
      { title: t("settings.aiV3.deleteConfirmTitle"), kind: "warning" },
    );
    if (!confirmed) return;
    setDeletingModelId(modelId);
    try {
      await invoke("ai_delete_model", { modelId });
      if (aiV3ChatModelId === modelId) setAiV3ChatModelId(null);
      if (aiV3RewriteModelId === modelId) setAiV3RewriteModelId(null);
      setV3Downloads((prev) => {
        const next = { ...prev };
        delete next[modelId];
        return next;
      });
      setEngineStatus(await invoke<EngineStatusDto>("ai_engine_status"));
      setCatalog(await invoke<CatalogInfoDto>("ai_catalog_info"));
    } catch (e) {
      console.error("delete model failed:", e);
    } finally {
      setDeletingModelId(null);
    }
  };

  const runBenchmark = async () => {
    setBenchmarking(true);
    setBenchmarkError(null);
    setBenchmarkResult(null);
    try {
      const result = await invoke<BenchmarkResultDto>("ai_benchmark", {
        modelId: aiV3ChatModelId ?? null,
        numCtx: aiV3ContextSize,
      });
      setBenchmarkResult(result);
      setEngineStatus(await invoke<EngineStatusDto>("ai_engine_status"));
      setCatalog(await invoke<CatalogInfoDto>("ai_catalog_info"));
    } catch (e) {
      setBenchmarkError(String(e));
    } finally {
      setBenchmarking(false);
    }
  };

  const removeLegacyModel = async (modelId: string) => {
    const model = catalog?.models.find((m) => m.id === modelId);
    const confirmed = await ask(
      t("settings.aiV3.removeLegacyConfirm", { name: model?.name ?? modelId }),
      { title: t("settings.aiV3.removeLegacyConfirmTitle"), kind: "warning" },
    );
    if (!confirmed) return;
    try {
      await invoke("ai_delete_legacy_model", { modelId });
      setCatalog(await invoke<CatalogInfoDto>("ai_catalog_info"));
    } catch (e) {
      console.error("remove legacy model files failed:", e);
    }
  };

  const activateModel = async (modelId: string) => {
    try {
      setEngineStatus(await invoke<EngineStatusDto>("ai_select_model", { modelId }));
      // Persisted routing: chat + rewrite default to the activated model.
      setAiV3ChatModelId(modelId);
      setAiV3RewriteModelId(modelId);
    } catch (e) {
      console.error("select model failed:", e);
    }
  };

  const refreshAfterPackChange = async () => {
    try {
      // Restart engine so the next request picks the new backend.
      await invoke("ai_engine_stop");
      setEngineStatus(await invoke<EngineStatusDto>("ai_engine_status"));
      setCatalog(await invoke<CatalogInfoDto>("ai_catalog_info"));
    } catch {
      /* engine may not be running */
    }
  };

  const startPackInstall = async () => {
    try {
      const d = await invoke<DownloadProgressDto>("ai_engine_pack_start");
      setPackProgress(d);
      const poll = async () => {
        try {
          const p = await invoke<DownloadProgressDto>("ai_engine_pack_status");
          setPackProgress(p);
          if (["queued", "downloading", "verifying"].includes(p.state)) {
            window.setTimeout(() => void poll(), 750);
          } else if (p.state === "completed") {
            await refreshAfterPackChange();
          }
        } catch (e) {
          console.error("pack poll failed:", e);
        }
      };
      void poll();
    } catch (e) {
      setPackProgress({
        modelId: "engine-cuda",
        state: "failed",
        received: 0,
        total: 0,
        error: String(e),
      });
    }
  };

  const removePack = async () => {
    try {
      // Windows locks the running llama-server/DLLs, so stop the engine
      // before deleting the pack directory.
      try { await invoke("ai_engine_stop"); } catch { /* engine may be stopped */ }
      await invoke("ai_engine_pack_remove");
      setPackProgress(null);
      await refreshAfterPackChange();
    } catch (e) {
      console.error("remove pack failed:", e);
    }
  };



  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const selectedContextModelId =
    aiV3ChatModelId ?? catalog?.autoStartId ?? catalog?.recommendedId ?? null;
  const contextMax = Math.max(
    4096,
    catalog?.models.find((model) => model.id === selectedContextModelId)?.numCtx ??
      131072,
  );
  const contextOptions = AI_CONTEXT_SIZES.filter((size) => size <= contextMax);

  // If the user switches to a model with a smaller window, do not leave a
  // value selected that the model cannot actually use.
  useEffect(() => {
    if (aiV3ContextSize === null || aiV3ContextSize <= contextMax) return;
    const fallback =
      [...AI_CONTEXT_SIZES].reverse().find((size) => size <= contextMax) ?? null;
    setAiV3ContextSize(fallback);
  }, [aiV3ContextSize, contextMax, setAiV3ContextSize]);

  if (!open) return null;

  const TABS: Array<{ key: SettingsTab; label: string; icon: any }> = [
    { key: "appearance", label: t("settings.tabs.appearance"), icon: SettingsIcon },
    { key: "lessons", label: t("settings.tabs.lessons"), icon: FileText },
    { key: "ai", label: t("settings.tabs.aiFeatures"), icon: Sparkles },
    { key: "databases", label: t("subjectDb.tabs.databases"), icon: Database },
    { key: "backup", label: t("settings.tabs.backup"), icon: HardDrive },
    { key: "advanced", label: t("settings.tabs.advanced"), icon: SlidersHorizontal },
  ];

  return (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center p-6"
      onClick={onClose}
      style={{ background: "rgba(0,0,0,0.6)" }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("settings.title")}
        className="tp-settings-modal flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        style={{ width: "min(900px, calc(100vw - 3rem))", height: "min(720px, calc(100vh - 3rem))" }}
      >
        <div className="tp-settings-header">
          <span className="tp-settings-title">{t("settings.title")}</span>
          <button onClick={onClose} className="tp-settings-close" aria-label={t("settings.close")}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-1 min-h-0">
          <div className="tp-settings-tabs">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setTab(key)} className={`tp-settings-tab ${tab === key ? "active" : ""}`}>
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </button>
            ))}
          </div>

          <div className="tp-settings-content">
            {tab === "appearance" && (
              <>
                <Section title={t("settings.appearance.language")}>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setLanguage("en")}
                      className={`tp-action-btn px-3 py-1.5 rounded-md text-sm font-medium ${language === "en" ? "ring-2 ring-[var(--tp-accent)]" : ""}`}
                      title={t("languages.en")}
                    >
                      🇬🇧 {t("languages.en")}
                    </button>
                    <button
                      onClick={() => setLanguage("de")}
                      className={`tp-action-btn px-3 py-1.5 rounded-md text-sm font-medium ${language === "de" ? "ring-2 ring-[var(--tp-accent)]" : ""}`}
                      title={t("languages.de")}
                    >
                      🇩🇪 {t("languages.de")}
                    </button>
                  </div>
                </Section>

                <Section title={t("settings.appearance.accentColor")}>
                  <div className="tp-color-group">
                    {ACCENT_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setAccentColor(opt.value)}
                        title={t(opt.labelKey)}
                        className={`tp-color-option ${accentColor === opt.value ? "active" : ""}`}
                        style={{ background: opt.color }}
                      />
                    ))}
                    <input
                      type="color"
                      value={accentColor.startsWith("#") ? accentColor : "#2d86a5"}
                      onChange={(e) => setAccentColor(e.target.value.toLowerCase())}
                      className="tp-color-custom"
                      title={t("settings.appearance.customColor")}
                    />
                  </div>
                </Section>

                <Section title={t("settings.appearance.editorPreferences")}>
                  <ToggleRow
                    label={t("settings.appearance.showActionButtonLabels")}
                    desc={t("settings.appearance.showActionButtonLabelsDesc")}
                    value={showActionButtonLabels}
                    onChange={setShowActionButtonLabels}
                  />
                </Section>
              </>
            )}

            {tab === "lessons" && (
              <>
                <Section title={t("settings.lessons.defaultLessonSettings")}>
                  <FormRow label={t("settings.lessons.defaultTeacherName")} hint={t("settings.lessons.defaultTeacherNameHint")}>
                    <input
                      type="text"
                      className="tp-input"
                      placeholder={t("editor.meta.yourName")}
                      value={defaultTeacherName}
                      onChange={(e) => setDefaultTeacherName(e.target.value)}
                    />
                  </FormRow>
                  <FormRow label={t("settings.lessons.defaultTableRows")}>
                    <NumberInput
                      value={defaultLessonTableBodyRows}
                      min={1}
                      max={12}
                      onChange={setDefaultLessonTableBodyRows}
                    />
                  </FormRow>
                </Section>

                <Section title={t("settings.lessons.subjects")}>
                  {subjects.length === 0 && (
                    <p className="text-[12px] mb-2" style={{ color: "var(--tp-t-3)" }}>
                      {t("settings.lessons.subjectsHint")}
                    </p>
                  )}
                  <div className="flex flex-col gap-2">
                    {subjects.map((s, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="color"
                          value={s.color}
                          onChange={(e) => {
                            const next = subjects.map((x, i) => (i === idx ? { ...x, color: e.target.value } : x));
                            setSubjects(next);
                          }}
                          className="h-9 w-10 cursor-pointer rounded border border-[var(--tp-b-1)] bg-transparent p-0.5 shrink-0"
                        />
                        <input
                          type="text"
                          className="tp-input flex-1"
                          placeholder={t("settings.lessons.egMathematics")}
                          value={s.name}
                          onChange={(e) => {
                            const next = subjects.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x));
                            setSubjects(next);
                          }}
                        />
                        <button
                          onClick={() => setSubjects(subjects.filter((_, i) => i !== idx))}
                          className="h-9 w-9 inline-flex items-center justify-center rounded-md text-[var(--tp-t-3)] hover:text-red-400 hover:bg-[var(--tp-bg-4)]"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  {subjects.length < 4 && (
                    <button
                      onClick={() => setSubjects([...subjects, { name: "", color: "#6366f1" }])}
                      className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors hover:brightness-125"
                      style={{ background: "var(--tp-bg-3)", border: "1px solid var(--tp-b-2)", color: "var(--tp-t-2)" }}
                    >
                      <Plus className="w-3.5 h-3.5" /> {t("settings.lessons.addSubject")}
                    </button>
                  )}
                </Section>
              </>
            )}

            {tab === "ai" && (
              <>
                <Section title={t("settings.aiV3.title")}>

                  <p className="mb-3 text-[12.5px]" style={{ color: "var(--tp-t-4)" }}>
                    {t("settings.aiV3.subtitle")}
                  </p>
                  <div className="flex flex-col gap-2">
                    {[...(catalog?.models ?? [])]
                      .sort(
                        (a, b) =>
                          Number(b.recommendedForHardware) - Number(a.recommendedForHardware),
                      )
                      .map((model) => {
                      const dl = v3Downloads[model.id];
                      const isActive = dl && ["queued", "downloading", "verifying"].includes(dl.state);
                      const pct = dl && dl.total > 0 ? Math.round((dl.received / dl.total) * 100) : 0;
                      return (
                        <div
                          key={model.id}
                          className="flex items-center gap-3 rounded-lg border px-3 py-2"
                          style={{ borderColor: "var(--tp-border-strong)", background: "var(--tp-panel-muted)" }}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-[13px] font-medium text-[var(--tp-text-primary)]">
                                {model.name}
                              </span>
                              {model.recommendedForHardware && (
                                <span
                                  className="shrink-0 rounded-full px-1.5 py-0.5 text-[11px] font-medium"
                                  style={{ background: "var(--tp-accent)", color: "#fff" }}
                                >
                                  {t("settings.aiV3.recommendedForPc")}
                                </span>
                              )}
                              <span
                                className="shrink-0 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px]"
                                style={translationBadgeStyle(model.translationQuality)}
                              >
                                <Languages className="w-3 h-3" />
                                {translationLabel(model.translationQuality)}
                              </span>
                              {model.origin === "eu" && (
                                <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[11px]" style={{ background: "var(--tp-accent)", color: "#fff" }}>
                                  EU
                                </span>
                              )}
                            </div>
                            <div className="text-[11px]" style={{ color: "var(--tp-t-4)" }}>
                              {model.tier} · {(model.sizeBytes / 1e9).toFixed(1)} GB · VRAM{" "}
                              {model.minVramGb}+ GB · RAM {model.minRamGb}+ GB ·{" "}
                              {Math.round(model.numCtx / 1024)}K ctx
                              {model.mtpAvailable && " · MTP"}
                              {hardware?.gpu && !hardware.gpu.unifiedMemory && (
                                <>
                                  {" "}·{" "}
                                  {hardware.gpu.vramMb >= model.minVramGb * 1024 &&
                                  hardware.totalRamGb >= model.minRamGb ? (
                                    <span style={{ color: "#4ade80" }}>
                                      {t("settings.aiV3.fitsVram")}
                                    </span>
                                  ) : (
                                    <span style={{ color: "#f87171" }}>
                                      {t("settings.aiV3.mayNotFit")}
                                    </span>
                                  )}
                                </>
                              )}
                              {model.legacyPresent &&
                                ` · ${t("settings.aiV3.legacySize", {
                                  size: (model.legacySizeBytes / 1e9).toFixed(1),
                                })}`}
                            </div>
                          </div>
                          {model.downloaded ? (
                            <div className="shrink-0 flex items-center gap-2">
                              {aiV3ChatModelId === model.id || engineStatus?.modelId === model.id ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium" style={{ color: "var(--tp-accent)" }}>
                                  <CheckCircle2 className="w-3.5 h-3.5" /> {t("settings.aiV3.active")}
                                </span>
                              ) : (
                                <button
                                  className="tp-btn inline-flex items-center gap-1.5"
                                  onClick={() => void activateModel(model.id)}
                                >
                                  {t("settings.aiV3.use")}
                                </button>
                              )}
                              {model.mtpAvailable && !model.mtpDownloaded && (
                                isActive ? (
                                  <span
                                    className="inline-flex items-center gap-1 text-[11px]"
                                    style={{ color: "var(--tp-t-4)" }}
                                  >
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    {pct}%
                                  </span>
                                ) : (
                                  <button
                                    className="tp-btn inline-flex items-center gap-1.5"
                                    onClick={() => void startDownload(model.id)}
                                  >
                                    <HardDriveDownload className="w-3.5 h-3.5" />
                                    {t("settings.aiV3.downloadMtp")}
                                  </button>
                                )
                              )}
                              <button
                                className="tp-btn inline-flex items-center justify-center"
                                title={t("settings.aiV3.delete")}
                                aria-label={t("settings.aiV3.delete")}
                                disabled={deletingModelId === model.id}
                                onClick={() => void deleteModel(model.id)}
                              >
                                {deletingModelId === model.id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Trash2 className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          ) : dl?.state === "verifying" ? (
                            <span className="shrink-0 inline-flex items-center gap-1.5 text-[11px]" style={{ color: "var(--tp-t-4)" }}>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t("settings.aiV3.verifying")}
                            </span>
                          ) : isActive ? (
                            <div className="shrink-0 flex items-center gap-2">
                              <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--tp-panel-elevated)" }}>
                                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--tp-accent)" }} />
                              </div>
                              <span className="text-[11px]" style={{ color: "var(--tp-t-4)" }}>{pct}%</span>
                              <button className="tp-btn" onClick={() => void cancelDownload(model.id)}>
                                {t("settings.aiV3.cancel")}
                              </button>
                            </div>
                          ) : (
                            <button
                              className="tp-btn shrink-0 inline-flex items-center gap-1.5"
                              onClick={() => void startDownload(model.id)}
                            >
                              <HardDriveDownload className="w-3.5 h-3.5" /> {t("settings.aiV3.download")}
                            </button>
                          )}
                          {model.legacyPresent && (
                            <button
                              className="tp-btn shrink-0 inline-flex items-center justify-center"
                              title={t("settings.aiV3.removeLegacyHint")}
                              aria-label={t("settings.aiV3.removeLegacy")}
                              onClick={() => void removeLegacyModel(model.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {dl?.error && (
                            <span className="text-[11px] text-red-400">{dl.error}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Section>

                <Section title={t("settings.aiV3.systemTitle")}>
                  <div
                    className="rounded-lg border px-3 py-2 text-[12.5px]"
                    style={{ borderColor: "var(--tp-border-strong)", background: "var(--tp-panel-muted)" }}
                  >
                    <div className="text-[var(--tp-text-primary)]">
                      {hardware?.gpu
                        ? hardware.gpu.unifiedMemory
                          ? t(
                              hardware.gpu.vendor === "apple"
                                ? "settings.aiV3.gpuDetectedUnified"
                                : "settings.aiV3.gpuDetectedShared",
                              {
                                name: hardware.gpu.name,
                                vram: Math.round(hardware.gpu.vramMb / 1024),
                              },
                            )
                          : t("settings.aiV3.gpuDetected", {
                              name: hardware.gpu.name,
                              vram: Math.round(hardware.gpu.vramMb / 1024),
                            })
                        : t("settings.aiV3.gpuNone")}
                    </div>
                    <div className="text-[11px]" style={{ color: "var(--tp-t-4)" }}>
                      {t("settings.aiV3.ramDetected", { ram: hardware?.totalRamGb ?? "?" })}
                    </div>
                    <div className="text-[11px]" style={{ color: "var(--tp-t-4)" }}>
                      {t("settings.aiV3.engineBackend", {
                        backend: engineBackendLabel(
                          engineStatus?.variant ?? catalog?.engineVariant,
                        ),
                      })}
                    </div>
                    {engineStatus?.startupMs != null && (
                      <div className="text-[11px]" style={{ color: "var(--tp-t-4)" }}>
                        {t("settings.aiV3.startupTime", {
                          seconds: (engineStatus.startupMs / 1000).toFixed(1),
                        })}
                      </div>
                    )}
                    {engineStatus?.warmupMs != null && (
                      <div className="text-[11px]" style={{ color: "var(--tp-t-4)" }}>
                        {t("settings.aiV3.warmupTime", {
                          seconds: (engineStatus.warmupMs / 1000).toFixed(1),
                        })}
                      </div>
                    )}
                    {catalog?.autoStartId && (
                      <div className="text-[11px]" style={{ color: "var(--tp-t-4)" }}>
                        {t("settings.aiV3.autoStart", {
                          name:
                            catalog.models.find((m) => m.id === catalog.autoStartId)?.name ??
                            catalog.autoStartId,
                        })}
                      </div>
                    )}
                    {engineStatus?.usedMtp && (
                      <div className="text-[11px]" style={{ color: "#4ade80" }}>
                        {t("settings.aiV3.mtpActive")}
                      </div>
                    )}
                    {hardware?.gpu?.vendor === "apple" && (
                      <div className="text-[11px]" style={{ color: "var(--tp-t-4)" }}>
                        {t("settings.aiV3.appleMetalNote")}
                      </div>
                    )}
                    <div className="text-[11px]" style={{ color: "var(--tp-t-4)" }}>
                      {t("settings.aiV3.embedModel")}
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      className="tp-btn inline-flex items-center gap-1.5"
                      onClick={() => void runBenchmark()}
                      disabled={benchmarking}
                      title={t("settings.aiV3.benchmarkHint")}
                    >
                      {benchmarking ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Gauge className="w-3.5 h-3.5" />
                      )}
                      {t("settings.aiV3.runBenchmark")}
                    </button>
                    {benchmarkResult && (
                      <span className="text-[11px]" style={{ color: "var(--tp-t-4)" }}>
                        {t("settings.aiV3.benchmarkResult", {
                          backend: benchmarkResult.backend ?? "?",
                          ttft: benchmarkResult.ttftMs,
                          tps: benchmarkResult.tokensPerSec.toFixed(1),
                          tokens: benchmarkResult.completionTokens,
                          ctx: benchmarkResult.ctx ?? "?",
                          mtp: benchmarkResult.usedMtp ? " · MTP" : "",
                        })}
                      </span>
                    )}
                    {benchmarkError && (
                      <span className="text-[11px] text-red-400">{benchmarkError}</span>
                    )}
                  </div>

                  {catalog?.cudaPackAvailable &&
                    (hardware?.gpu?.vendor === "nvidia" ||
                      catalog.cudaPackInstalled) && (
                    <div
                      className="mt-2 flex items-center gap-3 rounded-lg border px-3 py-2"
                      style={{ borderColor: "var(--tp-border-strong)", background: "var(--tp-panel-muted)" }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium text-[var(--tp-text-primary)]">
                          {t("settings.aiV3.cudaPack")}
                        </div>
                        <div className="text-[11px]" style={{ color: "var(--tp-t-4)" }}>
                          {catalog.cudaPackInstalled
                            ? t("settings.aiV3.cudaPackInstalled")
                            : t("settings.aiV3.cudaPackDesc", {
                                size: (catalog.cudaPackSize / 1e9).toFixed(1),
                              })}
                        </div>
                        {packProgress?.error && (
                          <div className="text-[11px] text-red-400">{packProgress.error}</div>
                        )}
                      </div>
                      {catalog.cudaPackInstalled ? (
                        <button className="tp-btn shrink-0" onClick={() => void removePack()}>
                          {t("settings.aiV3.removePack")}
                        </button>
                      ) : packProgress &&
                        ["queued", "downloading", "verifying"].includes(packProgress.state) ? (
                        <div className="shrink-0 flex items-center gap-2">
                          <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--tp-panel-elevated)" }}>
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${packProgress.total > 0 ? Math.round((packProgress.received / packProgress.total) * 100) : 0}%`,
                                background: "var(--tp-accent)",
                              }}
                            />
                          </div>
                          <span className="text-[11px]" style={{ color: "var(--tp-t-4)" }}>
                            {packProgress.state === "verifying"
                              ? t("settings.aiV3.verifying")
                              : `${packProgress.total > 0 ? Math.round((packProgress.received / packProgress.total) * 100) : 0}%`}
                          </span>
                          <button
                            className="tp-btn"
                            onClick={() => void invoke("ai_engine_pack_cancel")}
                          >
                            {t("settings.aiV3.cancel")}
                          </button>
                        </div>
                      ) : (
                        <button
                          className="tp-btn shrink-0 inline-flex items-center gap-1.5"
                          onClick={() => void startPackInstall()}
                        >
                          <HardDriveDownload className="w-3.5 h-3.5" /> {t("settings.aiV3.installPack")}
                        </button>
                      )}
                    </div>
                  )}
                </Section>

                <Section title={t("settings.ai.aiRuntime")}>
                  <ToggleRow
                    label={t("settings.ai.enableLocalAi")}
                    desc={t("settings.ai.enableLocalAiDesc")}
                    value={aiEnabled}
                    onChange={setAiEnabled}
                  />
                  <ToggleRow
                    label={t("settings.ai.persistChats")}
                    desc={t("settings.ai.persistChatsDesc")}
                    value={aiPersistChats}
                    onChange={setAiPersistChats}
                  />
                  <ToggleRow
                    label={t("settings.ai.thinkingMode")}
                    desc={t("settings.ai.thinkingModeDesc")}
                    value={aiThinkingEnabled}
                    onChange={setAiThinkingEnabled}
                  />
                </Section>

                <Section title={t("settings.ai.modelRouting")}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormRow label={t("settings.ai.chatModel")}>
                      <select
                        className="tp-input"
                        value={aiV3ChatModelId ?? ""}
                        onChange={(e) => setAiV3ChatModelId(e.target.value || null)}
                      >
                        <option value="">{t("settings.aiV3.autoModel")}</option>
                        {catalog?.models
                          .filter((m) => m.downloaded && m.tier !== "smoke")
                          .map((m) => (
                            <option key={`chat-${m.id}`} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                      </select>
                    </FormRow>
                    <FormRow label={t("settings.ai.rewriteTranslateModel")}>
                      <select
                        className="tp-input"
                        value={aiV3RewriteModelId ?? ""}
                        onChange={(e) => setAiV3RewriteModelId(e.target.value || null)}
                      >
                        <option value="">{t("settings.aiV3.autoModel")}</option>
                        {catalog?.models
                          .filter((m) => m.downloaded && m.tier !== "smoke")
                          .map((m) => (
                            <option key={`rw-${m.id}`} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                      </select>
                    </FormRow>
                  </div>
                  <FormRow
                    label={t("settings.aiV3.contextSize")}
                    hint={t("settings.aiV3.contextHint", {
                      max: Math.round(contextMax / 1024),
                    })}
                  >
                    <select
                      className="tp-input"
                      value={aiV3ContextSize ?? ""}
                      onChange={(e) =>
                        setAiV3ContextSize(e.target.value ? Number(e.target.value) : null)
                      }
                    >
                      <option value="">{t("settings.aiV3.contextAuto")}</option>
                      {contextOptions.map((size) => (
                        <option key={size} value={size}>
                          {size / 1024}K
                        </option>
                      ))}
                    </select>
                  </FormRow>
                  <p className="text-[11px] mt-2" style={{ color: "var(--tp-t-4)" }}>
                    {t("settings.aiV3.routingHint")}
                  </p>
                </Section>

                <Section title={t("settings.ai.generationParameters")}>
                  <FormRow label={t("settings.ai.memoryTurns")}>
                    <select
                      className="tp-input"
                      value={aiChatHistoryLimit}
                      onChange={(e) => setAiChatHistoryLimit(Number(e.target.value))}
                    >
                      <option value={4}>{t("settings.ai.memoryTurnsOptions.4")}</option>
                      <option value={10}>{t("settings.ai.memoryTurnsOptions.10")}</option>
                      <option value={20}>{t("settings.ai.memoryTurnsOptions.20")}</option>
                      <option value={40}>{t("settings.ai.memoryTurnsOptions.40")}</option>
                      <option value={9999}>{t("settings.ai.memoryTurnsOptions.all")}</option>
                    </select>
                  </FormRow>
                  <FormRow label={t("settings.ai.creativity")}>
                    <select
                      className="tp-input"
                      value={aiTemperature}
                      onChange={(e) => setAiTemperature(Number(e.target.value))}
                    >
                    <option value={0.1}>{t("settings.ai.creativityOptions.0_1")}</option>
                    <option value={0.4}>{t("settings.ai.creativityOptions.0_4")}</option>
                    <option value={0.7}>{t("settings.ai.creativityOptions.0_7")}</option>
                    <option value={1.0}>{t("settings.ai.creativityOptions.1_0")}</option>
                    <option value={1.4}>{t("settings.ai.creativityOptions.1_4")}</option>
                    </select>
                  </FormRow>
                  <FormRow label={t("settings.ai.translationTargetLanguage")}>
                    <select
                      className="tp-input"
                      value={aiTranslateTargetLanguage}
                      onChange={(e) => setAiTranslateTargetLanguage(e.target.value)}
                    >
                      {TRANSLATE_LANGUAGES.map((lang) => (
                        <option key={lang.code} value={lang.name}>{t(`languages.${lang.code}`)}</option>
                      ))}
                    </select>
                  </FormRow>
                  <FormRow label={t("settings.ai.customAiPersonality")} hint={t("settings.ai.customAiPersonalityHint")}>
                    <textarea
                      className="tp-input"
                      placeholder={t("settings.ai.customAiPersonalityPlaceholder")}
                      value={aiSystemPrompt}
                      onChange={(e) => setAiSystemPrompt(e.target.value)}
                      style={{ height: "auto", minHeight: 90, padding: "10px 12px", resize: "vertical" }}
                    />
                  </FormRow>
                </Section>

              </>
            )}

            {tab === "databases" && (
              <SubjectDbManager />
            )}

            {tab === "backup" && (
              <Section title={t("settings.backup.vaultBackup")}>
                <p className="text-[13px]" style={{ color: "var(--tp-t-3)" }}>
                  {t("settings.backup.descriptionBefore")}{" "}
                  <code style={{ background: "var(--tp-bg-3)", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>
                    .teacherpro/ui-settings.backup.json
                  </code>
                  . {t("settings.backup.descriptionAfter")}
                </p>
              </Section>
            )}

            {tab === "advanced" && (
              <>
                <Section title={t("settings.advanced.trash")}>
                  <div className="tp-form-row">
                    <label className="tp-form-label">{t("settings.advanced.autoClearTrash")}</label>
                    <div className="flex items-center gap-3">
                      <select
                        value={trashAutoClearDays === null ? "never" : String(trashAutoClearDays)}
                        onChange={(e) => {
                          const val = e.target.value;
                          setTrashAutoClearDays(val === "never" ? null : parseInt(val, 10));
                        }}
                        className="tp-input"
                      >
                        <option value="never">{t("settings.advanced.trashOptions.never")}</option>
                        <option value="7">{t("settings.advanced.trashOptions.after7")}</option>
                        <option value="14">{t("settings.advanced.trashOptions.after14")}</option>
                        <option value="30">{t("settings.advanced.trashOptions.after30")}</option>
                        <option value="90">{t("settings.advanced.trashOptions.after90")}</option>
                      </select>
                    </div>
                    <span className="tp-form-hint">
                      {t("settings.advanced.autoClearTrashHint")}
                    </span>
                  </div>
                </Section>
              </>
            )}
          </div>
        </div>

        <div className="tp-settings-footer">
          <button onClick={onClose} className="tp-btn">{t("common.close")}</button>
          <button onClick={onClose} className="tp-btn tp-btn-primary">
            <Save className="w-3.5 h-3.5" />
            {t("common.done")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="tp-settings-section">
      <div className="tp-section-title">{title}</div>
      {children}
    </div>
  );
}

function FormRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="tp-form-row">
      <label className="tp-form-label">{label}</label>
      {children}
      {hint && <span className="tp-form-hint">{hint}</span>}
    </div>
  );
}

function ToggleRow({
  label,
  desc,
  value,
  onChange,
}: {
  label: string;
  desc?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="tp-toggle-row">
      <div className="flex flex-col gap-0.5 min-w-0 pr-3">
        <span className="text-[13px] font-medium" style={{ color: "var(--tp-t-1)" }}>{label}</span>
        {desc && <span className="text-[12px]" style={{ color: "var(--tp-t-4)" }}>{desc}</span>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`tp-toggle ${value ? "active" : ""}`}
        aria-label={label}
        aria-pressed={value}
      />
    </div>
  );
}

function NumberInput({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (n: number) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => onChange(Math.max(min, value - 1))} className="tp-num-btn" type="button">
        <Minus className="w-3.5 h-3.5" />
      </button>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) onChange(Math.min(max, Math.max(min, n)));
        }}
        className="tp-input tp-num-input"
      />
      <button onClick={() => onChange(Math.min(max, value + 1))} className="tp-num-btn" type="button">
        <Plus className="w-3.5 h-3.5" />
      </button>
      <span className="text-[11px]" style={{ color: "var(--tp-t-4)" }}>{t("common.range", { min, max })}</span>
    </div>
  );
}
