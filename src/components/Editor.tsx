import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { Placeholder } from "@tiptap/extension-placeholder";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import UnderlineExtension from "@tiptap/extension-underline";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format as formatDateFn,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { de as deLocale } from "date-fns/locale";
import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { listen as tauriListen } from "@tauri-apps/api/event";
import { useAppStore } from "../store";
import { useTranslation } from "../i18n/useTranslation";
import { useCallback, useEffect, useRef, useState } from "react";
import { doesV3ModelSupportThinking } from "../ai/modelCatalog";
import type { ScoredChunk, ChatMessage, SubjectDbInfo, LessonMetadata, LessonData } from "../store";
import { MaterialLink } from "./extensions/MaterialLink";
import { TextStyle, FontFamily } from "@tiptap/extension-text-style";
import { FontSize } from "./extensions/FontSize";
import { UnderlineColor } from "./extensions/UnderlineColor";
import { formatIsoToEuropeanDate, parseEuropeanDateToDate, parseEuropeanDateToIso } from "../utils/dates";
import { normalizeColorForPicker } from "../utils/colors";
import { snapSelectionInsideTextblock } from "../utils/editorSelection";
import { registerCloseFlusher } from "../utils/closeFlush";
import { AppLink, WordStyleTextAlign } from "./editor/editorExtensions";
import { MenuBar } from "./editor/MenuBar";
import { LessonPdfPreviewModal } from "./editor/LessonPdfPreviewModal";
import { useLessonPdf } from "./editor/useLessonPdf";
import { EditorContextMenu } from "./editor/EditorContextMenu";
import { NotesPanel } from "./editor/NotesPanel";
import { MethodBankPanel } from "./editor/MethodBankPanel";
import { AiChatPanel } from "./editor/AiChatPanel";
import type { AiChatMessage } from "./editor/AiChatPanel";

// Chat is session-level, not persisted to disk. Keeping it in a module-level
// cache keyed by document identity means remounting the editor (which we do to
// reset TipTap's undo history between lessons) does not drop the conversation.
const chatCacheByDocument = new Map<string, AiChatMessage[]>();
let lastChatDocumentId: string | null = null;
import type { SubjectDbScope } from "./editor/SubjectDbPicker";
import { DraftGeneratorDialog } from "./editor/DraftGeneratorDialog";
import type { SelectedTextRange, TableContextMenuState } from "./editor/EditorContextMenu";
import { normalizeAiFragmentOutput } from "../utils/aiText";
import type { MaterialDropPayload } from "../utils/editorDnD";
import { getMaterialDropPayload, hasMaterialDropData, hasMethodDropData } from "../utils/editorDnD";
import type { MethodBankItem, MethodBankType, MethodDropPayload } from "../utils/methodBank";
import { METHOD_TYPE_ACCENT, getMethodDropPayload, parseMethodBankSeed } from "../utils/methodBank";
import { clampContextMenuPosition } from "../utils/contextMenu";
import {
  Table as TableIcon,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface SlashMenuState {
  query: string;
  from: number;
  to: number;
  x: number;
  y: number;
  requiredType: MethodBankType | "time";
  selectedIndex: number;
}

// Conservative ratio for German/English: exact counts from the engine
// tokenizer replace this where available.
const CHARS_PER_TOKEN_ESTIMATE = 3.5;
const MAX_LESSON_CONTEXT_CHARS = 500_000;

function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Retrieved PDF text is untrusted. Prevent it from closing/opening the
// excerpt delimiter and injecting instructions outside the data block.
function sanitizeExcerptText(value: string): string {
  return value.replace(/<\/?excerpt\b[^>]*>/gi, "[excerpt]");
}


/**
 * Split a raw model response into thinking content and actual response.
 * The thinking content comes from <think>...</think> blocks.
 */

export function Editor() {
  const {
    activeFileContent,
    activeFilePath,
    saveActiveLesson,
    saveLessonAtPath,
    vaultPath,
    draggedMaterial,
    setDraggedMaterial,
    pendingMaterialDrop,
    setPendingMaterialDrop,
    logDebug,
    subjects,
    aiEnabled,
    setAiStatusMessage,
    aiV3ChatModelId,
    aiV3RewriteModelId,
    aiChatHistoryLimit,
    aiTemperature,
    aiSystemPrompt,
    aiThinkingEnabled,
    setAiThinkingEnabled,
    aiPersistChats,
    aiTranslateTargetLanguage,
    defaultLessonTableBodyRows,
    setSidebarOpen,
    setEditorActions,
    setDocumentSaveState,
    lessonZoomMode,
    lessonZoomFixed,
    setLessonZoomMode,
    setLessonZoomFixed,
    language,

    subjectDatabases,
    activeChatDb,
    activeChatGrade,
    activeChatTopic,
    activeChatFile,
    setActiveChatDb,
    setActiveChatGrade,
    setActiveChatTopic,
    setActiveChatFile,
    setChatContextBudget,
    setSubjectDatabases,
  } = useAppStore();
  const { t } = useTranslation();
  const [subject, setSubject] = useState(activeFileContent?.metadata?.subject || "");
  const [teacher, setTeacher] = useState(activeFileContent?.metadata?.teacher || "");
  const [lessonNotes, setLessonNotes] = useState(activeFileContent?.notes || "");
  const [plannedForInput, setPlannedForInput] = useState(
    formatIsoToEuropeanDate(activeFileContent?.metadata?.plannedFor),
  );
  const [isAiBusy, setIsAiBusy] = useState(false);
  const [tableContextMenu, setTableContextMenu] = useState<TableContextMenuState | null>(null);
  const [customTableDialog, setCustomTableDialog] = useState<{
    rows: number;
    cols: number;
    withHeaderRow: boolean;
  } | null>(null);
  const [draftDialogOpen, setDraftDialogOpen] = useState(false);
  const [plannedCalendarOpen, setPlannedCalendarOpen] = useState(false);
  const [plannedCalendarMonth, setPlannedCalendarMonth] = useState(new Date());
  const [notesOpen, setNotesOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [methodBankOpen, setMethodBankOpen] = useState(false);
  const [methodBankItems, setMethodBankItems] = useState<MethodBankItem[]>([]);
  const [methodBankLoading, setMethodBankLoading] = useState(true);
  const [methodBankError, setMethodBankError] = useState<string | null>(null);
  const [draggedMethod, setDraggedMethod] = useState<MethodDropPayload | null>(null);
  const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null);
  const [, setIsEditorDropActive] = useState(false);
  const [expandedThinking, setExpandedThinking] = useState<Set<string>>(new Set());
  const modelSupportsThinking = doesV3ModelSupportThinking(aiV3ChatModelId);
  const lessonEditorDragDropEnabled = true;

  const paperScrollRef = useRef<HTMLDivElement | null>(null);
  const [fitZoom, setFitZoom] = useState(1);
  // Last colors picked in the rail — reused for one-click re-application.
  const [highlightColor, setHighlightColor] = useState("#fef08a");
  const [textColor, setTextColor] = useState<string | null>(null);
  const [underlineColor, setUnderlineColor] = useState<string | null>(null);
  // Set briefly by the Mod+Shift+V keydown so the next paste inserts plain text.
  const plainPasteRef = useRef(false);

  // Auto-close chat when AI is turned off in settings.
  useEffect(() => {
    if (!aiEnabled) {
      setChatOpen(false);
    }
  }, [aiEnabled]);

  // Word-style shortcut: Mod+P starts the app print flow instead of the
  // webview's own print of the raw UI.
  useEffect(() => {
    const onPrintShortcut = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === "p"
      ) {
        event.preventDefault();
        printRef.current();
      }
    };
    window.addEventListener("keydown", onPrintShortcut);
    return () => window.removeEventListener("keydown", onPrintShortcut);
  }, []);

  // Compute fit-to-width zoom: available width / paper width, clamped to [0.5, 2.0]
  // (ceiling 2.0 lets ultrawide windows fill the paper instead of leaving margins).
  useEffect(() => {
    const scroll = paperScrollRef.current;
    if (!scroll) return;

    const paperW =
      parseFloat(
        getComputedStyle(document.documentElement)
          .getPropertyValue("--tp-paper-w")
          .trim(),
      ) || 1118;

    const compute = () => {
      // Subtract horizontal padding (24px * 2) from scroll box for content area.
      const available = Math.max(0, scroll.clientWidth - 48);
      if (available <= 0) return;
      const raw = available / paperW;
      const clamped = Math.max(0.5, Math.min(2, raw));
      setFitZoom((prev) => (Math.abs(prev - clamped) < 0.001 ? prev : clamped));
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(scroll);
    return () => ro.disconnect();
  }, []);

  // Keyboard shortcuts: Cmd/Ctrl + = zoom in, - zoom out, 0 reset to Fit.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        const base = lessonZoomMode === "fit" ? fitZoom : lessonZoomFixed;
        setLessonZoomFixed(Math.round((base + 0.1) * 100) / 100);
      } else if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        const base = lessonZoomMode === "fit" ? fitZoom : lessonZoomFixed;
        setLessonZoomFixed(Math.round((base - 0.1) * 100) / 100);
      } else if (e.key === "0") {
        e.preventDefault();
        setLessonZoomMode("fit");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lessonZoomMode, lessonZoomFixed, fitZoom, setLessonZoomMode, setLessonZoomFixed]);

  const effectiveZoom = lessonZoomMode === "fit" ? fitZoom : lessonZoomFixed;

  const toggleChatPanel = useCallback(() => {
    setChatOpen((previous) => {
      const next = !previous;
      if (next) {
        setSidebarOpen(true);
        setNotesOpen(false);
        setMethodBankOpen(false);
      }
      return next;
    });
  }, [setSidebarOpen]);

  const toggleNotesPanel = useCallback(() => {
    setNotesOpen((previous) => {
      const next = !previous;
      if (next) {
        setSidebarOpen(true);
        setChatOpen(false);
        setMethodBankOpen(false);
      }
      return next;
    });
  }, [setSidebarOpen]);

  const toggleMethodBankPanel = useCallback(() => {
    setMethodBankOpen((previous) => {
      const next = !previous;
      if (next) {
        setSidebarOpen(true);
        setChatOpen(false);
        setNotesOpen(false);
      }
      return next;
    });
  }, [setSidebarOpen]);

  const closeEditorSidePanels = useCallback(() => {
    setChatOpen(false);
    setNotesOpen(false);
    setMethodBankOpen(false);
  }, []);

  const [chatInput, setChatInput] = useState("");
  const [isChatBusy, setIsChatBusy] = useState(false);
  const [chatMessages, setChatMessages] = useState<AiChatMessage[]>(() => {
    const initialDocumentId =
      activeFileContent?.metadata?.createdAt ?? activeFilePath ?? null;
    return initialDocumentId && aiPersistChats
      ? chatCacheByDocument.get(initialDocumentId) ?? []
      : [];
  });
  const ragChunksRef = useRef<ScoredChunk[]>([]);
  const activeStreamIdRef = useRef<string | null>(null);

  const stopAiStreaming = useCallback(async () => {
    const id = activeStreamIdRef.current;
    if (!id) return;
    try {
      await tauriInvoke("ai_chat_cancel", { requestId: id });
    } catch (e) {
      console.error("stream cancel failed:", e);
    }
  }, []);

  const selectDb = useCallback((scope: SubjectDbScope) => {
    ragChunksRef.current = [];
    setActiveChatDb(scope.subject || null);
    setActiveChatGrade(scope.grade);
    setActiveChatTopic(scope.topic);
    setActiveChatFile(scope.file);
  }, [setActiveChatDb, setActiveChatGrade, setActiveChatTopic, setActiveChatFile]);
  const editorSurfaceRef = useRef<HTMLDivElement | null>(null);
  const plannedCalendarRef = useRef<HTMLDivElement | null>(null);
  const lastSavedSnapshotRef = useRef<string>("");

  // ── Autosave machinery (ref-based, so typing no longer re-renders the tree) ──
  const editorRef = useRef<any>(null);
  const autosaveTimerRef = useRef<number | null>(null);
  // Even while the user is typing without a 1.8 s pause, force a save at
  // least this often so a crash cannot lose an unbounded editing session.
  const maxAutosaveTimerRef = useRef<number | null>(null);
  const MAX_AUTOSAVE_INTERVAL_MS = 15_000;
  // Latest document JSON, captured on every editor update. Lets the
  // switch/unmount flush read the outgoing document even after the editor
  // instance has been destroyed.
  const latestDocJsonRef = useRef<any>(null);
  // The vault path whose content the editor currently holds (set on load).
  const autosavePathRef = useRef<string | null>(null);
  // Stable document identity. A save-driven rename changes the path but not
  // the identity, so it must not reset the dirty/revision bookkeeping.
  const autosaveDocIdRef = useRef<string | null>(
    activeFileContent?.metadata?.createdAt ?? null,
  );
  // Latest autosave inputs. Updated after every commit; the flush reads it
  // during effect cleanup, i.e. while it still holds the outgoing lesson's
  // values (the sync effects for the incoming lesson have not run yet).
  const autosaveInputsRef = useRef<{
    teacher: string;
    subject: string;
    plannedForInput: string;
    lessonNotes: string;
    lastKnownPlannedFor: string | null;
    baseMetadata: LessonMetadata | null;
  }>({
    teacher,
    subject,
    plannedForInput,
    lessonNotes,
    lastKnownPlannedFor: activeFileContent?.metadata?.plannedFor ?? null,
    baseMetadata: activeFileContent?.metadata ?? null,
  });
  useEffect(() => {
    autosaveInputsRef.current = {
      teacher,
      subject,
      plannedForInput,
      lessonNotes,
      lastKnownPlannedFor: activeFileContent?.metadata?.plannedFor ?? null,
      baseMetadata: activeFileContent?.metadata ?? null,
    };
  });

  // The metadata values as last persisted. Autosave triggers compare against
  // these so a timer that fires after merely *opening* a lesson (the metadata
  // sync effects re-arm the autosave on load) can never write to disk when
  // nothing actually changed — regardless of any JSON normalization noise
  // between the store object and editor.getJSON().
  const lastSavedMetaRef = useRef({
    teacher: activeFileContent?.metadata?.teacher || "",
    subject: activeFileContent?.metadata?.subject || "",
    plannedFor: activeFileContent?.metadata?.plannedFor || null,
    notes: activeFileContent?.notes || "",
  });
  const docDirtyRef = useRef(false);
  // Incremented on every content/metadata change. A save that finishes after
  // the user typed again must not clear the dirty flag for those newer edits.
  const docRevisionRef = useRef(0);

  const metaIsDirty = useCallback(
    (candidate: {
      teacher: string;
      subject: string;
      notes: string;
      plannedFor: string | null;
    }) =>
      candidate.teacher !== lastSavedMetaRef.current.teacher ||
      candidate.subject !== lastSavedMetaRef.current.subject ||
      candidate.notes !== lastSavedMetaRef.current.notes ||
      candidate.plannedFor !== lastSavedMetaRef.current.plannedFor,
    [],
  );
  const chatDocumentId = activeFileContent?.metadata?.createdAt ?? activeFilePath ?? null;

  // Keep the session-level chat cache current. The editor is remounted when
  // the document identity changes (to reset undo history), so this cache is
  // what preserves a conversation across lesson switches.
  useEffect(() => {
    if (chatDocumentId && aiPersistChats) {
      chatCacheByDocument.set(chatDocumentId, chatMessages);
    }
  }, [chatDocumentId, aiPersistChats, chatMessages]);

  // Reset the knowledge-base scope when the document identity changes. This
  // module-level marker survives the editor remount.
  useEffect(() => {
    if (lastChatDocumentId === chatDocumentId) {
      return;
    }
    lastChatDocumentId = chatDocumentId;
    setActiveChatDb(null);
    setActiveChatGrade(null);
    setActiveChatTopic(null);
    setActiveChatFile(null);
    ragChunksRef.current = [];
  }, [
    chatDocumentId,
    setActiveChatDb,
    setActiveChatGrade,
    setActiveChatTopic,
    setActiveChatFile,
  ]);

  useEffect(() => {
    let isCancelled = false;

    const loadMethodBank = async () => {
      setMethodBankLoading(true);
      setMethodBankError(null);

      try {
        const url = language === "de" ? "/method-bank.de.json" : "/method-bank.json";
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const parsed = parseMethodBankSeed(await response.json());
        if (!isCancelled) {
          setMethodBankItems(parsed);
        }
      } catch (error) {
        if (!isCancelled) {
          setMethodBankItems([]);
          setMethodBankError(`${t("editor.methodBank.loadingFailed")}: ${String(error)}`);
        }
      } finally {
        if (!isCancelled) {
          setMethodBankLoading(false);
        }
      }
    };

    void loadMethodBank();

    return () => {
      isCancelled = true;
    };
  }, [language]);

  useEffect(() => {
    setSubject(activeFileContent?.metadata?.subject || "");
    setTeacher(activeFileContent?.metadata?.teacher || "");
    setLessonNotes(activeFileContent?.notes || "");
    setPlannedForInput(formatIsoToEuropeanDate(activeFileContent?.metadata?.plannedFor));
    const selectedDate = parseEuropeanDateToDate(
      formatIsoToEuropeanDate(activeFileContent?.metadata?.plannedFor),
    );
    setPlannedCalendarMonth(selectedDate || new Date());
  }, [
    activeFileContent?.metadata?.subject,
    activeFileContent?.metadata?.teacher,
    activeFileContent?.metadata?.plannedFor,
    activeFileContent?.notes,
  ]);

  useEffect(() => {
    const closeMenu = () => {
      setTableContextMenu(null);
      setSlashMenu(null);
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setTableContextMenu(null);
        setSlashMenu(null);
        setPlannedCalendarOpen(false);
        closeEditorSidePanels();
      }
    };

    window.addEventListener("click", closeMenu);
    window.addEventListener("keydown", onEscape, true);

    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", onEscape, true);
    };
  }, [closeEditorSidePanels]);

  useEffect(() => {
    if (!plannedCalendarOpen) {
      return;
    }

    const closeOnOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!plannedCalendarRef.current?.contains(target)) {
        setPlannedCalendarOpen(false);
      }
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPlannedCalendarOpen(false);
      }
    };

    window.addEventListener("mousedown", closeOnOutside);
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("mousedown", closeOnOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [plannedCalendarOpen]);


  const editor = useEditor({
    extensions: [
      // TextStyle must be declared first so it renders OUTSIDE other marks
      // (e.g. <span style="--tp-underline:…"><u>…</u></span>). The underline
      // then picks up the colour via CSS variable; otherwise text-decoration
      // would always be painted with the text colour only.
      TextStyle,
      UnderlineExtension,
      StarterKit.configure({
        // The app registers its own configured Link below (StarterKit's
        // default navigates on click, which would hijack the webview).
        link: false,
        // Registered explicitly above so the mark nests inside TextStyle.
        underline: false,
      }),
      FontFamily.configure({
        types: ["textStyle"],
      }),
      Color.configure({
        types: ["textStyle"],
      }),
      Highlight.configure({
        multicolor: true,
      }),
      FontSize,
      UnderlineColor,
      Placeholder.configure({
        placeholder: t("editor.placeholder"),
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      MaterialLink,
      WordStyleTextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      AppLink.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: {
          rel: "noopener noreferrer nofollow",
        },
      }),
      Subscript,
      Superscript,
    ],
    content: activeFileContent?.content || `<h2>${language === "de" ? "Neue Stunde" : "New Lesson Plan"}</h2>`,
    editorProps: {
      // Mod+Shift+V inserts the clipboard as plain text (paragraphs),
      // stripping any formatting when pasting from Word/websites.
      handlePaste: (_view, event) => {
        if (!plainPasteRef.current) {
          return false;
        }
        plainPasteRef.current = false;

        const text = event.clipboardData?.getData("text/plain") ?? "";
        const current = editorRef.current;
        if (!current || !text.trim()) {
          return false;
        }

        snapSelectionInsideTextblock(current);

        const lines = text.replace(/\r\n?/g, "\n").split("\n");
        if (lines.length > 1 && lines[lines.length - 1] === "") {
          lines.pop();
        }

        // Single line pastes inline at the cursor; only multi-line content
        // becomes new paragraphs.
        if (lines.length <= 1) {
          current.chain().focus().insertContent({ type: "text", text: lines[0] ?? "" }).run();
          return true;
        }

        const blocks = lines.map((line) =>
          line
            ? { type: "paragraph", content: [{ type: "text", text: line }] }
            : { type: "paragraph" },
        );

        current.chain().focus().insertContent(blocks).run();
        return true;
      },
    },
  });

  // Track Mod+Shift+V so the next paste event is treated as plain text.
  useEffect(() => {
    const markPlainPaste = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        !event.altKey &&
        event.key.toLowerCase() === "v"
      ) {
        plainPasteRef.current = true;
        window.setTimeout(() => {
          plainPasteRef.current = false;
        }, 1500);
      }
    };
    window.addEventListener("keydown", markPlainPaste, true);
    return () => window.removeEventListener("keydown", markPlainPaste, true);
  }, []);

  useEffect(() => {
    if (!editor) {
      return;
    }

    editorRef.current = editor;
  }, [editor]);

  // ── Shared autosave snapshot helper ──
  // The snapshot must be byte-identical across the debounced autosave and the
  // switch/unmount flush, so both go through this builder.
  const buildAutosavePayload = useCallback(() => {
    const currentEditor = editorRef.current;
    let json: any = null;
    if (currentEditor && !currentEditor.isDestroyed) {
      try {
        json = currentEditor.getJSON();
      } catch {
        json = null;
      }
    }
    if (!json) {
      json = latestDocJsonRef.current;
    }
    if (!json) {
      return null;
    }

    const inputs = autosaveInputsRef.current;
    const parsedPlannedFor = parseEuropeanDateToIso(inputs.plannedForInput);
    // An unparseable date must not block saving: the document keeps its
    // previous plannedFor and everything else is saved as usual.
    const effectivePlannedFor =
      parsedPlannedFor !== undefined ? parsedPlannedFor : inputs.lastKnownPlannedFor;
    const snapshot = JSON.stringify({
      content: json,
      teacher: inputs.teacher,
      subject: inputs.subject,
      plannedFor: effectivePlannedFor ?? null,
      notes: inputs.lessonNotes,
    });
    const metadataPatch: Partial<LessonMetadata> = {
      teacher: inputs.teacher,
      subject: inputs.subject,
    };
    if (parsedPlannedFor !== undefined) {
      metadataPatch.plannedFor = parsedPlannedFor;
    }

    return { json, snapshot, metadataPatch, inputs };
  }, []);

  // Debounced autosave. The timer lives in a ref so editor updates do not
  // need to re-render this component to re-arm it.
  const clearAutosaveTimer = useCallback(() => {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    if (maxAutosaveTimerRef.current !== null) {
      window.clearTimeout(maxAutosaveTimerRef.current);
      maxAutosaveTimerRef.current = null;
    }
  }, []);

  const runAutosave = useCallback(async () => {
    if (maxAutosaveTimerRef.current !== null) {
      window.clearTimeout(maxAutosaveTimerRef.current);
      maxAutosaveTimerRef.current = null;
    }
    if (!editorRef.current || editorRef.current.isDestroyed || !autosavePathRef.current) {
      return;
    }

    const inputs = autosaveInputsRef.current;
    const parsedPlannedFor = parseEuropeanDateToIso(inputs.plannedForInput);
    const effectivePlannedFor =
      parsedPlannedFor !== undefined ? parsedPlannedFor : inputs.lastKnownPlannedFor;

    // Nothing changed since the last save — never touch the disk.
    if (
      !docDirtyRef.current &&
      !metaIsDirty({
        teacher: inputs.teacher,
        subject: inputs.subject,
        notes: inputs.lessonNotes,
        plannedFor: effectivePlannedFor ?? null,
      })
    ) {
      return;
    }

    const payload = buildAutosavePayload();
    if (!payload || payload.snapshot === lastSavedSnapshotRef.current) {
      docDirtyRef.current = false;
      setDocumentSaveState("saved");
      return;
    }

    const revisionAtStart = docRevisionRef.current;
    setDocumentSaveState("saving");
    const ok = await saveActiveLesson(payload.json, payload.metadataPatch, payload.inputs.lessonNotes);
    if (ok) {
      lastSavedSnapshotRef.current = payload.snapshot;
      lastSavedMetaRef.current = {
        teacher: inputs.teacher,
        subject: inputs.subject,
        notes: inputs.lessonNotes,
        plannedFor: effectivePlannedFor ?? null,
      };

      if (docRevisionRef.current === revisionAtStart) {
        docDirtyRef.current = false;
        setDocumentSaveState("saved");
      } else {
        // Edits arrived while the save was in flight. Keep them dirty and
        // schedule another pass instead of marking the newer text as saved.
        setDocumentSaveState("dirty");
        window.setTimeout(() => {
          void runAutosave();
        }, 600);
      }
    } else {
      setDocumentSaveState("error");
    }
  }, [buildAutosavePayload, metaIsDirty, saveActiveLesson, setDocumentSaveState]);

  const scheduleAutosave = useCallback(() => {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null;
      void runAutosave();
    }, 1800);

    if (maxAutosaveTimerRef.current === null) {
      maxAutosaveTimerRef.current = window.setTimeout(() => {
        maxAutosaveTimerRef.current = null;
        void runAutosave();
      }, MAX_AUTOSAVE_INTERVAL_MS);
    }
  }, [runAutosave]);

  // Flush pending edits for the lesson the editor currently holds. Runs when
  // the active lesson changes, the editor unmounts, or the window is closing
  // (via the close-flush registry) — effect cleanup executes BEFORE the
  // incoming lesson's content is loaded, so the editor still shows the
  // outgoing document here. Returns the write promise so the close flow can
  // await the flush before destroying the window.
  const flushPendingAutosave = useCallback((): Promise<boolean> => {
    clearAutosaveTimer();

    const outgoingPath = autosavePathRef.current;
    if (!outgoingPath) {
      return Promise.resolve(true);
    }

    const inputs = autosaveInputsRef.current;
    const parsedPlannedFor = parseEuropeanDateToIso(inputs.plannedForInput);
    const effectivePlannedFor =
      parsedPlannedFor !== undefined ? parsedPlannedFor : inputs.lastKnownPlannedFor;

    // Nothing changed since the last save — nothing to flush.
    if (
      !docDirtyRef.current &&
      !metaIsDirty({
        teacher: inputs.teacher,
        subject: inputs.subject,
        notes: inputs.lessonNotes,
        plannedFor: effectivePlannedFor ?? null,
      })
    ) {
      return Promise.resolve(true);
    }

    const payload = buildAutosavePayload();
    if (!payload || payload.snapshot === lastSavedSnapshotRef.current) {
      return Promise.resolve(true);
    }

    const baseMetadata = inputs.baseMetadata ?? {
      teacher: "",
      subject: "",
      createdAt: new Date().toISOString(),
      plannedFor: null,
    };
    const lessonData: LessonData = {
      version: 1,
      metadata: {
        ...baseMetadata,
        teacher: inputs.teacher,
        subject: inputs.subject,
        ...(payload.metadataPatch.plannedFor !== undefined
          ? { plannedFor: payload.metadataPatch.plannedFor }
          : {}),
      },
      notes: inputs.lessonNotes,
      content: payload.json,
    };

    // `silent`: a blocking alert() during app close could stall the flush and
    // trip the Rust-side force-close timer.
    const revisionAtStart = docRevisionRef.current;
    setDocumentSaveState("saving");
    return saveLessonAtPath(outgoingPath, lessonData, { silent: true }).then((ok) => {
      if (!ok) {
        setDocumentSaveState("error");
        return false;
      }
      if (docRevisionRef.current !== revisionAtStart) {
        // The flush did not cover the newest keystrokes. Keep the document
        // dirty and let the caller decide whether to abort the switch/close.
        setDocumentSaveState("dirty");
        window.setTimeout(() => {
          void runAutosave();
        }, 600);
        return false;
      }
      docDirtyRef.current = false;
      setDocumentSaveState("saved");
      return true;
    });
  }, [
    buildAutosavePayload,
    clearAutosaveTimer,
    metaIsDirty,
    saveLessonAtPath,
    setDocumentSaveState,
    runAutosave,
  ]);

  // Register the flush for the window-close flow (App.tsx runs the registry
  // before confirming the close). Effect re-runs when the flush identity
  // changes; the registry swap is cheap and idempotent.
  useEffect(() => {
    return registerCloseFlusher(() => flushPendingAutosave());
  }, [flushPendingAutosave]);

  // Deps intentionally exclude activeFileContent (matches the original
  // behavior): a save or a re-open of the already-active lesson replaces the
  // store object under the same path, and syncing then would revert unsaved
  // editor edits. The closure still reads the latest activeFileContent on
  // genuine path changes, which always update together.
  useEffect(() => {
    if (!editor || !activeFileContent) {
      return;
    }

    // Rebind the per-lesson autosave bookkeeping only when the lesson actually
    // changes — a save updates activeFileContent under the same path, and
    // resetting then would drop a freshly armed autosave timer.
    if (autosavePathRef.current !== activeFilePath) {
      const nextDocId = activeFileContent?.metadata?.createdAt ?? activeFilePath;
      const sameDocument =
        autosaveDocIdRef.current !== null && autosaveDocIdRef.current === nextDocId;

      autosavePathRef.current = activeFilePath;
      autosaveDocIdRef.current = nextDocId;

      if (!sameDocument) {
        // Genuine document switch: the incoming document starts clean.
        latestDocJsonRef.current = null;
        docDirtyRef.current = false;
        docRevisionRef.current = 0;
        setDocumentSaveState("saved");
      }

      // A save-driven rename keeps the dirty/revision state intact: edits
      // made while the rename was in flight must not be marked as saved.
      if (!sameDocument) {
        clearAutosaveTimer();
      }
    }

    try {
      const current = JSON.stringify(editor.getJSON());
      const incoming = JSON.stringify(activeFileContent.content);
      if (current === incoming) {
        return;
      }
    } catch {
      // Ignore comparison errors and force content sync below.
    }

    editor.commands.setContent(activeFileContent.content, { emitUpdate: false });
  }, [editor, activeFilePath, clearAutosaveTimer]);

  // Flush the outgoing lesson's pending edits when switching lessons or
  // unmounting. Effect cleanup runs before the incoming lesson's content is
  // loaded, so the editor still holds the outgoing document here.
  useEffect(() => {
    return () => {
      flushPendingAutosave();
    };
  }, [editor, activeFilePath, flushPendingAutosave]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const handleContentUpdate = () => {
      docDirtyRef.current = true;
      docRevisionRef.current += 1;
      setDocumentSaveState("dirty");
      try {
        latestDocJsonRef.current = editor.getJSON();
      } catch {
        // Keep the previous capture if serialization fails.
      }
      scheduleAutosave();
    };

    editor.on("update", handleContentUpdate);

    return () => {
      editor.off("update", handleContentUpdate);
    };
  }, [editor, scheduleAutosave]);

  useEffect(() => {
    if (!editor || !activeFilePath || !activeFileContent) {
      return;
    }

    // The editor may hold unsaved edits even though the store replaced the
    // content object (re-opening the already-active lesson re-parses the
    // file). Resetting the save baseline then would make the pending
    // autosave believe the edits were saved — keep it until they persist.
    if (docDirtyRef.current) {
      return;
    }

    lastSavedSnapshotRef.current = JSON.stringify({
      content: activeFileContent.content,
      teacher: activeFileContent.metadata.teacher || "",
      subject: activeFileContent.metadata.subject || "",
      plannedFor: activeFileContent.metadata.plannedFor || null,
      notes: activeFileContent.notes || "",
    });
    lastSavedMetaRef.current = {
      teacher: activeFileContent.metadata.teacher || "",
      subject: activeFileContent.metadata.subject || "",
      plannedFor: activeFileContent.metadata.plannedFor || null,
      notes: activeFileContent.notes || "",
    };
    docDirtyRef.current = false;
    setDocumentSaveState("saved");
  }, [editor, activeFilePath, activeFileContent, setDocumentSaveState]);

  // Metadata edits (teacher/subject/date/notes fields) also arm the autosave.
  useEffect(() => {
    if (!editor || !activeFilePath) {
      return;
    }

    const parsedPlannedFor = parseEuropeanDateToIso(plannedForInput);
    const effectivePlannedFor =
      parsedPlannedFor !== undefined
        ? parsedPlannedFor
        : (autosaveInputsRef.current.lastKnownPlannedFor ?? null);
    if (
      metaIsDirty({
        teacher,
        subject,
        notes: lessonNotes,
        plannedFor: effectivePlannedFor,
      })
    ) {
      docRevisionRef.current += 1;
      setDocumentSaveState("dirty");
    }

    scheduleAutosave();
    return clearAutosaveTimer;
  }, [
    editor,
    activeFilePath,
    teacher,
    subject,
    plannedForInput,
    lessonNotes,
    scheduleAutosave,
    clearAutosaveTimer,
    metaIsDirty,
    setDocumentSaveState,
  ]);

  const insertLessonTable = () => {
    if (!editor) return;

    // Column widths: Time (80px), Phase (120px), LTA (350px), Social (140px), Media (150px)
    const colWidths = [80, 120, 350, 140, 150];
    const bodyRowCount = Math.max(1, Math.min(12, Math.round(defaultLessonTableBodyRows || 4)));

    const bodyRows = Array.from({ length: bodyRowCount }, () => ({
      type: "tableRow",
      content: colWidths.map((width) => ({
        type: "tableCell",
        attrs: { colwidth: [width] },
        content: [{ type: "paragraph" }],
      })),
    }));

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
          ...bodyRows,
        ],
      })
      .run();
  };

  const insertCustomTable = () => {
    if (!editor) return;
    setCustomTableDialog({ rows: 4, cols: 4, withHeaderRow: true });
  };

  const confirmInsertCustomTable = () => {
    if (!editor || !customTableDialog) return;
    const { rows, cols, withHeaderRow } = customTableDialog;
    editor
      .chain()
      .focus()
      .insertTable({ rows, cols, withHeaderRow })
      .run();
    setCustomTableDialog(null);
  };


  const handleEditorContextMenu = useCallback(
    (event: React.MouseEvent) => {
      if (!editor) {
        return;
      }

      const target = event.target as HTMLElement | null;
      // Allow material links to handle their own context menu
      const isMaterialLinkTarget = !!target && !!target.closest("material-link");
      if (isMaterialLinkTarget) {
        return;
      }
      const isTableTarget = !!target && !!target.closest("table");
      const { from, to, empty } = editor.state.selection;
      const selectedText = editor.state.doc.textBetween(from, to, "\n", " ").trim();
      const aiSelection = !empty && selectedText
        ? {
            from,
            to,
            selectedText,
          }
        : null;

      event.preventDefault();
      event.stopPropagation();


      // With no text selection, anchor to the clicked position so table
      // commands / inserted blocks land where the user right-clicked.
      if (!aiSelection) {
        const pos = editor.view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (pos?.pos !== undefined) {
          editor.chain().focus().setTextSelection(pos.pos).run();
          snapSelectionInsideTextblock(editor);
        }
      }

      const showTableActions = isTableTarget;
      const showFormatActions = !!aiSelection;
      const showInsertActions = !isTableTarget && !aiSelection;

      const { x, y } = clampContextMenuPosition(event.clientX + 6, event.clientY + 6, {
        estimatedWidth: 240,
        estimatedHeight: showTableActions ? 760 : showFormatActions ? 480 : 220,
      });

      setTableContextMenu({
        x,
        y,
        showTableActions,
        showFormatActions,
        showInsertActions,
        aiSelection,
      });
    },
    [editor],
  );

  const handleSave = useCallback(async () => {
    if (!editor) return;

    const parsedPlannedFor = parseEuropeanDateToIso(plannedForInput);
    if (parsedPlannedFor === undefined) {
      alert(t("editor.errors.invalidDate"));
      return;
    }

    const json = editor.getJSON();
    const revisionAtStart = docRevisionRef.current;
    setDocumentSaveState("saving");
    const ok = await saveActiveLesson(json, {
      teacher,
      subject,
      plannedFor: parsedPlannedFor,
    }, lessonNotes);
    if (ok) {
      lastSavedSnapshotRef.current = JSON.stringify({
        content: json,
        teacher,
        subject,
        plannedFor: parsedPlannedFor,
        notes: lessonNotes,
      });
      lastSavedMetaRef.current = {
        teacher,
        subject,
        plannedFor: parsedPlannedFor,
        notes: lessonNotes,
      };
      if (docRevisionRef.current === revisionAtStart) {
        docDirtyRef.current = false;
        setDocumentSaveState("saved");
      } else {
        setDocumentSaveState("dirty");
      }
    } else {
      setDocumentSaveState("error");
    }
  }, [
    editor,
    plannedForInput,
    saveActiveLesson,
    teacher,
    subject,
    lessonNotes,
    setDocumentSaveState,
  ]);

  useEffect(() => {
    const onSaveShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) {
        return;
      }

      const isSaveKey = event.code === "KeyS";
      const isModifierPressed = event.metaKey || event.ctrlKey;
      const hasUnsupportedModifier = event.altKey;
      if (!isSaveKey || !isModifierPressed || hasUnsupportedModifier) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (event.repeat) {
        return;
      }

      void handleSave();
    };

    window.addEventListener("keydown", onSaveShortcut);

    return () => {
      window.removeEventListener("keydown", onSaveShortcut);
    };
  }, [handleSave]);

  const getSelectedTextRange = useCallback((): SelectedTextRange | null => {
    if (!editor) {
      return null;
    }

    const { from, to, empty } = editor.state.selection;
    if (empty) {
      return null;
    }

    const selectedText = editor.state.doc.textBetween(from, to, "\n", " ").trim();
    if (!selectedText) {
      return null;
    }

    return { from, to, selectedText };
  }, [editor]);

  const getSelectionValidationError = useCallback(
    (selection: SelectedTextRange): string | null => {
      if (!editor) {
        return t("editor.chat.notReady");
      }

      const docSize = editor.state.doc.content.size;
      const from = Math.max(0, Math.min(selection.from, docSize));
      const to = Math.max(from, Math.min(selection.to, docSize));

      if (from === to) {
        return t("editor.chat.selectTextFirst");
      }

      const $from = editor.state.doc.resolve(from);
      const $to = editor.state.doc.resolve(Math.max(from, to - 1));

      // Ensure both ends sit in the same textblock (paragraph / heading / cell).
      const fromParent = $from.parent;
      const toParent = $to.parent;
      if (fromParent !== toParent) {
        return t("editor.chat.singleBlockSelection");
      }

      return null;
    },
    [editor, t],
  );

  const runAiSelectionAction = useCallback(
    async (
      mode: "rewrite" | "translate",
      explicitSelection?: SelectedTextRange | null,
      options?: { tone?: string; language?: string },
    ) => {
      if (!editor) {
        return;
      }

      if (!aiEnabled) {
        setAiStatusMessage(t("editor.aiMenu.enableLocalAiFirst"));
        return;
      }

      const selectedRange = explicitSelection || getSelectedTextRange();
      if (!selectedRange) {
        setAiStatusMessage(t("editor.aiMenu.selectTextFirst"));
        return;
      }

      const validationError = getSelectionValidationError(selectedRange);
      if (validationError) {
        setAiStatusMessage(validationError);
        return;
      }

      const sourceText = editor.state.doc
        .textBetween(selectedRange.from, selectedRange.to, "\n", " ")
        .trim();
      if (!sourceText) {
        setAiStatusMessage(t("editor.aiMenu.selectedTextEmpty"));
        return;
      }

      const tone = options?.tone ?? "improve";
      const targetLang = options?.language ?? aiTranslateTargetLanguage;

      const toneInstruction: Record<string, string> = {
        improve:   "Improve clarity, flow, and vocabulary while keeping the original meaning.",
        formal:    "Rewrite in a formal, professional tone. Use precise language and proper structure.",
        casual:    "Rewrite in a casual, conversational tone. Make it sound natural and approachable.",
        simple:    "Rewrite in plain, simple language. Use short sentences and everyday words so anyone can understand.",
        engaging:  "Rewrite in an engaging, energetic tone. Make it lively, vivid, and interesting.",
        concise:   "Rewrite more concisely. Remove unnecessary words and filler while keeping the full meaning.",
      };

      const instruction =
        mode === "rewrite"
          ? [
              "You are a writing assistant. Your task is to REWRITE the text below.",
              "You MUST change the wording — do NOT return the same text.",
              toneInstruction[tone] ?? toneInstruction.improve,
              "Keep the same general length unless instructed to shorten.",
              "Return ONLY the rewritten text, nothing else — no labels, no quotes, no markdown.",
            ].join("\n")
          : [
              `You are a translator. Translate the text below into clear, natural ${targetLang}.`,
              "Return ONLY the translated text, nothing else — no labels, no quotes, no markdown.",
            ].join("\n");

      const prompt = `${instruction}\n\n${sourceText}`;

      const rewriteSystemPrompt =
        mode === "rewrite"
          ? t("aiPrompts.rewriteSystem")
          : t("aiPrompts.translateSystem", { language: targetLang });

      const statusLabel = mode === "translate"
        ? t("editor.chat.translating", { language: targetLang })
        : tone === "improve"
          ? t("editor.chat.rewriting")
          : t("editor.chat.rewritingWithTone", { tone });

      setIsAiBusy(true);
      setAiStatusMessage(statusLabel);
      logDebug(
        "ai",
        "rewrite-translate-invoke",
        `${mode} | v3 engine auto-model | temp=0.35`,
      );

      try {
        // AI v3: engine auto-selects the downloaded rewrite model (model pickers
        // return in the settings pass; the sidecar starts lazily on this call).
        const result = await tauriInvoke<{ text: string }>("ai_generate_text_v2", {
          modelId: aiV3RewriteModelId ?? undefined,
          prompt,
          systemPrompt: rewriteSystemPrompt,
          temperature: 0.35,
        });

        const transformedText = normalizeAiFragmentOutput(result.text, sourceText);
        if (!transformedText) {
          throw new Error(t("editor.chat.emptyResponse"));
        }

        const selectionStillValid = !getSelectionValidationError(selectedRange);
        if (!selectionStillValid) {
          throw new Error(t("editor.chat.selectionChanged"));
        }

        const currentSelectionText = editor.state.doc
          .textBetween(selectedRange.from, selectedRange.to, "\n", " ")
          .trim();
        if (currentSelectionText !== sourceText) {
          throw new Error(t("editor.chat.selectionContentChanged"));
        }

        const transaction = editor.state.tr.insertText(
          transformedText,
          selectedRange.from,
          selectedRange.to,
        );
        editor.view.dispatch(transaction);
        editor.view.focus();

        setAiStatusMessage(
          mode === "rewrite"
            ? t("editor.chat.rewriteDone")
            : t("editor.chat.translateDone"),
        );
      } catch (error) {
        console.error("AI action failed:", error);
        setAiStatusMessage(t("editor.chat.failed", { error: String(error) }));
      } finally {
        setIsAiBusy(false);
      }
    },
    [
      aiEnabled,
      aiV3RewriteModelId,
      aiTemperature,
      aiTranslateTargetLanguage,
      editor,
      getSelectedTextRange,
      getSelectionValidationError,
      logDebug,
    ],
  );

  const buildLessonContextText = useCallback((maxChars = 10000): string => {
    if (!editor) {
      return "";
    }

    // Walk the TipTap document and emit structured plain text so the AI
    // can distinguish headings, paragraphs, list items, and table cells.
    function nodeToText(node: any, depth = 0): string {
      const indent = "  ".repeat(depth);
      switch (node.type) {
        case "heading": {
          const level = node.attrs?.level ?? 1;
          const prefix = "#".repeat(level) + " ";
          const text = (node.content ?? []).map((n: any) => nodeToText(n, 0)).join("").trim();
          return text ? `${prefix}${text}\n` : "";
        }
        case "paragraph": {
          const text = (node.content ?? []).map((n: any) => nodeToText(n, 0)).join("").trim();
          return text ? `${text}\n` : "\n";
        }
        case "bulletList":
        case "orderedList": {
          return (node.content ?? []).map((n: any) => nodeToText(n, depth)).join("");
        }
        case "listItem": {
          const text = (node.content ?? []).map((n: any) => nodeToText(n, 0)).join("").trim();
          return text ? `${indent}- ${text}\n` : "";
        }
        case "table": {
          return (node.content ?? []).map((n: any) => nodeToText(n, depth)).join("") + "\n";
        }
        case "tableRow": {
          const cells = (node.content ?? []).map((n: any) =>
            (n.content ?? []).map((c: any) => nodeToText(c, 0)).join("").replace(/\n/g, " ").trim()
          );
          return `| ${cells.join(" | ")} |\n`;
        }
        case "text": {
          return node.text ?? "";
        }
        case "hardBreak": {
          return "\n";
        }
        case "doc": {
          return (node.content ?? []).map((n: any) => nodeToText(n, depth)).join("\n");
        }
        default: {
          if (node.content) {
            return (node.content as any[]).map((n: any) => nodeToText(n, depth)).join("");
          }
          return node.text ?? "";
        }
      }
    }

    const structured = nodeToText(editor.getJSON()).trim();

    // Cap lesson context to preserve room for metadata + history + user prompt.
    const safeMaxChars = Math.max(
      1000,
      Math.min(MAX_LESSON_CONTEXT_CHARS, Math.floor(maxChars)),
    );
    const body = structured.length <= safeMaxChars
      ? structured
      : `${structured.slice(0, safeMaxChars)}\n\n[Content truncated at ${safeMaxChars} characters]`;

    return body || "(no body content yet)";
  }, [editor]);

  // Token estimation (conservative ratio for German/English; exact counts are
  // fetched from the engine tokenizer when available).
  const estimateTokens = useCallback((str: string): number => {
    return Math.ceil(str.length / CHARS_PER_TOKEN_ESTIMATE);
  }, []);

  const handleSubmitChat = useCallback(async (overrideText?: string) => {
    if (!aiEnabled) {
      setAiStatusMessage(t("editor.aiMenu.enableLocalAiFirst"));
      return;
    }

    const userText = (overrideText ?? chatInput).trim();
    if (!userText) {
      return;
    }

    const userMessage: AiChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text: userText,
      timestamp: Date.now(),
    };

    setChatMessages((previous) => [...previous, userMessage]);
    setChatInput("");
    setIsChatBusy(true);
    setAiStatusMessage(t("editor.chat.thinkingOn"));

    try {
      // Resolve the model that will actually serve this request (explicit >
      // selected > auto), so budgeting uses its real context window rather
      // than the model currently loaded in the engine.
      let modelNumCtx = 16384;
      let modelSupportsThinkingNow = modelSupportsThinking;
      try {
        const info = await tauriInvoke<{
          id: string | null;
          numCtx: number;
          supportsThinking: boolean;
        }>("ai_effective_model", { modelId: aiV3ChatModelId ?? null });
        if (info.numCtx > 0) modelNumCtx = info.numCtx;
        modelSupportsThinkingNow = info.supportsThinking;
      } catch {
        /* fall back to conservative defaults */
      }

      // Thinking mode needs room for reasoning plus the answer. Reserve at
      // most 40% of the window for output and keep the server's 8192 cap.
      // This is only an upper bound: the model decides how much it needs.
      const thinkMode = aiThinkingEnabled && modelSupportsThinkingNow;
      const desiredNumPredict = thinkMode ? 8192 : 4096;
      const effectiveNumPredict = Math.max(
        512,
        Math.min(desiredNumPredict, 8192, Math.floor(modelNumCtx * 0.4)),
      );
      const promptBudget = Math.max(1024, modelNumCtx - effectiveNumPredict - 256);

      const effectiveSystemPrompt = aiSystemPrompt || t("aiPrompts.chatSystem");

      // Build conversation history (capped at the configured limit, then by
      // tokens so a long conversation cannot starve the lesson/RAG budget).
      const historyCandidates = chatMessages.slice(-aiChatHistoryLimit);
      const systemTokens = estimateTokens(effectiveSystemPrompt);
      const userTokens = estimateTokens(userText);
      const maxHistoryTokens = Math.floor(promptBudget * 0.25);
      const recentMessages: typeof historyCandidates = [];
      let historyTokens = 0;
      for (let i = historyCandidates.length - 1; i >= 0; i -= 1) {
        const message = historyCandidates[i];
        const messageTokens = estimateTokens(message.text);
        if (recentMessages.length > 0 && historyTokens + messageTokens > maxHistoryTokens) {
          break;
        }
        recentMessages.unshift(message);
        historyTokens += messageTokens;
      }

      // Allocate the remaining prompt budget: lesson first, then knowledge
      // base excerpts. When a DB is attached, cap the lesson at 60% so the
      // retrieved passages always get room; unused lesson room flows to RAG.
      const contextBudget = Math.max(
        512,
        promptBudget - systemTokens - userTokens - historyTokens - 64,
      );
      const hasKnowledgeBase = Boolean(activeChatDb && vaultPath);
      const lessonTokenBudget = hasKnowledgeBase
        ? Math.max(256, Math.floor(contextBudget * 0.6))
        : contextBudget;
      const lessonCharBudget = Math.max(
        1000,
        Math.floor(lessonTokenBudget * CHARS_PER_TOKEN_ESTIMATE),
      );
      const contextText = buildLessonContextText(lessonCharBudget);

      // Build metadata header
      const metaLines: string[] = [];
      if (teacher)         metaLines.push(`Teacher: ${teacher}`);
      if (subject)         metaLines.push(`Subject: ${subject}`);
      if (plannedForInput) metaLines.push(`Planned for: ${plannedForInput}`);
      const metaHeader = metaLines.length > 0 ? metaLines.join("\n") + "\n" : "";

      const lessonBlock = `${metaHeader}${contextText}`.trim() || "(empty lesson plan — no content yet)";
      const lessonTokens = estimateTokens(lessonBlock);
      const lessonContext = `<lesson_plan>\n${lessonBlock}\n</lesson_plan>`;

      // Fetch RAG chunks if a DB is selected.
      let ragContext = "";
      let ragTokens = 0;
      let ragResults: ScoredChunk[] = [];
      let ragState: "none" | "found" | "no_matches" | "failed" = "none";
      const ragScopeLabel = [activeChatDb, activeChatGrade, activeChatTopic, activeChatFile]
        .filter(Boolean)
        .join(" > ");

      if (hasKnowledgeBase) {
        setAiStatusMessage(t("editor.chat.searchingKnowledge"));
        try {
          const ragTokenBudget = Math.max(0, contextBudget - lessonTokens);
          const topK = Math.max(1, Math.min(12, Math.floor(ragTokenBudget / 220)));

          if (topK > 0) {
            const results = await tauriInvoke<ScoredChunk[]>("subject_db_query", {
              vaultPath,
              subject: activeChatDb,
              grade: activeChatGrade ?? null,
              topic: activeChatTopic ?? null,
              file: activeChatFile ?? null,
              query: userText,
              topK: topK,
            });
            ragChunksRef.current = [];
            ragResults = [];

            if (results.length > 0) {
              const excerpts: string[] = [];
              const includedResults: ScoredChunk[] = [];
              let usedTokens = 0;
              for (const r of results) {
                const excerpt = `\n<excerpt source="${escapeXmlAttr(r.source)}" page="${r.page}" subject="${escapeXmlAttr(r.subject)}" grade="${escapeXmlAttr(r.grade)}" topic="${escapeXmlAttr(r.topic)}">\n[${r.source}, p.${r.page}]\n${sanitizeExcerptText(r.text)}\n</excerpt>`;
                const excerptTokens = estimateTokens(excerpt);
                if (excerpts.length > 0 && usedTokens + excerptTokens > ragTokenBudget) break;
                excerpts.push(excerpt);
                includedResults.push(r);
                usedTokens += excerptTokens;
              }
              ragChunksRef.current = includedResults;
              ragResults = includedResults;
              if (excerpts.length > 0) {
                ragContext = `\n<knowledge_base status="found" matches="${excerpts.length}" scope="${escapeXmlAttr(ragScopeLabel)}">${excerpts.join("")}\n</knowledge_base>`;
                ragTokens = estimateTokens(ragContext);
                ragState = "found";
              } else {
                ragState = "no_matches";
              }
            } else {
              ragState = "no_matches";
            }
          } else {
            ragState = "no_matches";
          }

          if (ragState === "no_matches") {
            setAiStatusMessage(t("editor.chat.noKnowledgeMatches", { scope: ragScopeLabel }));
            console.warn(`RAG: no chunks found in ${ragScopeLabel}`);
          } else if (ragState === "found") {
            setAiStatusMessage(t("editor.chat.thinkingOn"));
          }
          logDebug("ai", "rag-results", `db=${activeChatDb} | grade=${activeChatGrade ?? "-"} | topic=${activeChatTopic ?? "-"} | file=${activeChatFile ?? "-"} | state=${ragState} | results=${ragChunksRef.current.length}`);
        } catch (e) {
          ragState = "failed";
          setAiStatusMessage(t("editor.chat.knowledgeSearchFailed"));
          console.error("RAG query failed:", e);
          logDebug("ai", "rag-error", String(e));
        }
      }

      // Knowledge-base state is attached to the final user turn so the stable
      // lesson/history prefix stays cache-friendly across follow-up messages.
      const retrievalBlock =
        ragState === "found"
          ? ragContext
          : ragState === "no_matches"
            ? `\n<knowledge_base status="no_matches" scope="${escapeXmlAttr(ragScopeLabel)}" />`
            : ragState === "failed"
              ? `\n<knowledge_base status="search_failed" scope="${escapeXmlAttr(ragScopeLabel)}" />`
              : "";
      const questionContent = retrievalBlock
        ? `${retrievalBlock}\n\n${userText}`
        : userText;

      const messages: ChatMessage[] = [
        { role: "system", content: effectiveSystemPrompt },
        { role: "user", content: lessonContext },
        { role: "assistant", content: t("editor.chat.contextReceived") },
        ...recentMessages.map((msg) => ({
          role: msg.role as "user" | "assistant",
          content: msg.text,
        })),
        { role: "user", content: questionContent },
      ];

      // Update the context bar before the exact tokenizer answers.
      // questionContent already contains the retrieval block, so RAG tokens
      // stay a display-only segment and are not added twice.
      const estimatePromptTokens =
        lessonTokens + historyTokens + systemTokens + estimateTokens(questionContent) + 64;
      setChatContextBudget({
        totalTokens: modelNumCtx,
        usedByLesson: lessonTokens,
        usedByHistory: historyTokens,
        usedByRag: ragTokens,
        usedBySystem: systemTokens,
        usedByUser: userTokens,
        freeTokens: Math.max(0, modelNumCtx - estimatePromptTokens - effectiveNumPredict),
      });

      // Exact token counts via the engine tokenizer (fallback: conservative
      // character estimate).
      let exactCounts: number[] | null = null;
      try {
        exactCounts = await tauriInvoke<number[]>("ai_count_tokens", {
          texts: [lessonContext, ragContext, effectiveSystemPrompt, questionContent, userText, ...recentMessages.map((m) => m.text)],
        });
      } catch {
        /* engine idle — estimates are fine for the bar */
      }
      const countExact = (index: number, str: string) =>
        exactCounts && exactCounts[index] !== undefined ? exactCounts[index] : estimateTokens(str);

      // Refresh the context bar with exact counts once the engine tokenizer answered
      const lessonTokensExact = countExact(0, lessonContext);
      const ragTokensExact = countExact(1, ragContext);
      const systemTokensExact = countExact(2, effectiveSystemPrompt);
      const userTokensExact = countExact(3, questionContent);
      const userOnlyTokensExact = countExact(4, userText);
      const historyTokensExact = recentMessages.reduce(
        (sum, msg, i) => sum + (exactCounts?.[5 + i] ?? estimateTokens(msg.text)),
        0,
      );
      const promptTokensExact =
        lessonTokensExact + systemTokensExact + userTokensExact + historyTokensExact + 64;

      // Never let prompt + answer exceed the target model's real window.
      const availableOutputTokens = modelNumCtx - promptTokensExact - 64;
      if (availableOutputTokens < 256) {
        throw new Error(t("editor.chat.contextTooLong"));
      }
      const finalNumPredict = Math.max(
        256,
        Math.min(effectiveNumPredict, availableOutputTokens),
      );
      setChatContextBudget({
        totalTokens: modelNumCtx,
        usedByLesson: lessonTokensExact,
        usedByHistory: historyTokensExact,
        usedByRag: ragTokensExact,
        usedBySystem: systemTokensExact,
        usedByUser: userOnlyTokensExact,
        freeTokens: Math.max(0, modelNumCtx - promptTokensExact - finalNumPredict),
      });

      logDebug(
        "ai",
        "chat-invoke",
        `model=${aiV3ChatModelId ?? "auto"} | ctx=${modelNumCtx} | predict=${finalNumPredict} | messages=${messages.length} | rag=${ragState}${ragTokens > 0 ? ` +${ragTokens}` : ""} | prompt=${promptTokensExact} | history=${historyTokens} | lesson=${lessonTokens} | think=${String(thinkMode)}`,
      );

      const requestId = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      activeStreamIdRef.current = requestId;

      const assistantId = `assistant-${Date.now()}`;
      let streamText = "";
      let streamThinking = "";

      // Dedupe chunk hits into per-source/per-page citation chips for the answer.
      const ragCitations = Array.from(
        new Map(
          ragResults.map((r) => [`${r.source}:${r.page}`, { source: r.source, page: r.page }]),
        ).values(),
      );

      setChatMessages((previous) => [
        ...previous,
        {
          id: assistantId,
          role: "assistant",
          text: "",
          citations: ragCitations.length > 0 ? ragCitations : undefined,
          timestamp: Date.now(),
        },
      ]);

      const applyStream = () => {
        setChatMessages((previous) =>
          previous.map((m) =>
            m.id === assistantId
              ? { ...m, text: streamText, thinking: streamThinking || undefined }
              : m,
          ),
        );
      };

      // AI v3: streaming relay — chunks arrive as ai-stream-{requestId} events.
      await new Promise<void>((resolve, reject) => {
        let unlistenFn: (() => void) | null = null;
        const cleanup = () => {
          unlistenFn?.();
          unlistenFn = null;
        };
        tauriListen<{
          kind: string;
          text?: string | null;
          error?: string | null;
          finish?: string | null;
        }>(`ai-stream-${requestId}`, (event) => {
          const payload = event.payload;
          if (payload.kind === "chunk" && payload.text) {
            streamText += payload.text;
            applyStream();
          } else if (payload.kind === "thinking" && payload.text) {
            streamThinking += payload.text;
            applyStream();
          } else if (payload.kind === "done") {
            cleanup();
            if (payload.error && payload.error !== "cancelled") {
              reject(new Error(payload.error));
              return;
            }
            resolve();
          } else if (payload.kind === "error") {
            cleanup();
            reject(new Error(payload.error ?? "stream error"));
          }
        })
          .then((unlisten) => {
            unlistenFn = unlisten;
            return tauriInvoke("ai_chat", {
              requestId,
              messages,
              temperature: aiTemperature,
              maxTokens: finalNumPredict,
              thinking: thinkMode,
              modelId: aiV3ChatModelId ?? undefined,
            });
          })
          .then(() => {
            // Rust side streams via events; completion arrives as "done".
          })
          .catch((err) => {
            cleanup();
            reject(err);
          });
      });

      activeStreamIdRef.current = null;
      const assistantText = streamText.trim() || t("editor.chat.noResponse");
      setChatMessages((previous) =>
        previous.map((m) =>
          m.id === assistantId
            ? { ...m, text: assistantText, thinking: streamThinking || undefined }
            : m,
        ),
      );
      setAiStatusMessage(t("editor.chat.done"));
    } catch (error) {
      console.error("AI chat failed:", error);
      setAiStatusMessage(t("editor.chat.failed", { error: String(error) }));
      setChatMessages((previous) => [
        ...previous,
        {
          id: `assistant-error-${Date.now()}`,
          role: "assistant",
          text: t("editor.errors.aiRewriteFailed", { error: String(error) }),
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsChatBusy(false);
    }
  }, [aiEnabled, aiV3ChatModelId, aiChatHistoryLimit, aiTemperature, aiSystemPrompt, aiThinkingEnabled, modelSupportsThinking, buildLessonContextText, chatInput, chatMessages, teacher, subject, plannedForInput, logDebug, estimateTokens, activeChatDb, activeChatGrade, activeChatTopic, activeChatFile, vaultPath, setChatContextBudget, t]);

  // Fetch subject DB list when chat or the draft dialog opens (so dropdown is populated)
  useEffect(() => {
    if ((!chatOpen && !draftDialogOpen) || !vaultPath) return;
    tauriInvoke<SubjectDbInfo[]>("subject_db_list", { vaultPath })
      .then((dbs) => setSubjectDatabases(dbs))
      .catch(() => {});
  }, [chatOpen, draftDialogOpen, vaultPath]);

  const getSlashSuggestions = useCallback(
    (requiredType: string, query: string): MethodBankItem[] => {
      if (requiredType === "time") {
        const allTimes = [
          "5 min", "10 min", "15 min", "20 min", "25 min", "30 min",
          "35 min", "40 min", "45 min", "50 min", "55 min", "60 min",
        ];
        const normalizedQuery = query.trim().toLowerCase();
        const filtered = normalizedQuery
          ? allTimes.filter((t) => t.includes(normalizedQuery))
          : allTimes;
        return filtered.slice(0, 12).map((time) => ({
          id: `time-${time.replace(/\s/g, "")}`,
          type: "method" as MethodBankType,
          title: time,
          summary: "",
          description: "",
          duration: time,
          tags: [],
        }));
      }
      const normalizedQuery = query.trim().toLowerCase();
      return methodBankItems
        .filter((entry) => {
          if (entry.type !== requiredType) {
            return false;
          }
          if (!normalizedQuery) {
            return true;
          }
          return (
            entry.title.toLowerCase().includes(normalizedQuery) ||
            entry.summary.toLowerCase().includes(normalizedQuery) ||
            entry.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery))
          );
        })
        .slice(0, 30);
    },
    [methodBankItems],
  );

  const isSelectionInsideLessonTableBodyRow = useCallback((): boolean => {
    if (!editor) {
      return false;
    }

    const { $from } = editor.state.selection;
    let cellDepth = -1;
    for (let depth = $from.depth; depth >= 0; depth -= 1) {
      const nodeName = $from.node(depth).type.name;
      if (nodeName === "tableCell" || nodeName === "tableHeader") {
        cellDepth = depth;
        break;
      }
    }

    if (cellDepth < 2) {
      return false;
    }

    if ($from.node(cellDepth).type.name !== "tableCell") {
      return false;
    }

    const rowDepth = cellDepth - 1;
    const tableDepth = rowDepth - 1;
    if ($from.node(rowDepth).type.name !== "tableRow" || $from.node(tableDepth).type.name !== "table") {
      return false;
    }

    const rowIndex = $from.index(tableDepth);
    return rowIndex > 0;
  }, [editor]);

  const getSelectionMethodType = useCallback((): MethodBankType | "time" | null => {
    if (!editor) {
      return null;
    }

    const { $from } = editor.state.selection;
    let cellDepth = -1;
    for (let depth = $from.depth; depth >= 0; depth -= 1) {
      const nodeName = $from.node(depth).type.name;
      if (nodeName === "tableCell" || nodeName === "tableHeader") {
        cellDepth = depth;
        break;
      }
    }

    if (cellDepth < 2) {
      return null;
    }

    // Exclude table header cells and only allow slash menu in body cells.
    if ($from.node(cellDepth).type.name !== "tableCell") {
      return null;
    }

    const rowDepth = cellDepth - 1;
    const tableDepth = rowDepth - 1;
    if ($from.node(rowDepth).type.name !== "tableRow" || $from.node(tableDepth).type.name !== "table") {
      return null;
    }

    // Exclude the first (header) row.
    const rowIndex = $from.index(tableDepth);
    if (rowIndex === 0) {
      return null;
    }

    const cellIndex = $from.index(rowDepth);
    if (cellIndex === 0) {
      return "time";
    }
    if (cellIndex === 1) {
      return "phase";
    }
    if (cellIndex === 2) {
      return "method";
    }
    if (cellIndex === 3) {
      return "socialForm";
    }

    return null;
  }, [editor]);

  const insertMethodFromSlash = useCallback(
    (entry: MethodBankItem) => {
      if (!editor || !slashMenu) {
        return;
      }

      const didInsert = editor
        .chain()
        .focus()
        .insertContentAt({ from: slashMenu.from, to: slashMenu.to }, `${entry.title} `)
        .run();

      if (didInsert) {
        logDebug("editor", "method-slash-insert", `${entry.type}:${entry.title}`);
      }

      setSlashMenu(null);
    },
    [editor, logDebug, slashMenu],
  );

  const refreshSlashMenu = useCallback(() => {
    if (!editor || !methodBankItems.length) {
      setSlashMenu(null);
      return;
    }

    const { selection } = editor.state;
    if (!selection.empty) {
      setSlashMenu(null);
      return;
    }

    const requiredType = getSelectionMethodType();
    if (!requiredType) {
      setSlashMenu(null);
      return;
    }

    const { $from, from } = selection;
    const parent = $from.parent;
    if (!parent.isTextblock) {
      setSlashMenu(null);
      return;
    }

    const textBefore = parent.textBetween(0, $from.parentOffset, undefined, " ");
    const match = textBefore.match(/(?:^|\s)\/([\w-]*)$/);
    if (!match) {
      setSlashMenu(null);
      return;
    }

    const query = match[1] || "";
    const slashFrom = from - query.length - 1;
    const slashTo = from;
    const coords = editor.view.coordsAtPos(from);

    setSlashMenu((previous) => {
      const sameAnchor =
        previous &&
        previous.from === slashFrom &&
        previous.to === slashTo &&
        previous.requiredType === requiredType;

      return {
        query,
        from: slashFrom,
        to: slashTo,
        x: coords.left,
        y: coords.bottom + 6,
        requiredType,
        selectedIndex: sameAnchor ? previous.selectedIndex : 0,
      };
    });
  }, [editor, getSelectionMethodType, methodBankItems.length]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    refreshSlashMenu();

    const handleSlashStateChange = () => {
      refreshSlashMenu();
    };

    editor.on("update", handleSlashStateChange);
    editor.on("selectionUpdate", handleSlashStateChange);

    return () => {
      editor.off("update", handleSlashStateChange);
      editor.off("selectionUpdate", handleSlashStateChange);
    };
  }, [editor, refreshSlashMenu]);

  useEffect(() => {
    if (!editor || !slashMenu) {
      return;
    }

    const handleSlashKeydown = (event: KeyboardEvent) => {
      const suggestions = getSlashSuggestions(slashMenu.requiredType, slashMenu.query);
      if (suggestions.length === 0) {
        if (event.key === "Escape") {
          event.preventDefault();
          setSlashMenu(null);
        }
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSlashMenu((previous) => {
          if (!previous) return previous;
          return {
            ...previous,
            selectedIndex: (previous.selectedIndex + 1) % suggestions.length,
          };
        });
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSlashMenu((previous) => {
          if (!previous) return previous;
          return {
            ...previous,
            selectedIndex: previous.selectedIndex <= 0 ? suggestions.length - 1 : previous.selectedIndex - 1,
          };
        });
        return;
      }

      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        const selected = suggestions[Math.min(slashMenu.selectedIndex, suggestions.length - 1)] || suggestions[0];
        if (selected) {
          insertMethodFromSlash(selected);
        }
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        setSlashMenu(null);
      }
    };

    editor.view.dom.addEventListener("keydown", handleSlashKeydown, true);

    return () => {
      editor.view.dom.removeEventListener("keydown", handleSlashKeydown, true);
    };
  }, [editor, getSlashSuggestions, insertMethodFromSlash, slashMenu]);

  const handleEditorDragOver = useCallback(
    (event: React.DragEvent) => {
      if (!lessonEditorDragDropEnabled) {
        return;
      }

      if (
        draggedMaterial ||
        draggedMethod ||
        hasMaterialDropData(event.dataTransfer) ||
        hasMethodDropData(event.dataTransfer)
      ) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setIsEditorDropActive(true);
      } else {
        setIsEditorDropActive(false);
      }
    },
    [draggedMaterial, draggedMethod, lessonEditorDragDropEnabled],
  );

  const handleEditorDragLeave = useCallback((event: React.DragEvent) => {
    if (!lessonEditorDragDropEnabled) {
      return;
    }

    const surface = editorSurfaceRef.current;
    if (!surface) {
      setIsEditorDropActive(false);
      return;
    }

    const rect = surface.getBoundingClientRect();
    const outsideSurface =
      event.clientX <= rect.left ||
      event.clientX >= rect.right ||
      event.clientY <= rect.top ||
      event.clientY >= rect.bottom;

    if (outsideSurface) {
      setIsEditorDropActive(false);
    }
  }, [lessonEditorDragDropEnabled]);

  const insertMethodTextAtSelection = useCallback(
    (
      payload: MethodDropPayload,
      clientX?: number,
      clientY?: number,
    ): boolean => {
      if (!editor) {
        return false;
      }

      const getCurrentRowTargetInsertPos = (): number | null => {
        const { selection, doc } = editor.state;
        const { $from } = selection;

        let rowDepth = -1;
        for (let depth = $from.depth; depth >= 0; depth -= 1) {
          if ($from.node(depth).type.name === "tableRow") {
            rowDepth = depth;
            break;
          }
        }

        if (rowDepth < 1) {
          return null;
        }

        const tableDepth = rowDepth - 1;
        if ($from.node(tableDepth).type.name !== "table") {
          return null;
        }

        const targetColumnByType: Record<MethodBankType, number> = {
          phase: 1,
          method: 2,
          socialForm: 3,
        };

        const targetColumnIndex = targetColumnByType[payload.type];
        const tableNode = $from.node(tableDepth);
        const rowIndex = $from.index(tableDepth);
        const rowNode = tableNode.child(rowIndex);
        if (!rowNode || rowNode.childCount <= targetColumnIndex) {
          return null;
        }

        const tableStart = $from.start(tableDepth);
        let rowStart = tableStart;
        for (let currentRowIndex = 0; currentRowIndex < rowIndex; currentRowIndex += 1) {
          rowStart += tableNode.child(currentRowIndex).nodeSize;
        }

        let cellStart = rowStart + 1;
        for (let cellIndex = 0; cellIndex < targetColumnIndex; cellIndex += 1) {
          cellStart += rowNode.child(cellIndex).nodeSize;
        }

        const cellNode = rowNode.child(targetColumnIndex);
        const insertPos = cellStart + cellNode.content.size;
        if (insertPos < 0 || insertPos > doc.content.size + 1) {
          return null;
        }

        return insertPos;
      };

      const inferInsideTableCell = (pos: number): boolean => {
        const resolvedPos = editor.state.doc.resolve(pos);
        for (let depth = resolvedPos.depth; depth > 0; depth -= 1) {
          const nodeName = resolvedPos.node(depth).type.name;
          if (nodeName === "tableCell" || nodeName === "tableHeader") {
            return true;
          }
        }
        return false;
      };

      let targetPos = editor.state.selection.from;
      let isInsideTableCell = false;

      const preferredTargetPos = getCurrentRowTargetInsertPos();
      if (preferredTargetPos !== null) {
        targetPos = preferredTargetPos;
        isInsideTableCell = true;
      }

      if (preferredTargetPos === null && typeof clientX === "number" && typeof clientY === "number") {
        const pointerTarget = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
        const tableCellElement = pointerTarget?.closest("td,th");

        if (tableCellElement && editor.view.dom.contains(tableCellElement)) {
          const firstParagraph = tableCellElement.querySelector("p");
          try {
            if (firstParagraph) {
              targetPos = editor.view.posAtDOM(firstParagraph, firstParagraph.childNodes.length);
            } else {
              targetPos = editor.view.posAtDOM(tableCellElement, 0);
            }
            isInsideTableCell = true;
          } catch {
            isInsideTableCell = false;
          }
        }

        if (!isInsideTableCell) {
          const coordsPos = editor.view.posAtCoords({ left: clientX, top: clientY });
          if (coordsPos?.pos !== undefined) {
            targetPos = coordsPos.pos;
          }
          isInsideTableCell = inferInsideTableCell(targetPos);
        }
      } else if (preferredTargetPos === null) {
        isInsideTableCell = inferInsideTableCell(targetPos);
      }

      editor.chain().focus().setTextSelection(targetPos).run();

      const textToInsert = `${payload.title} `;

      logDebug(
        "editor",
        "method-drop-target",
        `${payload.type} pos=${targetPos} tableCell=${String(isInsideTableCell)} x=${String(clientX)} y=${String(clientY)}`,
      );

      const didInsert = editor
        .chain()
        .focus()
        .insertContentAt(targetPos, textToInsert)
        .run();

      if (!didInsert) {
        return editor.chain().focus().insertContent(textToInsert).run();
      }

      return didInsert;
    },
    [editor, logDebug],
  );

  const insertDroppedMethod = useCallback(
    (dataTransfer: DataTransfer, clientX?: number, clientY?: number): boolean => {
      if (!editor) {
        logDebug("editor", "method-drop-insert-skip", "editor missing");
        return false;
      }

      const payload = getMethodDropPayload(dataTransfer) || draggedMethod;
      if (!payload) {
        logDebug("editor", "method-drop-payload-missing", `types=${Array.from(dataTransfer.types || []).join(",")}`);
        return false;
      }

      const didInsert = insertMethodTextAtSelection(payload, clientX, clientY);
      if (!didInsert) {
        logDebug("editor", "method-drop-insert-failed", `${payload.type}:${payload.title}`);
        return false;
      }

      logDebug("editor", "method-drop-insert-success", `${payload.type}:${payload.title}`);
      setDraggedMethod(null);
      return true;
    },
    [draggedMethod, editor, insertMethodTextAtSelection, logDebug],
  );

  const handleInsertMethod = useCallback(
    (entry: MethodBankItem) => {
      if (!isSelectionInsideLessonTableBodyRow()) {
        logDebug("editor", "method-double-click-skipped", "cursor-not-inside-lesson-table-body-row");
        return;
      }

      const payload: MethodDropPayload = {
        id: entry.id,
        type: entry.type,
        title: entry.title,
        summary: entry.summary,
        duration: entry.duration,
      };

      const didInsert = insertMethodTextAtSelection(payload);
      if (didInsert) {
        logDebug("editor", "method-click-insert", `${entry.type}:${entry.title}`);
        editor?.view.focus();
      }
    },
    [editor, insertMethodTextAtSelection, isSelectionInsideLessonTableBodyRow, logDebug],
  );

  const insertMaterialLinkAtSelection = useCallback(
    (
      payload: MaterialDropPayload,
      clientX?: number,
      clientY?: number,
    ): boolean => {
      if (!editor) {
        return false;
      }

      const fileName = payload.relativePath.split("/").pop() || payload.relativePath;

      const getCurrentRowMaterialCellInsertPos = (): number | null => {
        const { selection, doc } = editor.state;
        const $from = selection.$from;

        let rowDepth = -1;
        for (let depth = $from.depth; depth >= 0; depth -= 1) {
          if ($from.node(depth).type.name === "tableRow") {
            rowDepth = depth;
            break;
          }
        }

        if (rowDepth < 1) {
          return null;
        }

        const tableDepth = rowDepth - 1;
        if ($from.node(tableDepth).type.name !== "table") {
          return null;
        }

        const tableNode = $from.node(tableDepth);
        const rowIndex = $from.index(tableDepth);
        const rowNode = tableNode.child(rowIndex);
        if (!rowNode || rowNode.childCount === 0) {
          return null;
        }

        const materialColumnIndex = rowNode.childCount - 1;
        const tableStart = $from.start(tableDepth);
        let rowStart = tableStart;
        for (let currentRowIndex = 0; currentRowIndex < rowIndex; currentRowIndex += 1) {
          rowStart += tableNode.child(currentRowIndex).nodeSize;
        }

        let cellStart = rowStart + 1;
        for (let cellIndex = 0; cellIndex < materialColumnIndex; cellIndex += 1) {
          cellStart += rowNode.child(cellIndex).nodeSize;
        }

        const cellNode = rowNode.child(materialColumnIndex);
        const insertPos = cellStart + cellNode.content.size;
        if (insertPos < 0 || insertPos > doc.content.size + 1) {
          return null;
        }

        return insertPos;
      };

      const inferInsideTableCell = (pos: number): boolean => {
        const resolvedPos = editor.state.doc.resolve(pos);
        for (let depth = resolvedPos.depth; depth > 0; depth -= 1) {
          const nodeName = resolvedPos.node(depth).type.name;
          if (nodeName === "tableCell" || nodeName === "tableHeader") {
            return true;
          }
        }
        return false;
      };

      let targetPos = editor.state.selection.from;
      let isInsideTableCell = false;

      const materialCellTargetPos = getCurrentRowMaterialCellInsertPos();
      if (materialCellTargetPos !== null) {
        targetPos = materialCellTargetPos;
        isInsideTableCell = true;
      }

      if (materialCellTargetPos === null && typeof clientX === "number" && typeof clientY === "number") {
        const pointerTarget = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
        const tableCellElement = pointerTarget?.closest("td,th");

        if (tableCellElement && editor.view.dom.contains(tableCellElement)) {
          const firstParagraph = tableCellElement.querySelector("p");
          try {
            if (firstParagraph) {
              targetPos = editor.view.posAtDOM(firstParagraph, firstParagraph.childNodes.length);
            } else {
              targetPos = editor.view.posAtDOM(tableCellElement, 0);
            }
            isInsideTableCell = true;
          } catch {
            isInsideTableCell = false;
          }
        }

        if (!isInsideTableCell) {
          const coordsPos = editor.view.posAtCoords({ left: clientX, top: clientY });
          if (coordsPos?.pos !== undefined) {
            targetPos = coordsPos.pos;
          }
          isInsideTableCell = inferInsideTableCell(targetPos);
        }
      } else if (materialCellTargetPos === null) {
        isInsideTableCell = inferInsideTableCell(targetPos);
      }

      editor.chain().focus().setTextSelection(targetPos).run();

      const materialNode = {
        type: "materialLink",
        attrs: {
          fileName,
          filePath: payload.relativePath,
          itemType: payload.itemType,
        },
      };

      const inlineContent = [materialNode, { type: "text", text: " " }];
      const blockContent = [
        {
          type: "paragraph",
          content: [materialNode],
        },
        { type: "paragraph" },
      ];

      logDebug(
        "editor",
        "drop-target",
        `pos=${targetPos} tableCell=${String(isInsideTableCell)} x=${String(clientX)} y=${String(clientY)}`,
      );

      const didInsertInline = editor
        .chain()
        .focus()
        .insertContentAt(targetPos, inlineContent)
        .run();

      if (didInsertInline) {
        return true;
      }

      const didInsert = editor
        .chain()
        .focus()
        .insertContentAt(targetPos, isInsideTableCell ? inlineContent : blockContent)
        .run();

      if (!didInsert) {
        return editor.chain().focus().insertContent(`[Material] ${payload.relativePath}`).run();
      }

      return didInsert;
    },
    [editor],
  );

  const insertDroppedMaterial = useCallback(
    (dataTransfer: DataTransfer, clientX?: number, clientY?: number): boolean => {
      if (!editor) {
        logDebug("editor", "drop-insert-skip", "editor missing");
        return false;
      }

      const payload =
        getMaterialDropPayload(dataTransfer) ||
        (draggedMaterial
          ? {
              relativePath: draggedMaterial.relativePath,
              itemType: draggedMaterial.isDirectory ? "folder" : "file",
            }
          : null);
      if (!payload) {
        logDebug("editor", "drop-payload-missing", `types=${Array.from(dataTransfer.types || []).join(",")}`);
        return false;
      }

      logDebug("editor", "drop-payload", `${payload.relativePath} (${payload.itemType})`);

      const didInsert = insertMaterialLinkAtSelection(payload, clientX, clientY);

      if (!didInsert) {
        logDebug("editor", "drop-insert-failed", payload.relativePath);
        return false;
      }

      logDebug("editor", "drop-insert-success", payload.relativePath);
      setDraggedMaterial(null);

      return true;
    },
    [draggedMaterial, editor, insertMaterialLinkAtSelection, setDraggedMaterial, logDebug],
  );

  const handleEditorDrop = useCallback(
    (event: React.DragEvent) => {
      if (!lessonEditorDragDropEnabled) {
        return;
      }

      if (!editor) {
        return;
      }

      const isMethodDrop = !!draggedMethod || hasMethodDropData(event.dataTransfer);
      const isMaterialDrop = !!draggedMaterial || hasMaterialDropData(event.dataTransfer);
      if (!isMethodDrop && !isMaterialDrop) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setIsEditorDropActive(false);

      if (isMethodDrop) {
        const didInsertMethod = insertDroppedMethod(event.dataTransfer, event.clientX, event.clientY);
        if (!didInsertMethod) {
          logDebug("editor", "method-drop-react-handler-skip", "insertDroppedMethod returned false");
        }
        return;
      }

      const didInsert = insertDroppedMaterial(event.dataTransfer, event.clientX, event.clientY);
      if (!didInsert) {
        logDebug("editor", "drop-react-handler-skip", "insertDroppedMaterial returned false");
        return;
      }
    },
    [draggedMaterial, draggedMethod, editor, insertDroppedMaterial, insertDroppedMethod, lessonEditorDragDropEnabled, logDebug],
  );

  useEffect(() => {
    if (!editor) {
      return;
    }

    if (!lessonEditorDragDropEnabled) {
      return;
    }

    const dom = editor.view.dom;

    const onNativeDragOver = (event: DragEvent) => {
      if (!event.dataTransfer) return;

      if (
        draggedMaterial ||
        draggedMethod ||
        hasMaterialDropData(event.dataTransfer) ||
        hasMethodDropData(event.dataTransfer)
      ) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }
    };

    const onNativeDrop = (event: DragEvent) => {
      if (!event.dataTransfer) return;

      const isMethodDrop = !!draggedMethod || hasMethodDropData(event.dataTransfer);
      const isMaterialDrop = !!draggedMaterial || hasMaterialDropData(event.dataTransfer);
      if (!isMethodDrop && !isMaterialDrop) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setIsEditorDropActive(false);

      if (isMethodDrop) {
        const didInsertMethod = insertDroppedMethod(event.dataTransfer, event.clientX, event.clientY);
        if (!didInsertMethod) {
          logDebug("editor", "method-drop-native-handler-skip", "insertDroppedMethod returned false");
        }
        return;
      }

      const didInsert = insertDroppedMaterial(event.dataTransfer, event.clientX, event.clientY);
      if (!didInsert) {
        logDebug("editor", "drop-native-handler-skip", "insertDroppedMaterial returned false");
        return;
      }
    };

    dom.addEventListener("dragover", onNativeDragOver, true);
    dom.addEventListener("drop", onNativeDrop, true);

    return () => {
      dom.removeEventListener("dragover", onNativeDragOver, true);
      dom.removeEventListener("drop", onNativeDrop, true);
    };
  }, [draggedMaterial, draggedMethod, editor, insertDroppedMaterial, insertDroppedMethod, lessonEditorDragDropEnabled, logDebug]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    if (!lessonEditorDragDropEnabled) {
      return;
    }

    const onWindowDragOver = (event: DragEvent) => {
      const activeMaterialDrag = useAppStore.getState().draggedMaterial;
      if (!activeMaterialDrag && !draggedMethod) {
        return;
      }

      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
    };

    const onWindowDrop = (event: DragEvent) => {
      const activeMaterialDrag = useAppStore.getState().draggedMaterial;
      const activeMethodDrag = draggedMethod;
      if (!activeMaterialDrag && !activeMethodDrag) {
        return;
      }

      const surface = editorSurfaceRef.current;
      if (!surface) return;

      const rect = surface.getBoundingClientRect();
      const isInsideSurface =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;

      if (!isInsideSurface) {
        logDebug("editor", "drop-window-outside", `x=${event.clientX},y=${event.clientY}`);
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setIsEditorDropActive(false);

      if (activeMethodDrag) {
        const didInsertMethod = insertMethodTextAtSelection(activeMethodDrag, event.clientX, event.clientY);
        if (didInsertMethod) {
          logDebug("editor", "method-drop-window-success", `${activeMethodDrag.type}:${activeMethodDrag.title}`);
          setDraggedMethod(null);
        } else {
          logDebug("editor", "method-drop-window-failed", `${activeMethodDrag.type}:${activeMethodDrag.title}`);
        }
        return;
      }

      const payload =
        (event.dataTransfer && getMaterialDropPayload(event.dataTransfer)) ||
        {
          relativePath: activeMaterialDrag!.relativePath,
          itemType: activeMaterialDrag!.isDirectory ? "folder" : "file",
        };

      const didInsert = insertMaterialLinkAtSelection(payload, event.clientX, event.clientY);
      if (didInsert) {
        logDebug("editor", "drop-window-success", payload.relativePath);
        setDraggedMaterial(null);
      } else {
        logDebug("editor", "drop-window-failed", payload.relativePath);
      }
    };

    window.addEventListener("dragover", onWindowDragOver, true);
    window.addEventListener("drop", onWindowDrop, true);

    return () => {
      window.removeEventListener("dragover", onWindowDragOver, true);
      window.removeEventListener("drop", onWindowDrop, true);
    };
  }, [draggedMethod, editor, insertMaterialLinkAtSelection, insertMethodTextAtSelection, lessonEditorDragDropEnabled, setDraggedMaterial, logDebug]);

  useEffect(() => {
    if (!editor || !pendingMaterialDrop) {
      return;
    }

    const { clientX, clientY, relativePath, isDirectory } = pendingMaterialDrop;
    const shouldInsertAtCursor = clientX < 0 || clientY < 0;

    if (shouldInsertAtCursor) {
      const didInsert = insertMaterialLinkAtSelection({
        relativePath,
        itemType: isDirectory ? "folder" : "file",
      });

      logDebug(
        "editor",
        didInsert ? "double-click-insert-success" : "double-click-insert-failed",
        relativePath,
      );

      if (didInsert) {
        setDraggedMaterial(null);
      }

      setPendingMaterialDrop(null);
      return;
    }

    const surface = editorSurfaceRef.current;
    if (!surface) {
      setPendingMaterialDrop(null);
      return;
    }

    const rect = surface.getBoundingClientRect();
    const isInsideSurface =
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom;

    if (!isInsideSurface) {
      logDebug("editor", "drag-end-fallback-outside", `${relativePath} | x=${clientX},y=${clientY}`);
      setPendingMaterialDrop(null);
      return;
    }

    const didInsert = insertMaterialLinkAtSelection(
      {
        relativePath,
        itemType: isDirectory ? "folder" : "file",
      },
      clientX,
      clientY,
    );

    logDebug(
      "editor",
      didInsert ? "drag-end-fallback-success" : "drag-end-fallback-failed",
      relativePath,
    );

    if (didInsert) {
      setDraggedMaterial(null);
    }

    setPendingMaterialDrop(null);
  }, [editor, pendingMaterialDrop, insertMaterialLinkAtSelection, setPendingMaterialDrop, setDraggedMaterial, logDebug]);

  // Subject color drives both the on-screen picker and the exported subject dot.
  const normalizedSubjectName = subject.trim().toLowerCase();
  const selectedSubjectConfig = normalizedSubjectName
    ? subjects.find((entry) => entry.name.trim().toLowerCase() === normalizedSubjectName)
    : undefined;
  const selectedSubjectColor = selectedSubjectConfig
    ? normalizeColorForPicker(selectedSubjectConfig.color, "#9ca3af")
    : null;

  const {
    isPdfBusy,
    pdfPreviewUrl,
    closePdfPreview,
    previewPdf,
    printPdf,
    exportPdf,
  } = useLessonPdf({
    vaultPath,
    subject,
    teacher,
    plannedForInput,
    selectedSubjectColor,
    closeTransientUi: () => {
      setTableContextMenu(null);
      setPlannedCalendarOpen(false);
    },
  });
  const formatDate = (isoString?: string | null) => {
    if (!isoString) return t("editor.meta.notSet");
    return new Date(isoString).toLocaleDateString("en-GB", {
      weekday: "short", year: "numeric", month: "short", day: "numeric"
    });
  };

  // Bridge: expose Editor actions + panel toggles to TopBar.
  // Keep callable handlers in refs so TopBar actions always execute latest logic
  // without forcing a render loop from function identity changes.
  const saveRef = useRef<() => void>(() => {});
  const previewRef = useRef<() => void>(() => {});
  const printRef = useRef<() => void>(() => {});
  const exportRef = useRef<() => void>(() => {});
  const insertTableRef = useRef<() => void>(() => {});
  const toggleChatRef = useRef<() => void>(() => {});
  const toggleNotesRef = useRef<() => void>(() => {});
  const toggleMethodBankRef = useRef<() => void>(() => {});

  saveRef.current = () => {
    void handleSave();
  };
  previewRef.current = () => {
    void previewPdf();
  };
  printRef.current = () => {
    void printPdf();
  };
  exportRef.current = () => {
    void exportPdf();
  };
  insertTableRef.current = insertLessonTable;
  toggleChatRef.current = toggleChatPanel;
  toggleNotesRef.current = toggleNotesPanel;
  toggleMethodBankRef.current = toggleMethodBankPanel;

  useEffect(() => {
    setEditorActions({
      save: () => saveRef.current(),
      preview: () => previewRef.current(),
      print: () => printRef.current(),
      export: () => exportRef.current(),
      insertTable: () => insertTableRef.current(),
      toggleChat: () => toggleChatRef.current(),
      toggleNotes: () => toggleNotesRef.current(),
      toggleMethodBank: () => toggleMethodBankRef.current(),
      chatOpen,
      notesOpen,
      methodBankOpen,
      isPdfBusy,
      aiEnabled,
    });
    return () => setEditorActions(null);
  }, [setEditorActions, chatOpen, notesOpen, methodBankOpen, isPdfBusy, aiEnabled]);

  const selectedPlannedDate = parseEuropeanDateToDate(plannedForInput);

  const monthStart = startOfMonth(plannedCalendarMonth);
  const monthEnd = endOfMonth(monthStart);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const tableActionsEnabled = editor
    ? {
        addRowBefore: editor.can().addRowBefore(),
        addRowAfter: editor.can().addRowAfter(),
        addColumnBefore: editor.can().addColumnBefore(),
        addColumnAfter: editor.can().addColumnAfter(),
        deleteRow: editor.can().deleteRow(),
        deleteColumn: editor.can().deleteColumn(),
        deleteTable: editor.can().deleteTable(),
        mergeCells: editor.can().mergeCells(),
        splitCell: editor.can().splitCell(),
        toggleHeaderRow: editor.can().toggleHeaderRow(),
        toggleHeaderColumn: editor.can().toggleHeaderColumn(),
      }
    : {
        addRowBefore: false,
        addRowAfter: false,
        addColumnBefore: false,
        addColumnAfter: false,
        deleteRow: false,
        deleteColumn: false,
        deleteTable: false,
        mergeCells: false,
        splitCell: false,
        toggleHeaderRow: false,
        toggleHeaderColumn: false,
      };
  const slashSuggestions = slashMenu
    ? getSlashSuggestions(slashMenu.requiredType, slashMenu.query)
    : [];

  return (
    <div
      className="tp-editor-page flex flex-row w-full h-full min-h-0 print:block"
      style={{ background: "var(--tp-bg-app)" }}
    >
      {/* Left: scrollable paper area with zoom wrapper */}
      <div
        ref={paperScrollRef}
        className="tp-paper-scroll flex-1 min-w-0 print:p-0 print:overflow-visible"
      >
        <div className="tp-paper-zoom" style={{ zoom: effectiveZoom }}>
      <div
        id="lesson-plan-container"
        className="tp-editor-surface rounded-[14px] shadow-[0_14px_44px_rgba(0,0,0,0.42)] flex flex-col mx-auto print:bg-white print:border-none print:shadow-none print:min-h-0 print:max-w-none"
        style={{
          background: "var(--tp-paper-bg)",
          border: "1px solid var(--tp-paper-line-soft)",
        }}
      >
        <div id="lesson-plan-export-content" className="flex-1 lesson-export-surface">
          <div className="px-6 pt-4 pb-5 lesson-export-meta" style={{ borderBottom: "1px solid var(--tp-paper-line)", marginBottom: "24px" }}>
              <div className="flex justify-around gap-x-4 gap-y-4 items-start [&_input]:text-center [&_select]:text-center [&>div]:flex [&>div]:flex-col [&>div]:items-center [&>div]:text-center [&>div]:w-[200px] [&>div]:max-w-[200px]">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.06em] lesson-export-label" style={{ color: "var(--tp-paper-ink-3)" }}>{t("editor.meta.teacher")}</span>
                  <input
                    type="text"
                    value={teacher}
                    onChange={(e) => setTeacher(e.target.value)}
                    placeholder={t("editor.meta.yourName")}
                    className="tp-meta-input lesson-export-input w-full"
                  />
                  <span className="hidden lesson-export-value lesson-export-teacher-text text-black">{teacher.trim() || t("editor.meta.notSet")}</span>
                </div>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.06em] lesson-export-label" style={{ color: "var(--tp-paper-ink-3)" }}>{t("editor.meta.created")}</span>
                  <span className="text-[13px] lesson-export-value" style={{ color: "var(--tp-paper-ink)" }}>{formatDate(activeFileContent?.metadata?.createdAt)}</span>
                </div>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.06em] lesson-export-label" style={{ color: "var(--tp-paper-ink-3)" }}>{t("editor.meta.plannedFor")}</span>
                  <div className="flex items-center justify-center gap-1.5 w-full">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={plannedForInput}
                    onChange={(event) => setPlannedForInput(event.target.value)}
                    placeholder={t("editor.meta.dateFormat")}
                    className="tp-meta-input lesson-export-input lesson-export-planned-input flex-1 min-w-0 text-center"
                  />
                  <div className="relative lesson-export-calendar-trigger print:hidden" ref={plannedCalendarRef}>
                    <button
                      type="button"
                      onClick={() => {
                        if (!plannedCalendarOpen) {
                          setPlannedCalendarMonth(selectedPlannedDate || new Date());
                        }
                        setPlannedCalendarOpen((previous) => !previous);
                      }}
                      className="h-7 w-7 inline-flex items-center justify-center rounded transition-colors hover:opacity-70 print:hidden"
                      style={{ color: "var(--tp-paper-ink-3)", border: "1px solid var(--tp-paper-line)" }}
                      title={t("editor.pdf.pickPlannedDate")}
                    >
                      <CalendarDays className="w-4 h-4" />
                    </button>

                    {plannedCalendarOpen && (
                      <div className="absolute top-12 left-0 z-[72] w-[250px] rounded-lg border border-[#333] bg-[#1b1b1b] p-3 shadow-2xl print:hidden lesson-export-calendar-popover">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-sm font-semibold text-gray-200">
                            {formatDateFn(plannedCalendarMonth, "MMM yyyy", { locale: language === "de" ? deLocale : undefined })}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setPlannedCalendarMonth((prev) => subMonths(prev, 1))}
                              className="p-1 rounded text-gray-400 hover:text-[var(--tp-t-1)] hover:bg-[var(--tp-bg-4)]"
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setPlannedCalendarMonth((prev) => addMonths(prev, 1))}
                              className="p-1 rounded text-gray-400 hover:text-[var(--tp-t-1)] hover:bg-[var(--tp-bg-4)]"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] text-gray-500">
                          {Array.from({ length: 7 }, (_, i) => t(`calendar.dayHeader${i}`)).map((day) => (
                            <span key={day}>{day}</span>
                          ))}
                        </div>

                        <div className="grid grid-cols-7 gap-1 text-[12.5px]">
                          {calendarDays.map((day) => {
                            const inCurrentMonth = isSameMonth(day, monthStart);
                            const isSelected = !!selectedPlannedDate && isSameDay(day, selectedPlannedDate);

                            return (
                              <button
                                key={day.toISOString()}
                                type="button"
                                onClick={() => {
                                  setPlannedForInput(formatDateFn(day, "dd/MM/yyyy"));
                                  setPlannedCalendarOpen(false);
                                }}
                                className={`h-7 rounded text-center transition-colors hover:brightness-110 ${
                                  inCurrentMonth
                                    ? "text-gray-200 hover:bg-[var(--tp-bg-4)]"
                                    : "text-gray-600 hover:bg-[#242424]"
                                } ${isSelected ? "text-white font-semibold" : ""}`}
                                style={isSelected ? { backgroundColor: "var(--tp-accent)" } : undefined}
                              >
                                {formatDateFn(day, "d")}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                  <span className="hidden lesson-export-value lesson-export-planned-text">
                    {plannedForInput.trim() || t("editor.meta.notSet")}
                  </span>
                  </div>
                </div>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.06em] lesson-export-label" style={{ color: "var(--tp-paper-ink-3)" }}>{t("editor.meta.subject")}</span>
                  {subjects.length > 0 ? (
                    <div className="flex items-center gap-1.5 lesson-export-subject-picker w-full">
                      {selectedSubjectColor && (
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: selectedSubjectColor }}
                        />
                      )}
                      <select
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        className="tp-meta-input lesson-export-input flex-1 min-w-0"
                      >
                        <option value="">{t("editor.meta.none")}</option>
                        {subjects.map((s) => (
                          <option key={s.name} value={s.name}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder={t("editor.meta.egMathematics")}
                      className="tp-meta-input lesson-export-input w-full"
                    />
                  )}
                  <span className="hidden lesson-export-value lesson-export-subject-text">
                    <span className="lesson-export-subject-dot-print h-2.5 w-2.5 rounded-full border border-black/10" />
                    <span className="lesson-export-subject-name-print">{subject.trim() || t("editor.meta.notSet")}</span>
                  </span>
                </div>
              </div>
            </div>

          <div
            ref={editorSurfaceRef}
            className="px-6 pb-6 flex-1 print:p-0 lesson-export-editor overflow-x-auto relative transition-colors"
            onDragOver={handleEditorDragOver}
            onDragLeave={handleEditorDragLeave}
            onDrop={handleEditorDrop}
            onContextMenu={handleEditorContextMenu}
          >
            <EditorContent editor={editor} className="h-full" />
          </div>

          {tableContextMenu && (
            <EditorContextMenu
              editor={editor}
              menu={tableContextMenu}
              onClose={() => setTableContextMenu(null)}
              aiEnabled={aiEnabled}
              aiBusy={isAiBusy}
              highlightColor={highlightColor}
              aiTranslateTargetLanguage={aiTranslateTargetLanguage}
              tableActionsEnabled={tableActionsEnabled}
              onInsertCustomTable={insertCustomTable}
              runAiSelectionAction={runAiSelectionAction}
            />
          )}
        </div>
      </div>
      </div>
      </div>

      {/* Right: vertical formatting + actions rail */}
      <MenuBar
        editor={editor}
        onInsertCustomTable={insertCustomTable}
        lastHighlightColor={highlightColor}
        lastTextColor={textColor}
        lastUnderlineColor={underlineColor}
        onHighlightColorChange={setHighlightColor}
        onTextColorChange={setTextColor}
        onUnderlineColorChange={setUnderlineColor}
      />

      {/* AI Lesson Draft Generator (opt-in) */}
      <DraftGeneratorDialog
        key={activeFilePath ?? "no-lesson"}
        open={draftDialogOpen}
        onClose={() => setDraftDialogOpen(false)}
        editor={editor}
        defaultTopic={subject ?? ""}
        defaultGrade=""
        aiEnabled={aiEnabled}
        vaultPath={vaultPath}
        activeDb={activeChatDb}
        activeGrade={activeChatGrade}
        activeTopic={activeChatTopic}
        activeFile={activeChatFile}
        subjectDatabases={subjectDatabases}
        methodBankItems={methodBankItems}
      />

      {/* Notes Panel - Left Side */}
      <NotesPanel
        open={notesOpen}
        notes={lessonNotes}
        onChange={setLessonNotes}
        onClose={() => setNotesOpen(false)}
      />

      <MethodBankPanel
        open={methodBankOpen}
        onClose={() => setMethodBankOpen(false)}
        loading={methodBankLoading}
        error={methodBankError}
        items={methodBankItems}
        onInsert={handleInsertMethod}
      />


      <AiChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        messages={chatMessages}
        onClearMessages={() => setChatMessages([])}
        input={chatInput}
        onInputChange={setChatInput}
        onSend={handleSubmitChat}
        busy={isChatBusy}
        modelId={aiV3ChatModelId ?? "Auto (v3)"}
        thinkingEnabled={aiThinkingEnabled}
        onToggleThinking={() => setAiThinkingEnabled(!aiThinkingEnabled)}
        modelSupportsThinking={modelSupportsThinking}
        expandedThinking={expandedThinking}
        onToggleThinkingMessage={(id) =>
          setExpandedThinking((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          })
        }
        subjectDatabases={subjectDatabases}
        activeDb={activeChatDb}
        activeGrade={activeChatGrade}
        activeTopic={activeChatTopic}
        activeFile={activeChatFile}
        onSelectDb={selectDb}
        streaming={isChatBusy}
        onStopStreaming={() => void stopAiStreaming()}
        onOpenDraftGenerator={() => setDraftDialogOpen(true)}
      />


      {slashMenu && (
        <div
          className="fixed z-[210] w-[320px] overflow-hidden rounded-lg border border-[var(--tp-border-strong)] bg-[var(--tp-panel-elevated)] shadow-2xl print:hidden"
          style={{ left: slashMenu.x, top: slashMenu.y }}
        >
          <div className="border-b border-[var(--tp-border-strong)] bg-[var(--tp-panel-muted)] px-3 py-2 text-[11px] text-[var(--tp-text-muted)]">
            {t(`editor.slashMenu.${slashMenu.requiredType}Suggestions`)}
          </div>
          <div className="max-h-[250px] overflow-y-auto [scrollbar-width:thin] [scrollbar-color:#3a3a3a_#161616] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-[#161616] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#3a3a3a]">
            {slashSuggestions.length === 0 ? (
              <div className="px-3 py-2 text-[11px] text-[var(--tp-text-muted)]">
                {t("editor.slashMenu.noMatches", { query: slashMenu.query })}
              </div>
            ) : (
              slashSuggestions.map((entry, index) => (
                <button
                  key={`slash-${entry.id}`}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    insertMethodFromSlash(entry);
                  }}
                  className={`w-full px-3 py-2 text-left transition-colors ${
                    index === slashMenu.selectedIndex
                      ? "bg-[var(--tp-accent)]/20"
                      : "hover:bg-[var(--tp-bg-4)]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[12px] font-medium text-[var(--tp-text-primary)]">{entry.title}</span>
                    <span className={`shrink-0 text-[11px] ${METHOD_TYPE_ACCENT[entry.type]}`}>
                      {entry.duration}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-[var(--tp-text-muted)]">{entry.summary}</p>
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {/* Custom Table Insert Dialog */}
      {customTableDialog && (
        <div
          className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center print:hidden"
          onMouseDown={() => setCustomTableDialog(null)}
        >
          <div
            className="w-[320px] rounded-xl overflow-hidden shadow-2xl"
            style={{ background: "var(--tp-bg-1)", border: "1px solid var(--tp-b-2)" }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div
              className="px-4 py-3 flex items-center gap-2 font-semibold text-[13px]"
              style={{ borderBottom: "1px solid var(--tp-b-1)", color: "var(--tp-t-1)" }}
            >
              <TableIcon className="w-4 h-4" style={{ color: "var(--tp-accent)" }} />
              {t("editor.insertTableDialog.title")}
            </div>
            <div className="px-4 py-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <label className="text-[12px] font-medium" style={{ color: "var(--tp-t-2)" }}>{t("editor.insertTableDialog.rows")}</label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={customTableDialog.rows}
                  onChange={(e) => setCustomTableDialog({ ...customTableDialog, rows: Math.max(1, Math.min(30, Number(e.target.value) || 1)) })}
                  className="w-20 h-8 px-2 rounded-md text-[12px] text-center outline-none"
                  style={{ background: "var(--tp-bg-2)", border: "1px solid var(--tp-b-2)", color: "var(--tp-t-1)" }}
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-[12px] font-medium" style={{ color: "var(--tp-t-2)" }}>{t("editor.insertTableDialog.columns")}</label>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={customTableDialog.cols}
                  onChange={(e) => setCustomTableDialog({ ...customTableDialog, cols: Math.max(1, Math.min(12, Number(e.target.value) || 1)) })}
                  className="w-20 h-8 px-2 rounded-md text-[12px] text-center outline-none"
                  style={{ background: "var(--tp-bg-2)", border: "1px solid var(--tp-b-2)", color: "var(--tp-t-1)" }}
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-[12px] font-medium" style={{ color: "var(--tp-t-2)" }}>{t("editor.insertTableDialog.headerRow")}</label>
                <button
                  type="button"
                  onClick={() => setCustomTableDialog({ ...customTableDialog, withHeaderRow: !customTableDialog.withHeaderRow })}
                  className="w-10 h-5 rounded-full relative transition-colors hover:brightness-125"
                  style={{ background: customTableDialog.withHeaderRow ? "var(--tp-accent)" : "var(--tp-bg-4)" }}
                >
                  <span
                    className="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform"
                    style={{ left: customTableDialog.withHeaderRow ? "calc(100% - 18px)" : "2px" }}
                  />
                </button>
              </div>

              {/* Visual grid preview */}
              <div
                className="mt-1 rounded-md p-2 flex flex-col gap-[2px] overflow-hidden"
                style={{ background: "var(--tp-bg-2)", border: "1px solid var(--tp-b-1)" }}
              >
                {Array.from({ length: Math.min(customTableDialog.rows, 6) }, (_, r) => (
                  <div key={r} className="flex gap-[2px]">
                    {Array.from({ length: Math.min(customTableDialog.cols, 8) }, (_, c) => (
                      <div
                        key={c}
                        className="flex-1 h-3 rounded-sm"
                        style={{
                          background: r === 0 && customTableDialog.withHeaderRow ? "var(--tp-accent)" : "var(--tp-bg-4)",
                          opacity: r === 0 && customTableDialog.withHeaderRow ? 0.6 : 0.4,
                        }}
                      />
                    ))}
                  </div>
                ))}
                {customTableDialog.rows > 6 && (
                  <div className="text-[11px] text-center pt-0.5" style={{ color: "var(--tp-t-4)" }}>
                    +{customTableDialog.rows - 6} more row{customTableDialog.rows - 6 > 1 ? "s" : ""}
                  </div>
                )}
              </div>
            </div>
            <div
              className="px-4 py-3 flex items-center justify-end gap-2"
              style={{ borderTop: "1px solid var(--tp-b-1)" }}
            >
              <button
                onClick={() => setCustomTableDialog(null)}
                className="h-8 px-3 rounded-md text-[12px] font-medium transition-colors hover:brightness-125"
                style={{ background: "var(--tp-bg-3)", color: "var(--tp-t-2)", border: "1px solid var(--tp-b-2)" }}
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={confirmInsertCustomTable}
                className="h-8 px-4 rounded-md text-[12px] font-medium text-white transition-colors hover:brightness-110"
                style={{ background: "var(--tp-accent)" }}
              >
                {t("editor.insertTableDialog.title")}
              </button>
            </div>
          </div>
        </div>
      )}

      <LessonPdfPreviewModal
        url={pdfPreviewUrl}
        onClose={closePdfPreview}
        onPrint={printPdf}
      />

    </div>
  );
}