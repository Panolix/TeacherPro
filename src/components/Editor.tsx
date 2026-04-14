import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { Placeholder } from "@tiptap/extension-placeholder";
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
import { useAppStore } from "../store";
import { useCallback, useEffect, useRef, useState } from "react";
import { MaterialLink } from "./extensions/MaterialLink";
import {
  createPdfBlobUrl,
  printCurrentWindow,
  renderElementToPdfBytes,
  revokePdfBlobUrl,
  savePdfToVault,
} from "../utils/pdfExport";
import {
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Undo,
  Redo,
  Save,
  Table as TableIcon,
  Printer,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Eye,
  X,
} from "lucide-react";

interface MaterialDropPayload {
  relativePath: string;
  itemType: "file" | "folder";
}

interface TableContextMenuState {
  x: number;
  y: number;
}

function getMaterialDropPayload(dataTransfer: DataTransfer): MaterialDropPayload | null {
  const structuredPayload = dataTransfer.getData("application/teacherpro-material");
  let relativePath = "";
  let itemType: "file" | "folder" = "file";

  if (structuredPayload) {
    try {
      const parsed = JSON.parse(structuredPayload) as {
        relativePath?: string;
        isDirectory?: boolean;
      };
      relativePath = parsed.relativePath || "";
      itemType = parsed.isDirectory ? "folder" : "file";
    } catch {
      relativePath = "";
    }
  }

  if (!relativePath) {
    relativePath = dataTransfer.getData("application/teacherpro-file");
  }

  if (!relativePath) {
    relativePath = dataTransfer.getData("text/plain");
  }

  if (!relativePath) {
    return null;
  }

  return { relativePath, itemType };
}

function formatIsoToEuropeanDate(isoString?: string | null): string {
  if (!isoString) return "";

  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());

  return `${day}/${month}/${year}`;
}

function parseEuropeanDateToIso(value: string): string | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (!match) return undefined;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return undefined;
  }

  const parsed = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return undefined;
  }

  return parsed.toISOString();
}

function parseEuropeanDateToDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const parsed = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
}

const MenuBar = ({
  editor,
  onSave,
  onPreview,
  onPrint,
  onExport,
  isPdfBusy,
}: {
  editor: any;
  onSave: () => void;
  onPreview: () => void;
  onPrint: () => void;
  onExport: () => void;
  isPdfBusy: boolean;
}) => {
  // Force a re-render when the editor state changes so active buttons update
  const [, setForceUpdate] = useState(0);

  useEffect(() => {
    if (!editor) return;

    const handleUpdate = () => {
      setForceUpdate((prev) => prev + 1);
    };

    editor.on("transaction", handleUpdate);
    editor.on("selectionUpdate", handleUpdate);

    return () => {
      editor.off("transaction", handleUpdate);
      editor.off("selectionUpdate", handleUpdate);
    };
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className="tp-editor-toolbar flex items-center justify-between border-b border-[#333333] bg-[#1e1e1e] p-2 rounded-t-xl mb-4 print:hidden">
      <div className="flex items-center gap-1 flex-wrap">
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={!editor.can().chain().focus().toggleBold().run()}
          className={`p-2 rounded-md transition-colors ${
            editor.isActive("bold") ? "bg-[#333] text-white" : "text-gray-400 hover:bg-[#2d2d2d] hover:text-gray-200"
          }`}
        >
          <Bold className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={!editor.can().chain().focus().toggleItalic().run()}
          className={`p-2 rounded-md transition-colors ${
            editor.isActive("italic") ? "bg-[#333] text-white" : "text-gray-400 hover:bg-[#2d2d2d] hover:text-gray-200"
          }`}
        >
          <Italic className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleStrike().run()}
          disabled={!editor.can().chain().focus().toggleStrike().run()}
          className={`p-2 rounded-md transition-colors ${
            editor.isActive("strike") ? "bg-[#333] text-white" : "text-gray-400 hover:bg-[#2d2d2d] hover:text-gray-200"
          }`}
        >
          <Strikethrough className="w-4 h-4" />
        </button>

        <div className="w-px h-6 bg-[#333333] mx-1"></div>

        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={`p-2 rounded-md transition-colors ${
            editor.isActive("heading", { level: 1 }) ? "bg-[#333] text-white" : "text-gray-400 hover:bg-[#2d2d2d] hover:text-gray-200"
          }`}
        >
          <Heading1 className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`p-2 rounded-md transition-colors ${
            editor.isActive("heading", { level: 2 }) ? "bg-[#333] text-white" : "text-gray-400 hover:bg-[#2d2d2d] hover:text-gray-200"
          }`}
        >
          <Heading2 className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={`p-2 rounded-md transition-colors ${
            editor.isActive("heading", { level: 3 }) ? "bg-[#333] text-white" : "text-gray-400 hover:bg-[#2d2d2d] hover:text-gray-200"
          }`}
        >
          <Heading3 className="w-4 h-4" />
        </button>

        <div className="w-px h-6 bg-[#333333] mx-1"></div>

        <button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`p-2 rounded-md transition-colors ${
            editor.isActive("bulletList") ? "bg-[#333] text-white" : "text-gray-400 hover:bg-[#2d2d2d] hover:text-gray-200"
          }`}
        >
          <List className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`p-2 rounded-md transition-colors ${
            editor.isActive("orderedList") ? "bg-[#333] text-white" : "text-gray-400 hover:bg-[#2d2d2d] hover:text-gray-200"
          }`}
        >
          <ListOrdered className="w-4 h-4" />
        </button>

        <div className="w-px h-6 bg-[#333333] mx-1"></div>

        <button
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().chain().focus().undo().run()}
          className="p-2 rounded-md text-gray-400 hover:bg-[#2d2d2d] hover:text-gray-200 transition-colors disabled:opacity-50"
        >
          <Undo className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().chain().focus().redo().run()}
          className="p-2 rounded-md text-gray-400 hover:bg-[#2d2d2d] hover:text-gray-200 transition-colors disabled:opacity-50"
        >
          <Redo className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onPreview}
          disabled={isPdfBusy}
          className="flex items-center gap-2 px-4 py-1.5 text-sm bg-[#2f2f2f] hover:bg-[#3a3a3a] border border-[#444] rounded-md text-white font-medium shadow-sm transition-colors"
        >
          <Eye className="w-4 h-4" /> {isPdfBusy ? "Working..." : "Preview PDF"}
        </button>
        <button
          onClick={onPrint}
          disabled={isPdfBusy}
          className="flex items-center gap-2 px-4 py-1.5 text-sm bg-[#2f2f2f] hover:bg-[#3a3a3a] border border-[#444] rounded-md text-white font-medium shadow-sm transition-colors"
        >
          <Printer className="w-4 h-4" /> {isPdfBusy ? "Working..." : "Print / Save PDF"}
        </button>
        <button
          onClick={onExport}
          disabled={isPdfBusy}
          className="flex items-center gap-2 px-4 py-1.5 text-sm bg-[#333] hover:bg-[#444] border-none rounded-md text-white font-medium shadow-sm transition-colors"
        >
          <Printer className="w-4 h-4" /> {isPdfBusy ? "Working..." : "Export PDF"}
        </button>
        <button
          onClick={onSave}
          className="tp-accent-btn flex items-center gap-2 px-4 py-1.5 text-sm border-none rounded-md text-white font-medium shadow-sm transition-colors"
        >
          <Save className="w-4 h-4" /> Save Lesson Plan
        </button>
      </div>
    </div>
  );
};

export function Editor() {
  const {
    activeFileContent,
    saveActiveLesson,
    vaultPath,
    draggedMaterial,
    setDraggedMaterial,
    pendingMaterialDrop,
    setPendingMaterialDrop,
    logDebug,
  } = useAppStore();
  const [subject, setSubject] = useState(activeFileContent?.metadata?.subject || "");
  const [plannedForInput, setPlannedForInput] = useState(
    formatIsoToEuropeanDate(activeFileContent?.metadata?.plannedFor),
  );
  const [isPdfBusy, setIsPdfBusy] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [tableContextMenu, setTableContextMenu] = useState<TableContextMenuState | null>(null);
  const [plannedCalendarOpen, setPlannedCalendarOpen] = useState(false);
  const [plannedCalendarMonth, setPlannedCalendarMonth] = useState(new Date());
  const editorSurfaceRef = useRef<HTMLDivElement | null>(null);
  const plannedCalendarRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSubject(activeFileContent?.metadata?.subject || "");
    setPlannedForInput(formatIsoToEuropeanDate(activeFileContent?.metadata?.plannedFor));
    const selectedDate = parseEuropeanDateToDate(
      formatIsoToEuropeanDate(activeFileContent?.metadata?.plannedFor),
    );
    setPlannedCalendarMonth(selectedDate || new Date());
  }, [activeFileContent?.metadata?.subject, activeFileContent?.metadata?.plannedFor]);

  useEffect(() => {
    const closeMenu = () => setTableContextMenu(null);
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setTableContextMenu(null);
      }
    };

    window.addEventListener("click", closeMenu);
    window.addEventListener("keydown", onEscape);

    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", onEscape);
    };
  }, []);

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

  useEffect(() => {
    return () => {
      revokePdfBlobUrl(pdfPreviewUrl);
    };
  }, [pdfPreviewUrl]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "Start typing or add a lesson plan table...",
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      MaterialLink,
    ],
    content: activeFileContent?.content || `<h2>New Lesson Plan</h2>`,
  });

  const insertLessonTable = () => {
    if (!editor) return;

    // We define the column widths: Time (80px), Phase (120px), LTA (350px), Social (100px), Media (150px)
    const colWidths = [80, 120, 350, 100, 150];

    editor
      .chain()
      .focus()
      .insertContent({
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              { type: "tableHeader", attrs: { colwidth: [colWidths[0]] }, content: [{ type: "paragraph", content: [{ type: "text", text: "Time" }] }] },
              { type: "tableHeader", attrs: { colwidth: [colWidths[1]] }, content: [{ type: "paragraph", content: [{ type: "text", text: "Phase" }] }] },
              { type: "tableHeader", attrs: { colwidth: [colWidths[2]] }, content: [{ type: "paragraph", content: [{ type: "text", text: "Learning- / Teaching Arrangement" }] }] },
              { type: "tableHeader", attrs: { colwidth: [colWidths[3]] }, content: [{ type: "paragraph", content: [{ type: "text", text: "Social Form" }] }] },
              { type: "tableHeader", attrs: { colwidth: [colWidths[4]] }, content: [{ type: "paragraph", content: [{ type: "text", text: "Media" }] }] },
            ],
          },
          {
            type: "tableRow",
            content: [
              { type: "tableCell", attrs: { colwidth: [colWidths[0]] }, content: [{ type: "paragraph" }] },
              { type: "tableCell", attrs: { colwidth: [colWidths[1]] }, content: [{ type: "paragraph" }] },
              { type: "tableCell", attrs: { colwidth: [colWidths[2]] }, content: [{ type: "paragraph" }] },
              { type: "tableCell", attrs: { colwidth: [colWidths[3]] }, content: [{ type: "paragraph" }] },
              { type: "tableCell", attrs: { colwidth: [colWidths[4]] }, content: [{ type: "paragraph" }] },
            ],
          },
          {
            type: "tableRow",
            content: [
              { type: "tableCell", attrs: { colwidth: [colWidths[0]] }, content: [{ type: "paragraph" }] },
              { type: "tableCell", attrs: { colwidth: [colWidths[1]] }, content: [{ type: "paragraph" }] },
              { type: "tableCell", attrs: { colwidth: [colWidths[2]] }, content: [{ type: "paragraph" }] },
              { type: "tableCell", attrs: { colwidth: [colWidths[3]] }, content: [{ type: "paragraph" }] },
              { type: "tableCell", attrs: { colwidth: [colWidths[4]] }, content: [{ type: "paragraph" }] },
            ],
          },
        ],
      })
      .run();
  };

  const runTableCommand = useCallback(
    (runner: () => boolean) => {
      if (!editor) return;
      runner();
      setTableContextMenu(null);
    },
    [editor],
  );

  const handleTableContextMenu = useCallback(
    (event: React.MouseEvent) => {
      if (!editor) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (!target || !target.closest("table")) {
        setTableContextMenu(null);
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const pos = editor.view.posAtCoords({ left: event.clientX, top: event.clientY });
      if (pos?.pos !== undefined) {
        editor.chain().focus().setTextSelection(pos.pos).run();
      }

      const estimatedWidth = 220;
      const estimatedHeight = 420;
      const padding = 8;

      const x = Math.max(
        padding,
        Math.min(event.clientX, window.innerWidth - estimatedWidth - padding),
      );
      const y = Math.max(
        padding,
        Math.min(event.clientY, window.innerHeight - estimatedHeight - padding),
      );

      setTableContextMenu({ x, y });
    },
    [editor],
  );

  const handleSave = async () => {
    if (!editor) return;

    const parsedPlannedFor = parseEuropeanDateToIso(plannedForInput);
    if (parsedPlannedFor === undefined) {
      alert("Please enter Planned For date as DD/MM/YYYY.");
      return;
    }

    const json = editor.getJSON();
    await saveActiveLesson(json, {
      subject,
      plannedFor: parsedPlannedFor,
    });
  };

  const handleMaterialDragOver = useCallback(
    (event: React.DragEvent) => {
      if (
        draggedMaterial ||
        event.dataTransfer.types.includes("application/teacherpro-material") ||
        event.dataTransfer.types.includes("application/teacherpro-file") ||
        event.dataTransfer.types.includes("text/plain") ||
        event.dataTransfer.types.includes("text")
      ) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }
    },
    [draggedMaterial],
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
      const pos =
        typeof clientX === "number" && typeof clientY === "number"
          ? editor.view.posAtCoords({ left: clientX, top: clientY })
          : null;

      const targetPos = pos?.pos ?? editor.state.selection.from;
      const resolvedPos = editor.state.doc.resolve(targetPos);
      const isInsideTableCell = (() => {
        for (let depth = resolvedPos.depth; depth > 0; depth -= 1) {
          const nodeName = resolvedPos.node(depth).type.name;
          if (nodeName === "tableCell" || nodeName === "tableHeader") {
            return true;
          }
        }
        return false;
      })();

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

  const handleMaterialDrop = useCallback(
    (event: React.DragEvent) => {
      if (!editor) {
        return;
      }

      const didInsert = insertDroppedMaterial(event.dataTransfer, event.clientX, event.clientY);
      if (!didInsert) {
        logDebug("editor", "drop-react-handler-skip", "insertDroppedMaterial returned false");
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    },
    [editor, insertDroppedMaterial, logDebug],
  );

  useEffect(() => {
    if (!editor) {
      return;
    }

    const dom = editor.view.dom;

    const onNativeDragOver = (event: DragEvent) => {
      if (!event.dataTransfer) return;

      if (
        draggedMaterial ||
        event.dataTransfer.types.includes("application/teacherpro-material") ||
        event.dataTransfer.types.includes("application/teacherpro-file") ||
        event.dataTransfer.types.includes("text/plain") ||
        event.dataTransfer.types.includes("text")
      ) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }
    };

    const onNativeDrop = (event: DragEvent) => {
      if (!event.dataTransfer) return;

      const didInsert = insertDroppedMaterial(event.dataTransfer, event.clientX, event.clientY);
      if (!didInsert) {
        logDebug("editor", "drop-native-handler-skip", "insertDroppedMaterial returned false");
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    };

    dom.addEventListener("dragover", onNativeDragOver);
    dom.addEventListener("drop", onNativeDrop);

    return () => {
      dom.removeEventListener("dragover", onNativeDragOver);
      dom.removeEventListener("drop", onNativeDrop);
    };
  }, [draggedMaterial, editor, insertDroppedMaterial, logDebug]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const onWindowDragOver = (event: DragEvent) => {
      const activeDrag = useAppStore.getState().draggedMaterial;
      if (!activeDrag) {
        return;
      }

      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
    };

    const onWindowDrop = (event: DragEvent) => {
      const activeDrag = useAppStore.getState().draggedMaterial;
      if (!activeDrag) {
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

      const payload =
        (event.dataTransfer && getMaterialDropPayload(event.dataTransfer)) ||
        {
          relativePath: activeDrag.relativePath,
          itemType: activeDrag.isDirectory ? "folder" : "file",
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
  }, [editor, insertMaterialLinkAtSelection, setDraggedMaterial, logDebug]);

  useEffect(() => {
    if (!editor || !pendingMaterialDrop) {
      return;
    }

    const surface = editorSurfaceRef.current;
    if (!surface) {
      setPendingMaterialDrop(null);
      return;
    }

    const { clientX, clientY, relativePath, isDirectory } = pendingMaterialDrop;
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

  const createLessonPdf = async (): Promise<{ pdfBytes: Uint8Array; fileName: string }> => {
    const element = document.getElementById("lesson-plan-export-content");
    if (!element) {
      throw new Error("Could not find lesson content to export.");
    }

    document.body.classList.add("tp-exporting");

    try {
      const normalizedSubject =
        subject.trim().replace(/[^a-zA-Z0-9\-\s_]/g, "").replace(/\s+/g, "-") || "lesson-plan";
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const fileName = `${normalizedSubject}-${stamp}.pdf`;

      const pdfBytes = await renderElementToPdfBytes(element, {
        orientation: "landscape",
        marginMm: 8,
        scale: 2,
        backgroundColor: "#ffffff",
        multiPage: true,
      });

      return { pdfBytes, fileName };
    } finally {
      document.body.classList.remove("tp-exporting");
    }
  };

  const handleExportPDF = async () => {
    if (!vaultPath) {
      alert("Please open a vault before exporting.");
      return;
    }

    setIsPdfBusy(true);

    try {
      const { pdfBytes, fileName } = await createLessonPdf();

      const savedPath = await savePdfToVault({
        pdfBytes,
        fileName,
        vaultPath,
        dialogTitle: "Export Lesson Plan as PDF",
      });

      if (savedPath) {
        alert("Lesson plan exported successfully.");
      }
    } catch (error) {
      console.error("Lesson PDF export failed:", error);
      alert(`Export failed: ${String(error)}`);
    } finally {
      setIsPdfBusy(false);
    }
  };

  const handlePreviewPDF = async () => {
    setIsPdfBusy(true);

    try {
      const { pdfBytes } = await createLessonPdf();
      const nextUrl = createPdfBlobUrl(pdfBytes);
      setPdfPreviewUrl((previous) => {
        revokePdfBlobUrl(previous);
        return nextUrl;
      });
    } catch (error) {
      console.error("Lesson PDF preview failed:", error);
      alert(`Preview failed: ${String(error)}`);
    } finally {
      setIsPdfBusy(false);
    }
  };

  const handlePrintPDF = async () => {
    setIsPdfBusy(true);

    try {
      setTableContextMenu(null);
      setPlannedCalendarOpen(false);
      await printCurrentWindow(["tp-exporting"]);
    } catch (error) {
      console.error("Lesson PDF print failed:", error);
      alert(`Print failed: ${String(error)}`);
    } finally {
      setIsPdfBusy(false);
    }
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return "Not set";
    return new Date(isoString).toLocaleDateString("en-GB", {
      weekday: "short", year: "numeric", month: "short", day: "numeric"
    });
  };

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

  return (
    <div className="tp-editor-page w-full max-w-none mx-auto print:max-w-none print:w-full">
      <div className="mb-4 flex gap-2 print:hidden">
        <button
          onClick={insertLessonTable}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-[#222] hover:bg-[#2d2d2d] border border-[#333] rounded-md text-white font-medium shadow-sm transition-colors"
        >
          <TableIcon className="w-4 h-4" /> Insert Lesson Table
        </button>
      </div>
      
      <div id="lesson-plan-container" className="tp-editor-surface bg-[#181818] rounded-xl shadow-sm border border-[#2a2a2a] min-h-[70vh] flex flex-col w-full print:bg-white print:border-none print:shadow-none print:min-h-0">
        <MenuBar
          editor={editor}
          onSave={handleSave}
          onPreview={handlePreviewPDF}
          onPrint={handlePrintPDF}
          onExport={handleExportPDF}
          isPdfBusy={isPdfBusy}
        />
        <div id="lesson-plan-export-content" className="flex-1 lesson-export-surface">
          {activeFileContent?.metadata && (
            <div className="px-8 pb-6 border-b border-[#2a2a2a] print:border-b-2 print:border-gray-300 mb-6 lesson-export-meta">
              <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-4 gap-y-4 gap-x-6 text-sm text-gray-400 print:text-black">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold text-gray-300 print:text-black min-w-[90px] lesson-export-label">Teacher:</span>
                  <span className="print:text-black lesson-export-value">{activeFileContent.metadata.teacher}</span>
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold text-gray-300 print:text-black min-w-[90px] lesson-export-label">Created:</span>
                  <span className="print:text-black lesson-export-value">{formatDate(activeFileContent.metadata.createdAt)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <span className="font-semibold text-gray-300 print:text-black min-w-[90px] lesson-export-label">Planned For:</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={plannedForInput}
                    onChange={(event) => setPlannedForInput(event.target.value)}
                    placeholder="DD/MM/YYYY"
                    className="w-[220px] max-w-full bg-[#222] border border-[#333] rounded-lg px-3 py-2 text-white text-base outline-none focus:border-[var(--tp-accent)] print:bg-transparent print:border-none print:p-0 print:text-black lesson-export-input lesson-export-planned-input"
                  />
                  <div className="relative lesson-export-calendar-trigger" ref={plannedCalendarRef}>
                    <button
                      type="button"
                      onClick={() => {
                        if (!plannedCalendarOpen) {
                          setPlannedCalendarMonth(selectedPlannedDate || new Date());
                        }
                        setPlannedCalendarOpen((previous) => !previous);
                      }}
                      className="h-10 w-10 inline-flex items-center justify-center rounded-md border border-[#333] bg-[#222] text-gray-300 hover:text-white hover:border-[var(--tp-accent)] transition-colors print:hidden"
                      title="Pick planned date"
                    >
                      <CalendarDays className="w-4 h-4" />
                    </button>

                    {plannedCalendarOpen && (
                      <div className="absolute top-12 left-0 z-[72] w-[250px] rounded-lg border border-[#333] bg-[#1b1b1b] p-3 shadow-2xl print:hidden lesson-export-calendar-popover">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-sm font-semibold text-gray-200">
                            {formatDateFn(plannedCalendarMonth, "MMM yyyy")}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setPlannedCalendarMonth((prev) => subMonths(prev, 1))}
                              className="p-1 rounded text-gray-400 hover:text-gray-100 hover:bg-[#2b2b2b]"
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setPlannedCalendarMonth((prev) => addMonths(prev, 1))}
                              className="p-1 rounded text-gray-400 hover:text-gray-100 hover:bg-[#2b2b2b]"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] text-gray-500">
                          {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((day) => (
                            <span key={day}>{day}</span>
                          ))}
                        </div>

                        <div className="grid grid-cols-7 gap-1 text-xs">
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
                                className={`h-7 rounded text-center transition-colors ${
                                  inCurrentMonth
                                    ? "text-gray-200 hover:bg-[#2d2d2d]"
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
                  <span className="hidden print:text-black lesson-export-value lesson-export-planned-text">
                    {plannedForInput.trim() || "Not set"}
                  </span>
                </div>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold text-gray-300 print:text-black min-w-[90px] lesson-export-label">Subject:</span>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g. Mathematics"
                    className="flex-1 min-w-[180px] bg-[#222] border border-[#333] rounded px-2 py-1.5 text-white text-sm outline-none focus:border-[var(--tp-accent)] print:bg-transparent print:border-none print:p-0 print:text-black lesson-export-input"
                  />
                  <span className="hidden lesson-export-value lesson-export-subject-text">{subject.trim() || "Not set"}</span>
                </div>
              </div>
            </div>
          )}

          <div
            ref={editorSurfaceRef}
            className="px-8 pb-8 flex-1 print:p-0 lesson-export-editor"
            onDragOver={handleMaterialDragOver}
            onDrop={handleMaterialDrop}
            onContextMenu={handleTableContextMenu}
          >
            <EditorContent editor={editor} className="h-full" />
          </div>

          {tableContextMenu && (
            <div
              className="fixed z-[70] min-w-[220px] rounded-md border border-[#3a3a3a] bg-[#1f1f1f] p-1 shadow-xl print:hidden"
              style={{ top: tableContextMenu.y, left: tableContextMenu.x }}
              onClick={(event) => event.stopPropagation()}
            >
              <button
                onClick={() => runTableCommand(() => editor!.chain().focus().addRowBefore().run())}
                disabled={!tableActionsEnabled.addRowBefore}
                className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-[#2d2d2d] rounded disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Insert Row Above
              </button>
              <button
                onClick={() => runTableCommand(() => editor!.chain().focus().addRowAfter().run())}
                disabled={!tableActionsEnabled.addRowAfter}
                className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-[#2d2d2d] rounded disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Insert Row Below
              </button>
              <button
                onClick={() => runTableCommand(() => editor!.chain().focus().addColumnBefore().run())}
                disabled={!tableActionsEnabled.addColumnBefore}
                className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-[#2d2d2d] rounded disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Insert Column Left
              </button>
              <button
                onClick={() => runTableCommand(() => editor!.chain().focus().addColumnAfter().run())}
                disabled={!tableActionsEnabled.addColumnAfter}
                className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-[#2d2d2d] rounded disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Insert Column Right
              </button>

              <div className="h-px bg-[#333] my-1" />

              <button
                onClick={() => runTableCommand(() => editor!.chain().focus().deleteRow().run())}
                disabled={!tableActionsEnabled.deleteRow}
                className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-[#2d2d2d] rounded disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Delete Row
              </button>
              <button
                onClick={() => runTableCommand(() => editor!.chain().focus().deleteColumn().run())}
                disabled={!tableActionsEnabled.deleteColumn}
                className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-[#2d2d2d] rounded disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Delete Column
              </button>
              <button
                onClick={() => runTableCommand(() => editor!.chain().focus().deleteTable().run())}
                disabled={!tableActionsEnabled.deleteTable}
                className="w-full text-left px-3 py-2 text-sm text-red-300 hover:bg-[#2d2d2d] rounded disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Delete Table
              </button>

              <div className="h-px bg-[#333] my-1" />

              <button
                onClick={() => runTableCommand(() => editor!.chain().focus().mergeCells().run())}
                disabled={!tableActionsEnabled.mergeCells}
                className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-[#2d2d2d] rounded disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Merge Selected Cells
              </button>
              <button
                onClick={() => runTableCommand(() => editor!.chain().focus().splitCell().run())}
                disabled={!tableActionsEnabled.splitCell}
                className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-[#2d2d2d] rounded disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Split Cell
              </button>
              <button
                onClick={() => runTableCommand(() => editor!.chain().focus().toggleHeaderRow().run())}
                disabled={!tableActionsEnabled.toggleHeaderRow}
                className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-[#2d2d2d] rounded disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Toggle Header Row
              </button>
              <button
                onClick={() => runTableCommand(() => editor!.chain().focus().toggleHeaderColumn().run())}
                disabled={!tableActionsEnabled.toggleHeaderColumn}
                className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-[#2d2d2d] rounded disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Toggle Header Column
              </button>
            </div>
          )}

          {pdfPreviewUrl && (
            <div
              className="fixed inset-0 z-[78] bg-black/65 p-6 flex items-center justify-center print:hidden"
              onClick={() => setPdfPreviewUrl(null)}
            >
              <div
                className="w-full max-w-6xl h-[88vh] bg-[#161616] border border-[#333] rounded-xl shadow-2xl overflow-hidden"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="h-12 border-b border-[#333] px-4 flex items-center justify-between">
                  <div className="text-sm text-gray-200 font-medium">Lesson Plan PDF Preview</div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handlePrintPDF}
                      className="px-3 py-1.5 text-xs rounded-md border border-[#444] bg-[#252525] text-gray-200 hover:bg-[#303030]"
                    >
                      Print / Save PDF
                    </button>
                    <button
                      onClick={() => setPdfPreviewUrl(null)}
                      className="p-1 rounded text-gray-400 hover:text-gray-200 hover:bg-[#232323]"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <iframe src={pdfPreviewUrl} title="Lesson Plan PDF Preview" className="w-full h-[calc(88vh-48px)] bg-white" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
