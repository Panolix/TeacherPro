import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
  Trash2,
  HardDriveDownload,
  Loader2,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { useAppStore, type AccentColor } from "../store";
import { useTranslation } from "../i18n/useTranslation";
import {
  AI_MODEL_CATALOG,
  DEFAULT_AI_MODEL_ID,
  type AiModelCapability,
} from "../ai/modelCatalog";

const ACCENT_OPTIONS: Array<{ value: AccentColor; label: string; labelKey: string; color: string }> = [
  { value: "blue", label: "Blue", labelKey: "settings.accentLabels.blue", color: "#2d86a5" },
  { value: "emerald", label: "Emerald", labelKey: "settings.accentLabels.emerald", color: "#22c55e" },
  { value: "indigo", label: "Indigo", labelKey: "settings.accentLabels.indigo", color: "#3b82f6" },
  { value: "violet", label: "Violet", labelKey: "settings.accentLabels.violet", color: "#a855f7" },
  { value: "amber", label: "Amber", labelKey: "settings.accentLabels.amber", color: "#f59e0b" },
  { value: "rose", label: "Rose", labelKey: "settings.accentLabels.rose", color: "#e11d48" },
];

const AI_MODEL_CAPABILITY_LABELS: Record<AiModelCapability, string> = {
  multilingual: "settings.aiCapabilities.multilingual",
  reasoning: "settings.aiCapabilities.reasoning",
  "low-latency": "settings.aiCapabilities.lowLatency",
  "long-context": "settings.aiCapabilities.longContext",
  "english-focused": "settings.aiCapabilities.englishFocused",
};

interface AiModelInstallProgress {
  model_id: string;
  status: "not-started" | "preparing" | "installing" | "completed" | "failed" | "cancelled";
  progress: number;
  detail?: string | null;
}

const TERMINAL_INSTALL_STATUSES = new Set<AiModelInstallProgress["status"]>([
  "not-started",
  "completed",
  "failed",
  "cancelled",
]);

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

type SettingsTab = "appearance" | "lessons" | "ai" | "backup" | "advanced";

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
    aiProvider,
    setAiProvider,
    aiDefaultModelId,
    setAiDefaultModelId,
    aiRewriteTranslateModelId,
    setAiRewriteTranslateModelId,
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
    aiModelInstallState,
    setAiModelInstallState,
    debugMode,
    setDebugMode,
    showActionButtonLabels,
    setShowActionButtonLabels,
    trashAutoClearDays,
    setTrashAutoClearDays,
    language,
    setLanguage,
  } = useAppStore();

  const { t } = useTranslation();

  const [tab, setTab] = useState<SettingsTab>("appearance");

  // ===== AI runtime / model management state =====
  const [aiActionBusy, setAiActionBusy] = useState<string | null>(null);
  const [aiErrorMessage, setAiErrorMessage] = useState<string | null>(null);
  const [aiInfoMessage, setAiInfoMessage] = useState<string | null>(null);
  const [aiInstalledModelIds, setAiInstalledModelIds] = useState<string[]>([]);
  const [aiInstallProgress, setAiInstallProgress] = useState<Record<string, AiModelInstallProgress>>({});
  const aiInstallPollersRef = useRef<Record<string, number>>({});

  const getModelInstallState = (modelId: string) => aiModelInstallState[modelId] || "not-installed";

  const clearInstallPoller = useCallback((modelId: string) => {
    const timerId = aiInstallPollersRef.current[modelId];
    if (timerId) {
      window.clearInterval(timerId);
      delete aiInstallPollersRef.current[modelId];
    }
  }, []);

  const handleInstallProgressUpdate = useCallback(
    (progress: AiModelInstallProgress) => {
      const modelId = progress.model_id;
      setAiInstallProgress((prev) => ({ ...prev, [modelId]: progress }));

      if (progress.status === "preparing" || progress.status === "installing") {
        setAiModelInstallState(modelId, "installing");
        return;
      }
      if (progress.status === "completed") {
        clearInstallPoller(modelId);
        setAiModelInstallState(modelId, "installed");
        setAiDefaultModelId(modelId);
        setAiInfoMessage(t("settings.ai.installedModel", { model: modelId }));
        void syncInstalledModels();
        return;
      }
      if (progress.status === "cancelled") {
        clearInstallPoller(modelId);
        setAiModelInstallState(modelId, "not-installed");
        setAiInfoMessage(t("settings.ai.cancelledModel", { model: modelId }));
        return;
      }
      if (progress.status === "failed") {
        clearInstallPoller(modelId);
        setAiModelInstallState(modelId, "error");
        setAiErrorMessage(progress.detail || t("settings.ai.failedModel", { model: modelId }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clearInstallPoller, setAiDefaultModelId, setAiModelInstallState],
  );

  const pollModelInstallProgress = useCallback(
    async (modelId: string) => {
      try {
        const progress = await invoke<AiModelInstallProgress>("ai_get_model_install_progress", { modelId });
        handleInstallProgressUpdate(progress);
        if (TERMINAL_INSTALL_STATUSES.has(progress.status)) clearInstallPoller(modelId);
      } catch (error) {
        clearInstallPoller(modelId);
        setAiModelInstallState(modelId, "error");
        setAiErrorMessage(`Could not track install progress for ${modelId}: ${String(error)}`);
      }
    },
    [clearInstallPoller, handleInstallProgressUpdate, setAiModelInstallState],
  );

  const startInstallPolling = useCallback(
    (modelId: string) => {
      clearInstallPoller(modelId);
      aiInstallPollersRef.current[modelId] = window.setInterval(() => {
        void pollModelInstallProgress(modelId);
      }, 750);
      void pollModelInstallProgress(modelId);
    },
    [clearInstallPoller, pollModelInstallProgress],
  );

  const syncInstalledModels = async () => {
    setAiInfoMessage(null);
    setAiErrorMessage(null);
    setAiActionBusy("refresh-models");
    try {
      const installedModels = await invoke<string[]>("ai_list_models");
      const installed = new Set(installedModels || []);
      setAiInstalledModelIds(Array.from(installed));
      for (const model of AI_MODEL_CATALOG) {
        setAiModelInstallState(model.id, installed.has(model.id) ? "installed" : "not-installed");
      }
      const currentState = useAppStore.getState();
      const firstCatalogMatch = AI_MODEL_CATALOG.find((m) => installed.has(m.id));
      const corrected = firstCatalogMatch?.id ?? Array.from(installed)[0];
      if (corrected && !installed.has(currentState.aiDefaultModelId)) setAiDefaultModelId(corrected);
      if (corrected && !installed.has(currentState.aiRewriteTranslateModelId))
        setAiRewriteTranslateModelId(corrected);
    } catch (error) {
      setAiErrorMessage(`Could not refresh models: ${String(error)}`);
    } finally {
      setAiActionBusy(null);
    }
  };

  const handleInstallModel = async (modelId: string) => {
    setAiInfoMessage(null);
    setAiErrorMessage(null);
    setAiModelInstallState(modelId, "installing");
    setAiInstallProgress((prev) => ({
      ...prev,
      [modelId]: { model_id: modelId, status: "preparing", progress: 0, detail: t("settings.ai.preparingRuntime") },
    }));
    try {
      const progress = await invoke<AiModelInstallProgress>("ai_start_model_install", { modelId });
      handleInstallProgressUpdate(progress);
      if (!TERMINAL_INSTALL_STATUSES.has(progress.status)) startInstallPolling(modelId);
    } catch (error) {
      setAiModelInstallState(modelId, "error");
      setAiErrorMessage(`Failed to install ${modelId}: ${String(error)}`);
    }
  };

  const handleCancelInstallModel = async (modelId: string) => {
    setAiInfoMessage(null);
    setAiErrorMessage(null);
    setAiActionBusy(`cancel:${modelId}`);
    try {
      const progress = await invoke<AiModelInstallProgress>("ai_cancel_model_install", { modelId });
      handleInstallProgressUpdate(progress);
      clearInstallPoller(modelId);
    } catch (error) {
      setAiErrorMessage(`Failed to cancel install for ${modelId}: ${String(error)}`);
    } finally {
      setAiActionBusy(null);
    }
  };

  const handleRemoveModel = async (modelId: string) => {
    setAiInfoMessage(null);
    setAiErrorMessage(null);
    setAiActionBusy(`remove:${modelId}`);
    try {
      await invoke("ai_remove_model", { modelId });
      setAiModelInstallState(modelId, "not-installed");
      if (aiDefaultModelId === modelId) setAiDefaultModelId(DEFAULT_AI_MODEL_ID);
      if (aiRewriteTranslateModelId === modelId) setAiRewriteTranslateModelId(DEFAULT_AI_MODEL_ID);
      setAiInfoMessage(t("settings.ai.removedModel", { model: modelId }));
      void syncInstalledModels();
    } catch (error) {
      setAiModelInstallState(modelId, "error");
      setAiErrorMessage(`Failed to remove ${modelId}: ${String(error)}`);
    } finally {
      setAiActionBusy(null);
    }
  };

  const handleEnsureRuntime = async () => {
    setAiInfoMessage(null);
    setAiErrorMessage(null);
    setAiActionBusy("ensure-runtime");
    try {
      const result = await invoke<string>("ai_ensure_runtime");
      setAiInfoMessage(result || t("settings.ai.localRuntimeReady"));
    } catch (error) {
      setAiErrorMessage(`Automatic runtime setup failed: ${String(error)}`);
    } finally {
      setAiActionBusy(null);
    }
  };

  const handleImportGguf = async (modelId: string) => {
    setAiInfoMessage(null);
    setAiErrorMessage(null);
    let selected: string | null = null;
    try {
      const result = await openFileDialog({
        title: "Select a .gguf model file",
        filters: [{ name: "GGUF Model", extensions: ["gguf"] }],
        multiple: false,
        directory: false,
      });
      selected = typeof result === "string" ? result : (result as { path?: string } | null)?.path ?? null;
    } catch {
      return;
    }
    if (!selected) return;
    setAiModelInstallState(modelId, "installing");
    setAiInstallProgress((prev) => ({
      ...prev,
      [modelId]: { model_id: modelId, status: "preparing", progress: 0, detail: t("settings.ai.preparingRuntime") },
    }));
    try {
      const progress = await invoke<AiModelInstallProgress>("ai_import_local_model", {
        ggufPath: selected,
        modelId,
      });
      handleInstallProgressUpdate(progress);
      if (!TERMINAL_INSTALL_STATUSES.has(progress.status)) startInstallPolling(modelId);
    } catch (error) {
      setAiModelInstallState(modelId, "error");
      setAiErrorMessage(`Failed to import ${modelId}: ${String(error)}`);
    }
  };

  const modelLabelById = useMemo(() => {
    const lookup = new Map<string, string>();
    for (const model of AI_MODEL_CATALOG) lookup.set(model.id, model.label);
    return lookup;
  }, []);

  const availableRoutingModels = useMemo(() => {
    const ids = new Set<string>(aiInstalledModelIds);
    if (aiDefaultModelId) ids.add(aiDefaultModelId);
    if (aiRewriteTranslateModelId) ids.add(aiRewriteTranslateModelId);
    if (ids.size === 0) ids.add(DEFAULT_AI_MODEL_ID);
    return Array.from(ids).sort((a, b) => {
      const ai = AI_MODEL_CATALOG.findIndex((m) => m.id === a);
      const bi = AI_MODEL_CATALOG.findIndex((m) => m.id === b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [aiInstalledModelIds, aiDefaultModelId, aiRewriteTranslateModelId]);

  // Sync diagnostics + installed list whenever the AI tab opens
  useEffect(() => {
    if (!open || tab !== "ai") return;
    // Don't auto-sync on tab switch — the Refresh buttons handle this.
    // Auto-syncing triggers Ollama detection which freezes the UI.
  }, [open, tab, aiProvider]);

  // Cleanup pollers on unmount
  useEffect(() => {
    return () => {
      Object.values(aiInstallPollersRef.current).forEach((id) => window.clearInterval(id));
      aiInstallPollersRef.current = {};
    };
  }, []);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const TABS: Array<{ key: SettingsTab; label: string; icon: any }> = [
    { key: "appearance", label: t("settings.tabs.appearance"), icon: SettingsIcon },
    { key: "lessons", label: t("settings.tabs.lessons"), icon: FileText },
    { key: "ai", label: t("settings.tabs.aiFeatures"), icon: Sparkles },
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
                          className="h-9 w-9 inline-flex items-center justify-center rounded-md text-[var(--tp-t-3)] hover:text-red-400 hover:bg-[var(--tp-bg-3)] transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  {subjects.length < 4 && (
                    <button
                      onClick={() => setSubjects([...subjects, { name: "", color: "#6366f1" }])}
                      className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors"
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

                <Section title={t("settings.ai.provider")}>
                  <FormRow label={t("settings.ai.aiProvider")}>
                    <select
                      className="tp-input"
                      value={aiProvider}
                      onChange={(e) => setAiProvider(e.target.value as any)}
                    >
                      <option value="ollama">{t("settings.ai.ollama")}</option>
                      <option value="direct-download">{t("settings.ai.directDownload")}</option>
                    </select>
                  </FormRow>
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      onClick={() => void handleEnsureRuntime()}
                      disabled={aiActionBusy === "ensure-runtime"}
                      className="tp-btn"
                    >
                      {aiActionBusy === "ensure-runtime" ? t("settings.ai.preparingRuntime") : t("settings.ai.setupRuntime")}
                    </button>
                    <span className="text-[11px]" style={{ color: "var(--tp-t-4)" }}>
                      {t("settings.ai.setupRuntimeHint")}
                    </span>
                  </div>
                </Section>

                <Section title={t("settings.ai.modelRouting")}>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormRow label={t("settings.ai.chatModel")}>
                      <select
                        className="tp-input"
                        value={aiDefaultModelId}
                        onChange={(e) => setAiDefaultModelId(e.target.value)}
                      >
                        {availableRoutingModels.map((id) => {
                          const installed = aiInstalledModelIds.includes(id);
                          const label = modelLabelById.get(id) || id;
                          return (
                            <option key={`chat-${id}`} value={id}>
                              {installed ? label : `${label} ${t("settings.ai.notInstalled")}`}
                            </option>
                          );
                        })}
                      </select>
                    </FormRow>
                    <FormRow label={t("settings.ai.rewriteTranslateModel")}>
                      <select
                        className="tp-input"
                        value={aiRewriteTranslateModelId}
                        onChange={(e) => setAiRewriteTranslateModelId(e.target.value)}
                      >
                        {availableRoutingModels.map((id) => {
                          const installed = aiInstalledModelIds.includes(id);
                          const label = modelLabelById.get(id) || id;
                          return (
                            <option key={`rw-${id}`} value={id}>
                              {installed ? label : `${label} ${t("settings.ai.notInstalled")}`}
                            </option>
                          );
                        })}
                      </select>
                    </FormRow>
                  </div>
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
                      <option value={0.1}>{t("settings.ai.creativityOptions.0.1")}</option>
                      <option value={0.4}>{t("settings.ai.creativityOptions.0.4")}</option>
                      <option value={0.7}>{t("settings.ai.creativityOptions.0.7")}</option>
                      <option value={1.0}>{t("settings.ai.creativityOptions.1.0")}</option>
                      <option value={1.4}>{t("settings.ai.creativityOptions.1.4")}</option>
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

                <Section title={t("settings.ai.modelCatalog")}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[12px]" style={{ color: "var(--tp-t-3)" }}>
                      {t("settings.ai.modelCatalogHint")}
                    </span>
                    <button
                      onClick={() => void syncInstalledModels()}
                      disabled={aiActionBusy === "refresh-models"}
                      className="tp-btn"
                      style={{ height: 30, padding: "0 12px", fontSize: 12 }}
                    >
                      <RefreshCw className={`w-3 h-3 ${aiActionBusy === "refresh-models" ? "animate-spin" : ""}`} />
                      {aiActionBusy === "refresh-models" ? t("settings.ai.refreshing") : t("settings.ai.refresh")}
                    </button>
                  </div>

                  {aiInstalledModelIds.length > 0 && (
                    <div
                      className="mb-3 rounded-md px-3 py-2"
                      style={{ background: "var(--tp-bg-2)", border: "1px solid var(--tp-b-1)" }}
                    >
                      <div className="text-[10px] uppercase tracking-wider mb-1.5 font-semibold" style={{ color: "var(--tp-t-4)" }}>
                        {t("settings.ai.detectedInstalledModels")}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {aiInstalledModelIds.map((id) => (
                          <div key={id} className="flex items-center">
                            <button
                              onClick={() => {
                                setAiDefaultModelId(id);
                                setAiRewriteTranslateModelId(id);
                              }}
                              className={`px-2 py-1 text-[11px] rounded-l border-y border-l transition-colors ${
                                aiDefaultModelId === id
                                  ? "border-[var(--tp-accent)] text-white"
                                  : "border-[var(--tp-b-2)] text-[var(--tp-t-2)] hover:bg-[var(--tp-bg-3)]"
                              }`}
                              style={aiDefaultModelId === id ? { background: "rgba(45,134,165,0.18)" } : undefined}
                              title={t("settings.ai.installedModelTooltip")}
                            >
                              {id}
                            </button>
                            <button
                              onClick={() => void handleRemoveModel(id)}
                              disabled={aiActionBusy === `remove:${id}`}
                              className="px-1.5 py-1 text-[11px] rounded-r border text-[var(--tp-t-3)] hover:text-red-400 hover:bg-red-400/10 disabled:opacity-50"
                              style={{ borderColor: "var(--tp-b-2)" }}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-2">
                    {AI_MODEL_CATALOG.map((model) => {
                      const installState = getModelInstallState(model.id);
                      const installProgress = aiInstallProgress[model.id];
                      const isInstalling =
                        installState === "installing" ||
                        installProgress?.status === "preparing" ||
                        installProgress?.status === "installing";
                      const isInstalled = installState === "installed";
                      const isDefault = aiDefaultModelId === model.id;
                      const isCanceling = aiActionBusy === `cancel:${model.id}`;
                      const isRemoving = aiActionBusy === `remove:${model.id}`;
                      const progressValue = Math.max(0, Math.min(100, installProgress?.progress ?? 0));
                      const progressText =
                        installProgress?.detail ||
                        (isInstalling ? t("settings.ai.downloadProgress", { percent: Math.round(progressValue) }) : undefined);

                      return (
                        <div
                          key={model.id}
                          className="rounded-lg px-3 py-3"
                          style={{ background: "var(--tp-bg-2)", border: "1px solid var(--tp-b-1)" }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[14px] font-medium" style={{ color: "var(--tp-t-1)" }}>
                                  {model.label}
                                </span>
                                <Badge>{model.tier}</Badge>
                                {model.recommended && <BadgeAccent>{t("settings.ai.recommended")}</BadgeAccent>}
                                {model.capabilities?.map((cap) => (
                                  <Badge key={`${model.id}-${cap}`}>{t(AI_MODEL_CAPABILITY_LABELS[cap])}</Badge>
                                ))}
                              </div>
                              <div className="text-[12px] mt-1" style={{ color: "var(--tp-t-3)" }}>
                                {model.description}
                              </div>
                              <div className="mt-2 flex items-center gap-3 text-[11px] flex-wrap" style={{ color: "var(--tp-t-4)" }}>
                                <span className="inline-flex items-center gap-1">
                                  <HardDriveDownload className="w-3 h-3" /> {model.estimatedDisk}
                                </span>
                                <span>{t("settings.ai.ramVramLabel", { value: model.recommendedRam })}</span>
                                <span>{t("settings.ai.contextLabel", { value: model.recommendedContext })}</span>
                                <span>{t("settings.ai.sourceOllama")}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {isInstalling && <Loader2 className="w-4 h-4 text-[var(--tp-accent)] animate-spin" />}
                              {!isInstalling && installState === "error" && (
                                <AlertCircle className="w-4 h-4 text-amber-400" />
                              )}
                              {!isInstalling && isInstalled && (
                                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                              )}
                            </div>
                          </div>

                          {isInstalling && (
                            <div className="mt-2">
                              <div className="h-1.5 w-full rounded overflow-hidden" style={{ background: "var(--tp-bg-3)" }}>
                                <div
                                  className="h-full transition-all duration-300"
                                  style={{ width: `${Math.max(progressValue, 3)}%`, background: "var(--tp-accent)" }}
                                />
                              </div>
                              {progressText && (
                                <div className="mt-1 text-[11px] truncate" style={{ color: "var(--tp-t-4)" }}>
                                  {progressText}
                                </div>
                              )}
                            </div>
                          )}

                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            {!isInstalled ? (
                              <>
                                <button
                                  onClick={() => void handleInstallModel(model.id)}
                                  disabled={isInstalling || isRemoving || aiActionBusy === "refresh-models"}
                                  className="tp-btn tp-btn-primary"
                                  style={{ height: 30, padding: "0 12px", fontSize: 12 }}
                                >
                                  {isInstalling ? t("settings.ai.installing") : t("settings.ai.install")}
                                </button>
                                <button
                                  onClick={() => void handleImportGguf(model.id)}
                                  disabled={isInstalling || isRemoving}
                                  className="tp-btn"
                                  style={{ height: 30, padding: "0 12px", fontSize: 12 }}
                                >
                                  {isInstalling ? t("settings.ai.importing") : t("settings.ai.importGguf")}
                                </button>
                                {isInstalling && (
                                  <button
                                    onClick={() => void handleCancelInstallModel(model.id)}
                                    disabled={isCanceling}
                                    className="tp-btn"
                                    style={{ height: 30, padding: "0 12px", fontSize: 12 }}
                                  >
                                    {isCanceling ? t("settings.ai.cancelling") : t("settings.ai.cancel")}
                                  </button>
                                )}
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => {
                                    setAiDefaultModelId(model.id);
                                    setAiRewriteTranslateModelId(model.id);
                                  }}
                                  className={`tp-btn ${isDefault ? "tp-btn-primary" : ""}`}
                                  style={{ height: 30, padding: "0 12px", fontSize: 12 }}
                                  title={t("settings.ai.setDefaultTooltip")}
                                >
                                  {isDefault ? t("settings.ai.default") : t("settings.ai.setDefault")}
                                </button>
                                <button
                                  onClick={() => void handleRemoveModel(model.id)}
                                  disabled={isRemoving || isInstalling}
                                  className="tp-btn"
                                  style={{ height: 30, padding: "0 12px", fontSize: 12 }}
                                >
                                  {t("settings.ai.remove")}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <p className="text-[11px] mt-3" style={{ color: "var(--tp-t-4)" }}>
                    {t("settings.ai.installHelp")}
                  </p>

                  {aiInfoMessage && (
                    <div
                      className="mt-2 text-[12px] rounded-md px-2 py-1.5"
                      style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", color: "#86efac" }}
                    >
                      {aiInfoMessage}
                    </div>
                  )}
                  {aiErrorMessage && (
                    <div
                      className="mt-2 text-[12px] rounded-md px-2 py-1.5"
                      style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", color: "#fbbf24" }}
                    >
                      {aiErrorMessage}
                    </div>
                  )}
                </Section>
              </>
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
                <Section title={t("settings.advanced.diagnostics")}>
                  <ToggleRow
                    label={t("settings.advanced.debugMode")}
                    desc={t("settings.advanced.debugModeDesc")}
                    value={debugMode}
                    onChange={setDebugMode}
                  />
                </Section>
              </>
            )}
          </div>
        </div>

        <div className="tp-settings-footer">
          <button onClick={onClose} className="tp-btn">{t("common.cancel")}</button>
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

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
      style={{ border: "1px solid var(--tp-b-2)", color: "var(--tp-t-3)" }}
    >
      {children}
    </span>
  );
}

function BadgeAccent({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
      style={{ border: "1px solid var(--tp-accent)", color: "var(--tp-accent)" }}
    >
      {children}
    </span>
  );
}
