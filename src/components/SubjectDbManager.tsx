import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { mkdir } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import {
  Folder, Trash2, RefreshCw, AlertCircle, CheckCircle2,
  Loader2, Database, Plus, ChevronDown, ChevronRight, Upload, FolderPlus,
  File,
} from "lucide-react";
import { useAppStore, type SubjectDbInfo, type SubjectDbFile } from "../store";
import { useTranslation } from "../i18n/useTranslation";

interface ImportResult {
  total_chunks: number;
  processed_files: number;
  errors: string[];
}

interface AddingState {
  type: "subject" | "grade" | "topic";
  subject?: string;
  grade?: string;
}

interface ProgressEvent {
  phase: string;
  filename?: string;
  subject?: string;
}

export function SubjectDbManager() {
  const { t } = useTranslation();
  const { vaultPath, subjectDatabases, setSubjectDatabases } = useAppStore();
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [diagnostic, setDiagnostic] = useState<string | null>(null);
  const [expandedSubjects, setExpandedSubjects] = useState<Record<string, boolean>>({});
  const [expandedGrades, setExpandedGrades] = useState<Record<string, boolean>>({});
  const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState<AddingState | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [progressMsg, setProgressMsg] = useState<string | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);

  const toggleSubject = (name: string) =>
    setExpandedSubjects((prev) => ({ ...prev, [name]: !prev[name] }));
  const toggleGrade = (key: string) =>
    setExpandedGrades((prev) => ({ ...prev, [key]: !prev[key] }));
  const toggleTopic = (key: string) =>
    setExpandedTopics((prev) => ({ ...prev, [key]: !prev[key] }));

  const fetchDatabases = useCallback(async () => {
    if (!vaultPath) return;
    try {
      const dbs = await invoke<SubjectDbInfo[]>("subject_db_list", { vaultPath });
      setSubjectDatabases(dbs);
    } catch (e) { setError(String(e)); }
  }, [vaultPath, setSubjectDatabases]);

  useEffect(() => {
    fetchDatabases();
  }, [fetchDatabases]);

  // ── Progress listener ──
  useEffect(() => {
    const setup = async () => {
      unlistenRef.current = await listen<ProgressEvent>("subject-db-progress", (event) => {
        const p = event.payload;
        if (p.phase === "subject") {
          setProgressMsg(`📁 ${p.subject}`);
        } else if (p.phase === "file") {
          setProgressMsg(`📄 ${p.filename}  (${p.subject || ""})`);
        }
      });
    };
    setup();
    return () => { unlistenRef.current?.(); };
  }, []);

  // ── Scan & Import ──
  const handleScanImport = async () => {
    if (!vaultPath) return;
    setImporting(true);
    setImportResult(null);
    setError(null);
    setProgressMsg(t("subjectDb.importing"));
    try {
      const result = await invoke<ImportResult>("subject_db_scan_import", { vaultPath });
      setImportResult(result);
      await fetchDatabases();
    } catch (e) { setError(String(e)); }
    finally { setImporting(false); setProgressMsg(null); }
  };

  // ── Pick & copy PDFs (all levels) ──
  const pickPdfs = async () => {
    const selected = await openFileDialog({
      multiple: true,
      filters: [{ name: "PDF files", extensions: ["pdf"] }],
    });
    return selected ? (Array.isArray(selected) ? selected : [selected]) : null;
  };

  const handleAddPdfsToTopic = async (subject: string, grade: string, topic: string) => {
    if (!vaultPath) return;
    const paths = await pickPdfs();
    if (!paths) return;
    try {
      setError(null);
      await invoke("subject_db_add_pdfs", { vaultPath, subject, grade, topic, filePaths: paths });
      await fetchDatabases();
    } catch (e) { setError(String(e)); }
  };

  const handleAddPdfsToGrade = async (subject: string, grade: string) => {
    if (!vaultPath) return;
    const paths = await pickPdfs();
    if (!paths) return;
    try {
      setError(null);
      await invoke("subject_db_add_pdfs", {
        vaultPath, subject, grade, topic: null as string | null, filePaths: paths,
      });
      await fetchDatabases();
    } catch (e) { setError(String(e)); }
  };

  const handleAddPdfsToSubject = async (subject: string) => {
    if (!vaultPath) return;
    const paths = await pickPdfs();
    if (!paths) return;
    try {
      setError(null);
      await invoke("subject_db_add_pdfs", {
        vaultPath, subject, grade: null as string | null, topic: null as string | null, filePaths: paths,
      });
      await fetchDatabases();
    } catch (e) { setError(String(e)); }
  };

  // ── Add folder inline ──
  const startAdding = (state: AddingState) => { setAdding(state); setInputValue(""); };
  const cancelAdding = () => { setAdding(null); setInputValue(""); };

  const confirmAdd = async () => {
    if (!vaultPath || !adding || !inputValue.trim()) return;
    try {
      const name = inputValue.trim();
      if (adding.type === "subject") {
        await mkdir(await join(vaultPath, "SubjectDBs", name), { recursive: true });
        setExpandedSubjects((prev) => ({ ...prev, [name]: true }));
      } else if (adding.type === "grade" && adding.subject) {
        await mkdir(await join(vaultPath, "SubjectDBs", adding.subject, name), { recursive: true });
        setExpandedGrades((prev) => ({ ...prev, [`${adding.subject}::${name}`]: true }));
      } else if (adding.type === "topic" && adding.subject && adding.grade) {
        await mkdir(await join(vaultPath, "SubjectDBs", adding.subject, adding.grade, name), { recursive: true });
      }
      cancelAdding();
      await fetchDatabases();
    } catch (e) { setError(String(e)); }
  };

  // ── Delete ──
  const handleDeleteFile = async (subject: string, grade: string | null, topic: string | null, filename: string) => {
    if (!vaultPath) return;
    try {
      await invoke("subject_db_delete_file", {
        vaultPath, subject, grade, topic, filename,
      });
      await fetchDatabases();
    } catch (e) { setError(String(e)); }
  };
  const handleDeleteTopic = async (s: string, g: string, t: string) => {
    if (!vaultPath) return;
    try { await invoke("subject_db_delete", { vaultPath, subject: s, grade: g, topic: t }); await fetchDatabases(); }
    catch (e) { setError(String(e)); }
  };
  const handleDeleteGrade = async (s: string, g: string) => {
    if (!vaultPath) return;
    try { await invoke("subject_db_delete", { vaultPath, subject: s, grade: g, topic: null }); await fetchDatabases(); }
    catch (e) { setError(String(e)); }
  };
  const handleDeleteSubject = async (s: string) => {
    if (!vaultPath) return;
    try { await invoke("subject_db_delete", { vaultPath, subject: s, grade: null, topic: null }); await fetchDatabases(); }
    catch (e) { setError(String(e)); }
  };

  // ── Render file line ──
  const renderFileRow = (
    file: SubjectDbFile,
    key: string,
    onDelete: () => void,
  ) => (
    <div key={key} className="flex items-center justify-between px-3 py-1.5 gap-2 hover:bg-[var(--tp-panel-elevated)]">
      <div className="flex items-center gap-2 min-w-0">
        <File className="w-3.5 h-3.5 shrink-0 text-[var(--tp-text-muted)]" />
        <span className="text-xs text-[var(--tp-text-primary)] truncate">{file.name}</span>
        {file.is_embedded && (
          <span className="text-[10px] text-emerald-400 shrink-0">{t("subjectDb.embedded")}</span>
        )}
        {!file.is_embedded && (
          <span className="text-[10px] text-amber-400 shrink-0">{t("subjectDb.pending")}</span>
        )}
      </div>
      <button onClick={onDelete}
        className="h-5 w-5 inline-flex items-center justify-center rounded text-[var(--tp-text-muted)] hover:text-red-400"
        title={t("common.delete")}>
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );

  if (!vaultPath) {
    return <div className="flex items-center justify-center h-32 text-sm text-[var(--tp-text-muted)]">No vault configured.</div>;
  }

  return (
    <div>
      {/* Top bar */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-[var(--tp-accent)]" />
          <span className="text-sm font-semibold text-[var(--tp-text-primary)]">{t("subjectDb.title")}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => startAdding({ type: "subject" })}
            className="tp-action-btn px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> {t("common.create")}
          </button>
          <button onClick={handleScanImport} disabled={importing}
            className="tp-action-btn px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed">
            {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {importing ? t("subjectDb.importing") : t("subjectDb.scanImport")}
          </button>
        </div>
      </div>

      {/* Inline add form for new subject */}
      {adding?.type === "subject" && (
        <div className="mb-3 px-3 py-2 rounded-lg border border-[var(--tp-border-strong)] bg-[var(--tp-panel-muted)] flex items-center gap-2">
          <Folder className="w-4 h-4 shrink-0 text-[var(--tp-accent)]" />
          <input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void confirmAdd(); if (e.key === "Escape") cancelAdding(); }}
            placeholder={t("subjectDb.newSubjectPlaceholder")}
            className="flex-1 min-w-0 bg-transparent text-xs text-[var(--tp-text-primary)] outline-none border-b border-transparent focus:border-[var(--tp-accent)]" autoFocus />
          <button onClick={confirmAdd} disabled={!inputValue.trim()}
            className="tp-action-btn px-2 py-1 rounded text-xs font-medium disabled:opacity-40">OK</button>
          <button onClick={cancelAdding} className="text-[var(--tp-text-muted)] hover:text-[var(--tp-text-primary)] text-xs">✕</button>
        </div>
      )}

      {/* Progress bar */}
      {importing && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-[var(--tp-panel-muted)] text-xs space-y-1">
          <div className="flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin text-[var(--tp-accent)]" />
            <span className="text-[var(--tp-text-muted)]">{t("subjectDb.importing")}</span>
          </div>
          {progressMsg && <p className="text-[10px] text-[var(--tp-text-muted)] pl-5 truncate">{progressMsg}</p>}
          <div className="w-full h-1.5 rounded-full bg-gray-700 overflow-hidden">
            <div className="h-full bg-[var(--tp-accent)] rounded-full animate-pulse" style={{ width: "80%" }} />
          </div>
        </div>
      )}

      {/* Result/Error */}
      {importResult && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-[var(--tp-panel-muted)] text-xs">
          <p className="text-green-400 flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            {t("subjectDb.result.imported", { chunks: importResult.total_chunks, files: importResult.processed_files })}
          </p>
          {importResult.errors.length > 0 && (
            <div className="mt-1 max-h-20 overflow-y-auto">
              {importResult.errors.map((err, i) => (
                <p key={i} className="text-red-400 flex items-center gap-1.5"><AlertCircle className="w-3 h-3 shrink-0" />{err}</p>
              ))}
            </div>
          )}
        </div>
      )}
      {error && !importResult && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-red-900/30 text-xs text-red-400 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}
        </div>
      )}
      {diagnostic && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-[var(--tp-panel-muted)] text-xs whitespace-pre-wrap" style={{ color: "var(--tp-text-primary)" }}>
          {diagnostic}
        </div>
      )}

      {/* Empty state */}
      {subjectDatabases.length === 0 && !importing && (
        <div className="flex flex-col items-center justify-center h-32 text-xs text-[var(--tp-text-muted)]">
          <Database className="w-6 h-6 mb-2 opacity-40" />
          <p className="text-center max-w-xs leading-relaxed">{t("subjectDb.noDatabases")}</p>
        </div>
      )}

      {/* ── Tree ── */}
      <div className="space-y-2">
        {subjectDatabases.map((subject) => (
          <div key={subject.subject} className="rounded-lg border border-[var(--tp-border-strong)] bg-[var(--tp-panel-muted)] overflow-hidden">
            {/* Subject row */}
            <div className="flex items-center justify-between px-3 py-2.5 bg-[var(--tp-panel-elevated)] gap-2">
              <button onClick={() => toggleSubject(subject.subject)}
                className="flex items-center gap-2 min-w-0 flex-1 text-left">
                {expandedSubjects[subject.subject]
                  ? <ChevronDown className="w-4 h-4 shrink-0 text-[var(--tp-text-muted)]" />
                  : <ChevronRight className="w-4 h-4 shrink-0 text-[var(--tp-text-muted)]" />}
                <Folder className="w-4 h-4 shrink-0 text-[var(--tp-accent)]" />
                <span className="text-sm font-medium text-[var(--tp-text-primary)] truncate">{subject.subject}</span>
                <span className="text-[10px] text-[var(--tp-text-muted)]">
                  {subject.grades.reduce((s, g) => s + g.topics.reduce((a, t) => a + t.chunk_count, 0), 0)} chunks
                </span>
              </button>
              <div className="flex items-center gap-0.5 shrink-0">
                <button onClick={() => startAdding({ type: "grade", subject: subject.subject })}
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md text-[var(--tp-text-muted)] hover:text-[var(--tp-accent)] hover:bg-[var(--tp-panel-muted)] transition-colors"
                  title={t("subjectDb.addSubfolder")}>
                  <FolderPlus className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handleAddPdfsToSubject(subject.subject)}
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md text-[var(--tp-text-muted)] hover:text-[var(--tp-accent)] hover:bg-[var(--tp-panel-muted)] transition-colors"
                  title={t("subjectDb.addPdfs")}>
                  <Upload className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handleDeleteSubject(subject.subject)}
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md text-[var(--tp-text-muted)] hover:text-red-400 hover:bg-red-900/20 transition-colors"
                  title={t("common.delete")}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Files directly in subject */}
            {expandedSubjects[subject.subject] && subject.files.length > 0 && (
              <div>
                {subject.files.map((f) => renderFileRow(f, `sf-${f.name}`, () => handleDeleteFile(subject.subject, null, null, f.name)))}
              </div>
            )}

            {/* Grades */}
            {expandedSubjects[subject.subject] && (
              <div className="pl-3 py-1">
                {adding?.type === "grade" && adding.subject === subject.subject && (
                  <div className="flex items-center gap-2 mx-3 mb-1 px-2 py-1.5 rounded-md bg-[var(--tp-panel-elevated)] border border-[var(--tp-border-strong)]">
                    <Folder className="w-3.5 h-3.5 shrink-0 text-[var(--tp-accent)]" />
                    <input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") void confirmAdd(); if (e.key === "Escape") cancelAdding(); }}
                      placeholder={t("subjectDb.newGradePlaceholder")}
                      className="flex-1 min-w-0 bg-transparent text-xs text-[var(--tp-text-primary)] outline-none border-b border-transparent focus:border-[var(--tp-accent)]" autoFocus />
                    <button onClick={confirmAdd} disabled={!inputValue.trim()}
                      className="tp-action-btn px-1.5 py-0.5 rounded text-[10px] font-medium disabled:opacity-40">OK</button>
                    <button onClick={cancelAdding}
                      className="text-[var(--tp-text-muted)] hover:text-[var(--tp-text-primary)] text-[10px]">✕</button>
                  </div>
                )}

                {subject.grades.map((grade) => {
                  const gradeKey = `${subject.subject}::${grade.name}`;
                  return (
                    <div key={grade.name}>
                      {/* Grade row */}
                      <div className="flex items-center justify-between px-3 py-2.5 gap-2">
                        <button onClick={() => toggleGrade(gradeKey)}
                          className="flex items-center gap-2 min-w-0 flex-1 text-left">
                          {expandedGrades[gradeKey]
                            ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-[var(--tp-text-muted)]" />
                            : <ChevronRight className="w-3.5 h-3.5 shrink-0 text-[var(--tp-text-muted)]" />}
                          <Folder className="w-3.5 h-3.5 shrink-0 text-[var(--tp-text-muted)]" />
                          <span className="text-xs font-medium text-[var(--tp-text-primary)] truncate">{grade.name}</span>
                          <span className="text-[10px] text-[var(--tp-text-muted)]">
                            {grade.topics.reduce((s, t) => s + t.chunk_count, 0)} chunks
                          </span>
                        </button>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button onClick={() => startAdding({ type: "topic", subject: subject.subject, grade: grade.name })}
                            className="h-6 w-6 inline-flex items-center justify-center rounded-md text-[var(--tp-text-muted)] hover:text-[var(--tp-accent)] hover:bg-[var(--tp-panel-muted)] transition-colors"
                            title={t("subjectDb.addSubfolder")}>
                            <FolderPlus className="w-3 h-3" />
                          </button>
                          <button onClick={() => handleAddPdfsToGrade(subject.subject, grade.name)}
                            className="h-6 w-6 inline-flex items-center justify-center rounded-md text-[var(--tp-text-muted)] hover:text-[var(--tp-accent)] hover:bg-[var(--tp-panel-muted)] transition-colors"
                            title={t("subjectDb.addPdfs")}>
                            <Upload className="w-3 h-3" />
                          </button>
                          <button onClick={() => handleDeleteGrade(subject.subject, grade.name)}
                            className="h-6 w-6 inline-flex items-center justify-center rounded-md text-[var(--tp-text-muted)] hover:text-red-400 hover:bg-red-900/20 transition-colors"
                            title={t("common.delete")}>
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* Files directly in grade */}
                      {expandedGrades[gradeKey] && grade.files.length > 0 && (
                        <div>
                          {grade.files.map((f) => renderFileRow(f, `gf-${f.name}`, () => handleDeleteFile(subject.subject, grade.name, null, f.name)))}
                        </div>
                      )}

                      {/* Topics */}
                      {expandedGrades[gradeKey] && (
                        <div className="pl-6 pr-3 py-0.5 space-y-0.5">
                          {adding?.type === "topic" && adding.subject === subject.subject && adding.grade === grade.name && (
                            <div className="flex items-center gap-2 mx-2 mb-0.5 px-2 py-1 rounded-md bg-[var(--tp-panel-elevated)] border border-[var(--tp-border-strong)]">
                              <Folder className="w-3.5 h-3.5 shrink-0 text-[var(--tp-accent)]" />
                              <input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") void confirmAdd(); if (e.key === "Escape") cancelAdding(); }}
                                placeholder={t("subjectDb.newTopicPlaceholder")}
                                className="flex-1 min-w-0 bg-transparent text-xs text-[var(--tp-text-primary)] outline-none border-b border-transparent focus:border-[var(--tp-accent)]" autoFocus />
                              <button onClick={confirmAdd} disabled={!inputValue.trim()}
                                className="tp-action-btn px-1.5 py-0.5 rounded text-[10px] font-medium disabled:opacity-40">OK</button>
                              <button onClick={cancelAdding}
                                className="text-[var(--tp-text-muted)] hover:text-[var(--tp-text-primary)] text-[10px]">✕</button>
                            </div>
                          )}

                          {grade.topics.map((topic) => {
                            const topicKey = `${subject.subject}::${grade.name}::${topic.name}`;
                            const hasFiles = topic.files.length > 0;
                            return (
                            <div key={topic.name}>
                              {/* Topic row */}
                              <div className="flex items-center justify-between px-3 py-2.5 gap-2 hover:bg-[var(--tp-panel-elevated)]">
                                <button
                                  onClick={() => hasFiles ? toggleTopic(topicKey) : undefined}
                                  className="flex items-center gap-2 min-w-0 flex-1 text-left"
                                  disabled={!hasFiles}
                                >
                                  {hasFiles ? (
                                    expandedTopics[topicKey]
                                      ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-[var(--tp-text-muted)]" />
                                      : <ChevronRight className="w-3.5 h-3.5 shrink-0 text-[var(--tp-text-muted)]" />
                                  ) : (
                                    <span className="w-3.5 h-3.5 shrink-0" />
                                  )}
                                  <Folder className="w-3.5 h-3.5 shrink-0 text-[var(--tp-text-muted)]" />
                                  <span className="text-xs font-medium text-[var(--tp-text-primary)] truncate">{topic.name}</span>
                                  <span className="text-[10px] text-[var(--tp-text-muted)]">
                                    {topic.chunk_count > 0 ? `${topic.chunk_count} chunks` : t("subjectDb.notEmbedded")}
                                  </span>
                                  {topic.pending_pdfs > 0 && (
                                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-900/40 text-[10px] text-amber-300">
                                      {topic.pending_pdfs}
                                    </span>
                                  )}
                                </button>
                                <div className="flex items-center gap-0.5 shrink-0">
                                  <button onClick={() => handleAddPdfsToTopic(subject.subject, grade.name, topic.name)}
                                    className="h-6 w-6 inline-flex items-center justify-center rounded-md text-[var(--tp-text-muted)] hover:text-[var(--tp-accent)] hover:bg-[var(--tp-panel-muted)] transition-colors"
                                    title={t("subjectDb.addPdfs")}>
                                    <Upload className="w-3 h-3" />
                                  </button>
                                  <button onClick={() => handleDeleteTopic(subject.subject, grade.name, topic.name)}
                                    className="h-6 w-6 inline-flex items-center justify-center rounded-md text-[var(--tp-text-muted)] hover:text-red-400 hover:bg-red-900/20 transition-colors"
                                    title={t("common.delete")}>
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                              {/* Files inside this topic */}
                              {hasFiles && expandedTopics[topicKey] && (
                                <div className="pl-8">
                                  {topic.files.map((f) => renderFileRow(f, `tf-${f.name}`, () => handleDeleteFile(subject.subject, grade.name, topic.name, f.name)))}
                                </div>
                              )}
                            </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-[var(--tp-border-strong)] text-[10px] text-[var(--tp-text-muted)] leading-relaxed">
        <p className="mb-2"><Database className="w-2.5 h-2.5 inline-block mr-1" />{t("subjectDb.folderHint")}</p>
        <button onClick={async () => {
          if (!vaultPath) return;
          try {
            const diag = await invoke<Array<{subject: string; grade: string; topic: string; chunk_count: number; has_store: boolean; store_path: string; embedding_model_available: boolean}>>("subject_db_diagnose", { vaultPath });
            const msg = diag.map((d) => `${d.subject}/${d.grade}/${d.topic}: ${d.chunk_count} chunks (store: ${d.has_store})`).join("\n");
            const modelStatus = diag.length > 0 ? `\nbge-m3: ${diag[0].embedding_model_available ? "✅ verfügbar" : "❌ NICHT verfügbar"}` : "\nKeine Datenbanken";
            setDiagnostic(msg + modelStatus);
          } catch (e) {
            setDiagnostic("Fehler: " + String(e));
          }
        }} className="tp-action-btn px-2 py-0.5 rounded text-[10px] font-medium">
          Diagnose
        </button>
      </div>
    </div>
  );
}
