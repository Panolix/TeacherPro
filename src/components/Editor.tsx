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
import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { useAppStore } from "../store";
import { useCallback, useEffect, useRef, useState } from "react";
import { doesAiModelSupportThinking, getAiModelRuntimeDefaults } from "../ai/modelCatalog";
import { MaterialLink } from "./extensions/MaterialLink";
import { TextStyle } from "@tiptap/extension-text-style";
import { FontSize } from "./extensions/FontSize";
import { UnderlineColor } from "./extensions/UnderlineColor";
import {
  createPdfBlobUrl,
  printCurrentWindow,
  printPdfBlobUrl,
  renderElementToPdfBytes,
  revokePdfBlobUrl,
  savePdfToVault,
} from "../utils/pdfExport";
import { buildContextMenuClassName, clampContextMenuPosition } from "../utils/contextMenu";
import { type as osType } from "@tauri-apps/plugin-os";
import {
  Bold,
  Italic,
  Strikethrough,
  Underline,
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
  Download,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Eye,
  Sparkles,
  Languages,
  MessageSquare,
  Send,
  X,
  Brain,
  Trash2,
  FileText,
  BookOpen,
} from "lucide-react";

interface MaterialDropPayload {
  relativePath: string;
  itemType: "file" | "folder";
}

type MethodBankType = "phase" | "socialForm" | "method";

interface MethodBankItem {
  id: string;
  type: MethodBankType;
  title: string;
  summary: string;
  description: string;
  duration: string;
  tags: string[];
}

interface MethodDropPayload {
  id: string;
  type: MethodBankType;
  title: string;
  summary: string;
  duration: string;
}

interface SlashMenuState {
  query: string;
  from: number;
  to: number;
  x: number;
  y: number;
  requiredType: MethodBankType;
  selectedIndex: number;
}

const METHOD_TYPE_LABELS: Record<MethodBankType, string> = {
  phase: "Phase",
  socialForm: "Social Form",
  method: "Method",
};

const METHOD_TYPE_ACCENT: Record<MethodBankType, string> = {
  phase: "text-cyan-300",
  socialForm: "text-emerald-300",
  method: "text-amber-300",
};

interface TableContextMenuState {
  x: number;
  y: number;
  showTableActions: boolean;
  aiSelection: SelectedTextRange | null;
}

interface SelectedTextRange {
  from: number;
  to: number;
  selectedText: string;
}

interface AiChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  thinking?: string;
  timestamp: number;
}

/**
 * Split a raw model response into thinking content and actual response.
 * The thinking content comes from <think>...</think> blocks.
 */
function parseThinkingFromResponse(raw: string): { thinking: string | null; response: string } {
  const thinkMatch = raw.match(/<think>([\s\S]*?)<\/think>/i);
  const thinking = thinkMatch ? thinkMatch[1].trim() : null;
  const response = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  return { thinking, response };
}







function AiMarkdown({ text }: { text: string }) {
  // Render inline spans: **bold**, *italic*, `code`
  function renderInline(line: string, baseKey: string): React.ReactNode[] {
    const tokens: React.ReactNode[] = [];
    const pattern = /(\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`)/g;
    let last = 0;
    let match: RegExpExecArray | null;
    let k = 0;
    while ((match = pattern.exec(line)) !== null) {
      if (match.index > last) tokens.push(line.slice(last, match.index));
      if (match[2] !== undefined)
        tokens.push(<strong key={`${baseKey}-b${k++}`}>{match[2]}</strong>);
      else if (match[3] !== undefined)
        tokens.push(<em key={`${baseKey}-i${k++}`}>{match[3]}</em>);
      else if (match[4] !== undefined)
        tokens.push(
          <code key={`${baseKey}-c${k++}`} className="rounded bg-black/20 px-1 font-mono text-[11px]">
            {match[4]}
          </code>,
        );
      last = match.index + match[0].length;
    }
    if (last < line.length) tokens.push(line.slice(last));
    return tokens;
  }

  // Group lines into block-level nodes
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();

    // Blank line — skip, acts as paragraph separator
    if (!trimmed) { i++; continue; }

    // Heading  # / ## / ###
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const cls = level === 1
        ? "font-bold text-[14px] mt-2 mb-0.5 text-[var(--tp-text-primary)]"
        : level === 2
          ? "font-semibold text-[13px] mt-1.5 mb-0.5 text-[var(--tp-text-primary)]"
          : "font-semibold text-[12px] mt-1 text-[var(--tp-text-primary)]";
      blocks.push(<div key={i} className={cls}>{renderInline(headingMatch[2], String(i))}</div>);
      i++; continue;
    }

    // Bullet list — collect consecutive bullet lines
    if (/^[-*+]\s+/.test(trimmed)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^[-*+]\s+/, "");
        items.push(
          <li key={i} className="ml-4 list-disc">
            {renderInline(itemText, String(i))}
          </li>,
        );
        i++;
      }
      blocks.push(<ul key={`ul-${i}`} className="my-0.5 space-y-0.5">{items}</ul>);
      continue;
    }

    // Numbered list — collect consecutive numbered lines
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^\d+\.\s+/, "");
        items.push(
          <li key={i} className="ml-4 list-decimal">
            {renderInline(itemText, String(i))}
          </li>,
        );
        i++;
      }
      blocks.push(<ol key={`ol-${i}`} className="my-0.5 space-y-0.5">{items}</ol>);
      continue;
    }

    // Regular paragraph
    blocks.push(
      <p key={i} className="leading-relaxed">
        {renderInline(trimmed, String(i))}
      </p>,
    );
    i++;
  }

  return <div className="space-y-1 text-[13px]">{blocks}</div>;
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

function normalizeMethodBankItem(raw: unknown): MethodBankItem | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as Partial<MethodBankItem>;
  const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
  const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
  const summary = typeof candidate.summary === "string" ? candidate.summary.trim() : "";
  const description = typeof candidate.description === "string" ? candidate.description.trim() : "";
  const duration = typeof candidate.duration === "string" ? candidate.duration.trim() : "";
  const type =
    candidate.type === "phase" || candidate.type === "socialForm" || candidate.type === "method"
      ? candidate.type
      : null;

  if (!id || !title || !summary || !description || !duration || !type) {
    return null;
  }

  const tags = Array.isArray(candidate.tags)
    ? candidate.tags
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim())
        .filter(Boolean)
    : [];

  return {
    id,
    type,
    title,
    summary,
    description,
    duration,
    tags,
  };
}

function parseMethodBankSeed(raw: unknown): MethodBankItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const parsed: MethodBankItem[] = [];
  for (const entry of raw) {
    const normalized = normalizeMethodBankItem(entry);
    if (normalized) {
      parsed.push(normalized);
    }
  }

  return parsed;
}

function getMethodDropPayload(dataTransfer: DataTransfer): MethodDropPayload | null {
  const structuredPayload = dataTransfer.getData("application/teacherpro-method");
  if (!structuredPayload) {
    return null;
  }

  try {
    const parsed = JSON.parse(structuredPayload) as Partial<MethodDropPayload>;
    if (
      typeof parsed.id !== "string" ||
      typeof parsed.type !== "string" ||
      typeof parsed.title !== "string" ||
      typeof parsed.summary !== "string" ||
      typeof parsed.duration !== "string"
    ) {
      return null;
    }

    if (parsed.type !== "phase" && parsed.type !== "socialForm" && parsed.type !== "method") {
      return null;
    }

    return {
      id: parsed.id,
      type: parsed.type,
      title: parsed.title,
      summary: parsed.summary,
      duration: parsed.duration,
    };
  } catch {
    return null;
  }
}

function hasMethodDropData(dataTransfer: DataTransfer): boolean {
  return hasTransferType(dataTransfer, "application/teacherpro-method");
}

function hasTransferType(dataTransfer: DataTransfer, type: string): boolean {
  return Array.from(dataTransfer.types || []).includes(type);
}

function hasMaterialDropData(dataTransfer: DataTransfer): boolean {
  if (hasMethodDropData(dataTransfer)) {
    return false;
  }

  return (
    hasTransferType(dataTransfer, "application/teacherpro-material") ||
    hasTransferType(dataTransfer, "application/teacherpro-file")
  );
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

function normalizeColorForPicker(colorValue: unknown, fallback: string): string {
  if (typeof colorValue !== "string") {
    return fallback;
  }

  const trimmed = colorValue.trim();
  const shortHex = trimmed.match(/^#([0-9a-fA-F]{3})$/);
  if (shortHex) {
    const [r, g, b] = shortHex[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }

  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  const rgbMatch = trimmed.match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[0-9.]+)?\s*\)$/i,
  );
  if (rgbMatch) {
    const rgb = rgbMatch
      .slice(1, 4)
      .map((chunk) => Math.max(0, Math.min(255, Number(chunk))));
    return `#${rgb.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
  }

  return fallback;
}

function normalizeAiFragmentOutput(rawOutput: string, originalSelection: string): string {
  let normalized = rawOutput.trim();

  // Strip <think>...</think> blocks emitted by reasoning models.
  normalized = normalized.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  // Drop wrapping code fences if the model emits markdown blocks.
  if (normalized.startsWith("```")) {
    normalized = normalized.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim();
  }

  normalized = normalized.replace(/\r\n/g, "\n").trim();

  const originalHadLineBreaks = originalSelection.includes("\n");
  if (!originalHadLineBreaks) {
    // Keep single-line fragments single-line.
    normalized = normalized.replace(/\s+/g, " ").trim();
  }

  const originalHasLists = /(^\s*[-*]\s+)|(^\s*\d+\.\s+)/m.test(originalSelection);
  if (!originalHasLists) {
    normalized = normalized
      .replace(/^\s*[-*]\s+/gm, "")
      .replace(/^\s*\d+\.\s+/gm, "")
      .trim();
  }

  return normalized;
}

const MenuBar = ({
  editor,
  onSave,
  onPreview,
  onPrint,
  onExport,
  onToggleChat,
  onToggleNotes,
  onToggleMethodBank,
  chatOpen,
  notesOpen,
  methodBankOpen,
  isPdfBusy,
  showActionButtonLabels,
  aiEnabled,
}: {
  editor: any;
  onSave: () => void;
  onPreview: () => void;
  onPrint: () => void;
  onExport: () => void;
  onToggleChat: () => void;
  onToggleNotes: () => void;
  onToggleMethodBank: () => void;
  chatOpen: boolean;
  notesOpen: boolean;
  methodBankOpen: boolean;
  isPdfBusy: boolean;
  showActionButtonLabels: boolean;
  aiEnabled: boolean;
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

  const FONT_SIZES = ["8pt", "10pt", "11pt", "12pt", "14pt", "16pt", "18pt", "24pt"];
  const currentFontSize = editor.getAttributes("textStyle").fontSize || "12pt";
  const isLightTheme =
    typeof document !== "undefined" &&
    document.documentElement.getAttribute("data-tp-lesson-paper") === "light";
  const defaultTextColor = isLightTheme ? "#111827" : "#f8f8f8";
  const currentTextColor = normalizeColorForPicker(
    editor.getAttributes("textStyle").color,
    defaultTextColor,
  );
  const currentUnderlineColor = normalizeColorForPicker(
    editor.getAttributes("textStyle").underlineColor,
    currentTextColor,
  );
  const currentHighlightColor = normalizeColorForPicker(
    editor.getAttributes("highlight").color,
    "#fef08a",
  );

  return (
    <div className="tp-editor-toolbar border-b border-[#333333] bg-[#1e1e1e] p-2 rounded-t-xl print:hidden">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
        <select
          value={currentFontSize}
          onChange={(e) => editor.chain().focus().setFontSize(e.target.value).run()}
          className="bg-[#2d2d2d] text-gray-200 border border-[#444] rounded px-2 py-1 text-sm outline-none focus:border-[var(--tp-accent)] cursor-pointer"
        >
          {FONT_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        
        <div className="w-px h-6 bg-[#333333] mx-1"></div>

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
        <button
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          disabled={!editor.can().chain().focus().toggleUnderline().run()}
          className={`p-2 rounded-md transition-colors ${
            editor.isActive("underline") ? "bg-[#333] text-white" : "text-gray-400 hover:bg-[#2d2d2d] hover:text-gray-200"
          }`}
        >
          <Underline className="w-4 h-4" />
        </button>

        <div className="w-px h-6 bg-[#333333] mx-1"></div>

        <div className="flex items-center gap-1 rounded-md border border-[#3a3a3a] bg-[#242424] px-1 py-1">
          <label
            className="inline-flex items-center justify-center h-7 w-7 rounded hover:bg-[#303030] cursor-pointer"
            title="Text Color"
          >
            <span className="text-[11px] text-gray-200 font-semibold">A</span>
            <input
              type="color"
              value={currentTextColor}
              onChange={(event) => editor.chain().focus().setColor(event.target.value).run()}
              className="absolute opacity-0 pointer-events-none"
            />
          </label>
          <button
            onClick={() => editor.chain().focus().unsetColor().run()}
            className="h-7 px-2 rounded text-[11px] text-gray-300 hover:bg-[#303030]"
            title="Reset Text Color"
          >
            A-
          </button>
          <label
            className="inline-flex items-center justify-center h-7 w-7 rounded hover:bg-[#303030] cursor-pointer"
            title="Underline Color"
          >
            <span className="text-[11px] text-gray-200 font-semibold">U</span>
            <input
              type="color"
              value={currentUnderlineColor}
              onChange={(event) => {
                const chain = editor.chain().focus();
                if (!editor.isActive("underline")) {
                  chain.toggleUnderline();
                }
                chain.setMark("textStyle", { underlineColor: event.target.value }).run();
              }}
              className="absolute opacity-0 pointer-events-none"
            />
          </label>
          <button
            onClick={() =>
              editor
                .chain()
                .focus()
                .setMark("textStyle", { underlineColor: null })
                .removeEmptyTextStyle()
                .run()
            }
            className="h-7 px-2 rounded text-[11px] text-gray-300 hover:bg-[#303030]"
            title="Reset Underline Color"
          >
            U-
          </button>
          <label
            className="inline-flex items-center justify-center h-7 w-7 rounded hover:bg-[#303030] cursor-pointer"
            title="Highlight Color"
          >
            <span className="text-[11px] text-gray-200 font-semibold">H</span>
            <input
              type="color"
              value={currentHighlightColor}
              onChange={(event) =>
                editor.chain().focus().setHighlight({ color: event.target.value }).run()
              }
              className="absolute opacity-0 pointer-events-none"
            />
          </label>
          <button
            onClick={() => editor.chain().focus().unsetHighlight().run()}
            className="h-7 px-2 rounded text-[11px] text-gray-300 hover:bg-[#303030]"
            title="Clear Highlight"
          >
            H-
          </button>
        </div>

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
        <div className="flex items-center gap-2 flex-wrap justify-end">
        {aiEnabled && (
          <button
            onClick={onToggleChat}
            title={chatOpen ? "Hide AI Chat" : "Open AI Chat"}
            aria-pressed={chatOpen}
            className={`h-9 min-w-9 inline-flex items-center justify-center gap-2 px-2.5 py-1.5 text-sm border rounded-md text-white font-medium shadow-sm transition-colors ${
              chatOpen
                ? "bg-[var(--tp-accent)] border-[var(--tp-accent)]"
                : "bg-[#2f2f2f] hover:bg-[#3a3a3a] border-[#444]"
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            {showActionButtonLabels && <span>AI Chat</span>}
          </button>
        )}
        <button
          onClick={onToggleNotes}
          title={notesOpen ? "Hide Notes" : "Open Notes"}
          aria-pressed={notesOpen}
          className={`h-9 min-w-9 inline-flex items-center justify-center gap-2 px-2.5 py-1.5 text-sm border rounded-md text-white font-medium shadow-sm transition-colors ${
            notesOpen
              ? "bg-[var(--tp-accent)] border-[var(--tp-accent)]"
              : "bg-[#2f2f2f] hover:bg-[#3a3a3a] border-[#444]"
          }`}
        >
          <FileText className="w-4 h-4" />
          {showActionButtonLabels && <span>Notes</span>}
        </button>
        <button
          onClick={onToggleMethodBank}
          title={methodBankOpen ? "Hide Method Bank" : "Open Method Bank"}
          aria-pressed={methodBankOpen}
          className={`h-9 min-w-9 inline-flex items-center justify-center gap-2 px-2.5 py-1.5 text-sm border rounded-md text-white font-medium shadow-sm transition-colors ${
            methodBankOpen
              ? "bg-[var(--tp-accent)] border-[var(--tp-accent)]"
              : "bg-[#2f2f2f] hover:bg-[#3a3a3a] border-[#444]"
          }`}
        >
          <BookOpen className="w-4 h-4" />
          {showActionButtonLabels && <span>Method Bank</span>}
        </button>
        <button
          onClick={onPreview}
          title={isPdfBusy ? "Preview PDF (busy)" : "Preview PDF"}
          disabled={isPdfBusy}
          className="h-9 min-w-9 inline-flex items-center justify-center gap-2 px-2.5 py-1.5 text-sm bg-[#2f2f2f] hover:bg-[#3a3a3a] border border-[#444] rounded-md text-white font-medium shadow-sm transition-colors disabled:opacity-60"
        >
          <Eye className="w-4 h-4" />
          {showActionButtonLabels && <span>{isPdfBusy ? "Working..." : "Preview"}</span>}
        </button>
        <button
          onClick={onPrint}
          title={isPdfBusy ? "Print or Save PDF (busy)" : "Print or Save PDF"}
          disabled={isPdfBusy}
          className="h-9 min-w-9 inline-flex items-center justify-center gap-2 px-2.5 py-1.5 text-sm bg-[#2f2f2f] hover:bg-[#3a3a3a] border border-[#444] rounded-md text-white font-medium shadow-sm transition-colors disabled:opacity-60"
        >
          <Printer className="w-4 h-4" />
          {showActionButtonLabels && <span>{isPdfBusy ? "Working..." : "Print"}</span>}
        </button>
        <button
          onClick={onExport}
          title={isPdfBusy ? "Export PDF (busy)" : "Export PDF"}
          disabled={isPdfBusy}
          className="h-9 min-w-9 inline-flex items-center justify-center gap-2 px-2.5 py-1.5 text-sm bg-[#333] hover:bg-[#444] border-none rounded-md text-white font-medium shadow-sm transition-colors disabled:opacity-60"
        >
          <Download className="w-4 h-4" />
          {showActionButtonLabels && <span>{isPdfBusy ? "Working..." : "Export"}</span>}
        </button>
        <button
          onClick={onSave}
          title="Save Lesson Plan"
          className="tp-accent-btn h-9 min-w-9 inline-flex items-center justify-center gap-2 px-2.5 py-1.5 text-sm border-none rounded-md text-white font-medium shadow-sm transition-colors"
        >
          <Save className="w-4 h-4" />
          {showActionButtonLabels && <span>Save</span>}
        </button>
        </div>
      </div>
    </div>
  );
};

export function Editor() {
  const {
    activeFileContent,
    activeFilePath,
    saveActiveLesson,
    vaultPath,
    draggedMaterial,
    setDraggedMaterial,
    pendingMaterialDrop,
    setPendingMaterialDrop,
    logDebug,
    showActionButtonLabels,
    subjects,
    aiEnabled,
    aiDefaultModelId,
    aiRewriteTranslateModelId,
    aiChatHistoryLimit,
    aiTemperature,
    aiSystemPrompt,
    aiThinkingEnabled,
    setAiThinkingEnabled,
    aiPersistChats,
    aiTranslateTargetLanguage,
    defaultLessonTableBodyRows,
    setSidebarOpen,
  } = useAppStore();
  const [subject, setSubject] = useState(activeFileContent?.metadata?.subject || "");
  const [teacher, setTeacher] = useState(activeFileContent?.metadata?.teacher || "");
  const [lessonNotes, setLessonNotes] = useState(activeFileContent?.notes || "");
  const [plannedForInput, setPlannedForInput] = useState(
    formatIsoToEuropeanDate(activeFileContent?.metadata?.plannedFor),
  );
  const [isPdfBusy, setIsPdfBusy] = useState(false);
  const [isAiBusy, setIsAiBusy] = useState(false);
  const [aiStatusMessage, setAiStatusMessage] = useState<string | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [tableContextMenu, setTableContextMenu] = useState<TableContextMenuState | null>(null);
  const [rewriteSubmenuOpen, setRewriteSubmenuOpen] = useState(false);
  const [translateSubmenuOpen, setTranslateSubmenuOpen] = useState(false);
  const [plannedCalendarOpen, setPlannedCalendarOpen] = useState(false);
  const [plannedCalendarMonth, setPlannedCalendarMonth] = useState(new Date());
  const [editorRevision, setEditorRevision] = useState(0);
  const [notesOpen, setNotesOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [methodBankOpen, setMethodBankOpen] = useState(false);
  const [methodBankItems, setMethodBankItems] = useState<MethodBankItem[]>([]);
  const [methodBankLoading, setMethodBankLoading] = useState(true);
  const [methodBankError, setMethodBankError] = useState<string | null>(null);
  const [methodBankSearch, setMethodBankSearch] = useState("");
  const [methodBankTypeFilter, setMethodBankTypeFilter] = useState<MethodBankType | null>(null);
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null);
  const [draggedMethod, setDraggedMethod] = useState<MethodDropPayload | null>(null);
  const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null);
  const [, setIsEditorDropActive] = useState(false);
  const [expandedThinking, setExpandedThinking] = useState<Set<string>>(new Set());
  const modelSupportsThinking = doesAiModelSupportThinking(aiDefaultModelId);
  const lessonEditorDragDropEnabled = false;

  // Auto-close chat when AI is turned off in settings.
  useEffect(() => {
    if (!aiEnabled) {
      setChatOpen(false);
    }
  }, [aiEnabled]);

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

  const [chatInput, setChatInput] = useState("");
  const [isChatBusy, setIsChatBusy] = useState(false);
  const [chatMessages, setChatMessages] = useState<AiChatMessage[]>([]);
  const editorSurfaceRef = useRef<HTMLDivElement | null>(null);
  const plannedCalendarRef = useRef<HTMLDivElement | null>(null);
  const pdfPreviewRef = useRef<HTMLDivElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const lastSavedSnapshotRef = useRef<string>("");
  // Per-lesson chat cache for session-level persistence.
  const chatStoreRef = useRef<Record<string, AiChatMessage[]>>({});
  const prevFilePathRef = useRef<string | null>(null);

  // Save/restore chat messages when the active lesson changes.
  useEffect(() => {
    const prevPath = prevFilePathRef.current;
    const nextPath = activeFilePath;

    if (prevPath !== nextPath) {
      // Save current messages for the lesson we're leaving.
      if (prevPath && aiPersistChats) {
        chatStoreRef.current[prevPath] = chatMessages;
      }
      // Restore or clear messages for the new lesson.
      if (nextPath && aiPersistChats && chatStoreRef.current[nextPath]) {
        setChatMessages(chatStoreRef.current[nextPath]);
      } else {
        setChatMessages([]);
      }
      prevFilePathRef.current = nextPath;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFilePath, aiPersistChats]);

  useEffect(() => {
    let isCancelled = false;

    const loadMethodBank = async () => {
      setMethodBankLoading(true);
      setMethodBankError(null);

      try {
        const response = await fetch("/method-bank.json", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const parsed = parseMethodBankSeed(await response.json());
        if (!isCancelled) {
          setMethodBankItems(parsed);
          setSelectedMethodId((previous) => previous ?? parsed[0]?.id ?? null);
        }
      } catch (error) {
        if (!isCancelled) {
          setMethodBankItems([]);
          setMethodBankError(`Could not load Method Bank: ${String(error)}`);
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
  }, []);

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
      setRewriteSubmenuOpen(false);
      setTranslateSubmenuOpen(false);
      setSlashMenu(null);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setTableContextMenu(null);
        setRewriteSubmenuOpen(false);
        setTranslateSubmenuOpen(false);
        setSlashMenu(null);
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

  useEffect(() => {
    if (!pdfPreviewUrl) {
      return;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPdfPreviewUrl(null);
      }
    };

    window.addEventListener("keydown", closeOnEscape, true);
    requestAnimationFrame(() => {
      pdfPreviewRef.current?.focus();
    });

    return () => {
      window.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [pdfPreviewUrl]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      UnderlineExtension,
      TextStyle,
      Color.configure({
        types: ["textStyle"],
      }),
      Highlight.configure({
        multicolor: true,
      }),
      FontSize,
      UnderlineColor,
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

  useEffect(() => {
    if (!editor || !activeFileContent) {
      return;
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
  }, [editor, activeFilePath]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const handleContentUpdate = () => {
      setEditorRevision((previous) => previous + 1);
    };

    editor.on("update", handleContentUpdate);

    return () => {
      editor.off("update", handleContentUpdate);
    };
  }, [editor]);

  useEffect(() => {
    if (!editor || !activeFilePath || !activeFileContent) {
      return;
    }

    lastSavedSnapshotRef.current = JSON.stringify({
      content: activeFileContent.content,
      teacher: activeFileContent.metadata.teacher || "",
      subject: activeFileContent.metadata.subject || "",
      plannedFor: activeFileContent.metadata.plannedFor || null,
      notes: activeFileContent.notes || "",
    });
  }, [editor, activeFilePath, activeFileContent]);

  useEffect(() => {
    if (!editor || !activeFilePath) {
      return;
    }

    const autosaveTimer = window.setTimeout(async () => {
      const parsedPlannedFor = parseEuropeanDateToIso(plannedForInput);
      if (parsedPlannedFor === undefined) {
        return;
      }

      const json = editor.getJSON();
      const nextSnapshot = JSON.stringify({
        content: json,
        teacher,
        subject,
        plannedFor: parsedPlannedFor,
        notes: lessonNotes,
      });

      if (nextSnapshot === lastSavedSnapshotRef.current) {
        return;
      }

      try {
        await saveActiveLesson(json, {
          teacher,
          subject,
          plannedFor: parsedPlannedFor,
        }, lessonNotes);
        lastSavedSnapshotRef.current = nextSnapshot;
      } catch (error) {
        console.error("Autosave failed:", error);
      }
    }, 1800);

    return () => {
      window.clearTimeout(autosaveTimer);
    };
  }, [editor, activeFilePath, editorRevision, teacher, subject, plannedForInput, lessonNotes, saveActiveLesson]);

  const insertLessonTable = () => {
    if (!editor) return;

    // We define the column widths: Time (80px), Phase (120px), LTA (350px), Social (100px), Media (150px)
    const colWidths = [80, 120, 350, 100, 150];
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
              { type: "tableHeader", attrs: { colwidth: [colWidths[0]] }, content: [{ type: "paragraph", content: [{ type: "text", text: "Time" }] }] },
              { type: "tableHeader", attrs: { colwidth: [colWidths[1]] }, content: [{ type: "paragraph", content: [{ type: "text", text: "Phase" }] }] },
              { type: "tableHeader", attrs: { colwidth: [colWidths[2]] }, content: [{ type: "paragraph", content: [{ type: "text", text: "Learning- / Teaching Arrangement" }] }] },
              { type: "tableHeader", attrs: { colwidth: [colWidths[3]] }, content: [{ type: "paragraph", content: [{ type: "text", text: "Social Form" }] }] },
              { type: "tableHeader", attrs: { colwidth: [colWidths[4]] }, content: [{ type: "paragraph", content: [{ type: "text", text: "Media" }] }] },
            ],
          },
          ...bodyRows,
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

  const handleEditorContextMenu = useCallback(
    (event: React.MouseEvent) => {
      if (!editor) {
        return;
      }

      const target = event.target as HTMLElement | null;
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

      if (!isTableTarget && !aiSelection) {
        setTableContextMenu(null);
        return;
      }

      // If AI is off and there's no table to act on, nothing to show.
      if (!aiEnabled && !isTableTarget) {
        setTableContextMenu(null);
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      // For table-only operations with no text selection, anchor to clicked cell position.
      if (isTableTarget && !aiSelection) {
        const pos = editor.view.posAtCoords({ left: event.clientX, top: event.clientY });
        if (pos?.pos !== undefined) {
          editor.chain().focus().setTextSelection(pos.pos).run();
        }
      }

      const { x, y } = clampContextMenuPosition(event.clientX, event.clientY, {
        estimatedWidth: 220,
        estimatedHeight: isTableTarget ? 760 : 200,
      });

      setRewriteSubmenuOpen(false);
      setTranslateSubmenuOpen(false);
      setTableContextMenu({
        x,
        y,
        showTableActions: isTableTarget,
        aiSelection,
      });
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
      teacher,
      subject,
      plannedFor: parsedPlannedFor,
    }, lessonNotes);
    lastSavedSnapshotRef.current = JSON.stringify({
      content: json,
      teacher,
      subject,
      plannedFor: parsedPlannedFor,
      notes: lessonNotes,
    });
  };

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
        return "Editor is not ready yet.";
      }

      const docSize = editor.state.doc.content.size;
      const from = Math.max(0, Math.min(selection.from, docSize));
      const to = Math.max(from, Math.min(selection.to, docSize));

      if (from === to) {
        return "Select text first to use AI actions.";
      }

      const $from = editor.state.doc.resolve(from);
      const $to = editor.state.doc.resolve(Math.max(from, to - 1));

      // Ensure both ends sit in the same textblock (paragraph / heading / cell).
      const fromParent = $from.parent;
      const toParent = $to.parent;
      if (fromParent !== toParent) {
        return "Select text within a single paragraph or cell — multi-block selections can't be safely rewritten.";
      }

      return null;
    },
    [editor],
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
        setAiStatusMessage("Enable Local AI first in Settings > AI.");
        return;
      }

      const selectedRange = explicitSelection || getSelectedTextRange();
      if (!selectedRange) {
        setAiStatusMessage("Select text first to use AI actions.");
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
        setAiStatusMessage("Selected text is empty.");
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
          ? `You rewrite text. Tone: ${tone}. Always change the wording — never repeat the input verbatim. Output ONLY the rewritten text.`
          : `You translate text into ${targetLang}. Output ONLY the translation.`;

      const statusLabel = mode === "translate"
        ? `AI translating to ${targetLang} with ${aiRewriteTranslateModelId}...`
        : tone === "improve"
          ? `AI rewriting selection with ${aiRewriteTranslateModelId}...`
          : `AI rewriting (${tone}) with ${aiRewriteTranslateModelId}...`;

      const rewriteRuntimeDefaults = getAiModelRuntimeDefaults(aiRewriteTranslateModelId);

      setIsAiBusy(true);
      setAiStatusMessage(statusLabel);
      logDebug(
        "ai",
        "rewrite-translate-invoke",
        `${mode} | model=${aiRewriteTranslateModelId} | ctx=${rewriteRuntimeDefaults.defaultNumCtx} | predict=${rewriteRuntimeDefaults.defaultNumPredict}`,
      );

      try {
        const response = await tauriInvoke<string>("ai_generate_text", {
          modelId: aiRewriteTranslateModelId,
          prompt,
          temperature: 0.35,
          systemPrompt: rewriteSystemPrompt,
          enableThinking: false,
          numCtx: Math.min(rewriteRuntimeDefaults.defaultNumCtx, 8192),
          numPredict: rewriteRuntimeDefaults.defaultNumPredict,
        });

        console.log("[AI rewrite] raw response:", JSON.stringify(response));

        const transformedText = normalizeAiFragmentOutput(response, sourceText);
        console.log("[AI rewrite] normalized:", JSON.stringify(transformedText));
        if (!transformedText) {
          throw new Error("AI returned an empty response.");
        }

        const selectionStillValid = !getSelectionValidationError(selectedRange);
        if (!selectionStillValid) {
          throw new Error("Selection changed while AI was running. Please select the text again and retry.");
        }

        const currentSelectionText = editor.state.doc
          .textBetween(selectedRange.from, selectedRange.to, "\n", " ")
          .trim();
        if (currentSelectionText !== sourceText) {
          throw new Error("Selection content changed while AI was running. Please retry.");
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
            ? `AI rewrite applied (${aiRewriteTranslateModelId}).`
            : `AI translation applied (${aiRewriteTranslateModelId}).`,
        );
      } catch (error) {
        console.error("AI action failed:", error);
        setAiStatusMessage(`AI action failed: ${String(error)}`);
      } finally {
        setIsAiBusy(false);
      }
    },
    [
      aiEnabled,
      aiRewriteTranslateModelId,
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
    const safeMaxChars = Math.max(5000, Math.min(10000, Math.floor(maxChars)));
    const body = structured.length <= safeMaxChars
      ? structured
      : `${structured.slice(0, safeMaxChars)}\n\n[Content truncated at ${safeMaxChars} characters]`;

    return body || "(no body content yet)";
  }, [editor]);

  const handleSubmitChat = useCallback(async (overrideText?: string) => {
    if (!aiEnabled) {
      setAiStatusMessage("Enable Local AI first in Settings > AI.");
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
    setAiStatusMessage(`AI chat is thinking with ${aiDefaultModelId}...`);

    try {
      const chatRuntimeDefaults = getAiModelRuntimeDefaults(aiDefaultModelId);
      const chatContextCharLimit = Math.min(
        20000,
        Math.max(10000, Math.floor(chatRuntimeDefaults.defaultNumCtx * 0.6)),
      );
      const contextText = buildLessonContextText(chatContextCharLimit);

      // Build metadata header from local state fields.
      const metaLines: string[] = [];
      if (teacher)         metaLines.push(`Teacher: ${teacher}`);
      if (subject)         metaLines.push(`Subject: ${subject}`);
      if (plannedForInput) metaLines.push(`Planned for: ${plannedForInput}`);
      const metaHeader = metaLines.length > 0 ? metaLines.join("\n") + "\n" : "";

      // Build conversation history (capped at the user-configured limit).
      const historyLines: string[] = [];
      const recentMessages = chatMessages.slice(-aiChatHistoryLimit);
      for (const msg of recentMessages) {
        historyLines.push(msg.role === "user" ? `User: ${msg.text}` : `Assistant: ${msg.text}`);
      }

      const lessonBlock = `${metaHeader}${contextText}`.trim() || "(empty lesson plan — no content yet)";

      const prompt = [
        `The teacher's current lesson plan is shown below. Read it carefully before responding.\n\n---\n${lessonBlock}\n---`,
        "",
        ...(historyLines.length > 0 ? ["Conversation so far:", ...historyLines, ""] : []),
        `User: ${userText}`,
        "",
        "Assistant:",
      ].join("\n");

      const effectiveSystemPrompt = aiSystemPrompt ||
        `You are TeacherPro Assistant, an expert educational advisor built into a lesson planning app. The teacher's full lesson plan is always included at the top of every message — you MUST use it to answer. Never ask the teacher to paste or provide their lesson plan.

If the lesson plan is empty or has minimal content, acknowledge that and offer to help build it out.

You can help with:
- Summarizing the lesson plan or any section of it
- Identifying key themes, topics, and learning objectives
- Suggesting improvements to structure, activities, or wording
- Recommending teaching strategies, differentiation ideas, or resources
- Discussing pedagogy, timing, or curriculum alignment
- Answering any questions the teacher has about their lesson

Be concise but thorough. Use bullet points when listing multiple items. Never modify the lesson plan directly — only discuss and advise.`;

      logDebug(
        "ai",
        "chat-invoke",
        `model=${aiDefaultModelId} | ctx=${chatRuntimeDefaults.defaultNumCtx} | predict=${chatRuntimeDefaults.defaultNumPredict} | historyLimit=${aiChatHistoryLimit} | thinkRequested=${String(aiThinkingEnabled && modelSupportsThinking)}`,
      );

      const response = await tauriInvoke<string>("ai_generate_text", {
        modelId: aiDefaultModelId,
        prompt,
        temperature: aiTemperature,
        systemPrompt: effectiveSystemPrompt,
        enableThinking: aiThinkingEnabled && modelSupportsThinking,
        numCtx: chatRuntimeDefaults.defaultNumCtx,
        numPredict: chatRuntimeDefaults.defaultNumPredict,
      });

      const { thinking: thinkingContent, response: cleanResponse } = parseThinkingFromResponse(response);
      const assistantText = cleanResponse || "(No response)";

      setChatMessages((previous) => [
        ...previous,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: assistantText,
          thinking: thinkingContent ?? undefined,
          timestamp: Date.now(),
        },
      ]);
      setAiStatusMessage(`AI chat response ready (${aiDefaultModelId}).`);
    } catch (error) {
      console.error("AI chat failed:", error);
      setAiStatusMessage(`AI chat failed: ${String(error)}`);
      setChatMessages((previous) => [
        ...previous,
        {
          id: `assistant-error-${Date.now()}`,
          role: "assistant",
          text: `I hit an error: ${String(error)}`,
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsChatBusy(false);
    }
  }, [aiEnabled, aiDefaultModelId, aiChatHistoryLimit, aiTemperature, aiSystemPrompt, aiThinkingEnabled, modelSupportsThinking, buildLessonContextText, chatInput, chatMessages, teacher, subject, plannedForInput, logDebug]);

  useEffect(() => {
    if (!chatOpen) {
      return;
    }

    requestAnimationFrame(() => {
      chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
    });
  }, [chatOpen, chatMessages, isChatBusy]);

  const normalizedMethodSearch = methodBankSearch.trim().toLowerCase();
  const filteredMethodBankItems = methodBankItems.filter((entry) => {
    if (methodBankTypeFilter && entry.type !== methodBankTypeFilter) {
      return false;
    }

    if (!normalizedMethodSearch) {
      return true;
    }

    const searchable = `${entry.title}\n${entry.summary}\n${entry.description}\n${entry.duration}\n${entry.tags.join(" ")}`
      .toLowerCase();

    return searchable.includes(normalizedMethodSearch);
  });

  useEffect(() => {
    if (filteredMethodBankItems.length === 0) {
      setSelectedMethodId(null);
      return;
    }

    const hasSelected = filteredMethodBankItems.some((entry) => entry.id === selectedMethodId);
    if (!hasSelected) {
      setSelectedMethodId(filteredMethodBankItems[0].id);
    }
  }, [filteredMethodBankItems, selectedMethodId]);

  const selectedMethod = selectedMethodId
    ? filteredMethodBankItems.find((entry) => entry.id === selectedMethodId) || null
    : null;

  const getSlashSuggestions = useCallback(
    (requiredType: MethodBankType, query: string): MethodBankItem[] => {
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
        .slice(0, 7);
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

  const getSelectionMethodType = useCallback((): MethodBankType | null => {
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
      if (!isSelectionInsideLessonTableBodyRow()) {
        logDebug("editor", "double-click-insert-skipped", `${relativePath} | cursor-not-inside-lesson-table-body-row`);
        setPendingMaterialDrop(null);
        return;
      }

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
  }, [editor, isSelectionInsideLessonTableBodyRow, pendingMaterialDrop, insertMaterialLinkAtSelection, setPendingMaterialDrop, setDraggedMaterial, logDebug]);

  const createLessonPdf = async (): Promise<{ pdfBytes: Uint8Array; fileName: string }> => {
    const sourceElement = document.getElementById("lesson-plan-export-content");
    if (!sourceElement) {
      throw new Error("Could not find lesson content to export.");
    }

    const exportHost = document.createElement("div");
    exportHost.style.position = "fixed";
    exportHost.style.left = "-100000px";
    exportHost.style.top = "0";
    exportHost.style.pointerEvents = "none";
    exportHost.style.opacity = "0";
    exportHost.style.zIndex = "-1";

    const clonedElement = sourceElement.cloneNode(true) as HTMLElement;
    clonedElement.classList.add("tp-export-light-clone");

    // Force A4 Landscape exact printable inner-width (~1062px at 96 DPI for 281mm printable area).
    // This physically guarantees 12pt web font equals 12pt print font without responsive container stretching/shrinking.
    const exportWidth = 1062;
    clonedElement.style.width = `${exportWidth}px`;
    clonedElement.style.maxWidth = `${exportWidth}px`;
    clonedElement.style.minWidth = `${exportWidth}px`;

    clonedElement
      .querySelectorAll<HTMLElement>(".lesson-export-input, .lesson-export-planned-input, .lesson-export-calendar-trigger, .lesson-export-calendar-popover")
      .forEach((node) => {
        node.style.display = "none";
      });

    const subjectPicker = clonedElement.querySelector<HTMLElement>(".lesson-export-subject-picker");
    if (subjectPicker) {
      subjectPicker.style.display = "none";
    }

    const subjectText = clonedElement.querySelector<HTMLElement>(".lesson-export-subject-text");
    if (subjectText) {
      subjectText.style.display = "inline-flex";
      subjectText.style.alignItems = "center";
      subjectText.style.gap = "6px";
    }

    const subjectName = clonedElement.querySelector<HTMLElement>(".lesson-export-subject-name-print");
    if (subjectName) {
      subjectName.textContent = subject.trim() || "Not set";
    } else if (subjectText) {
      subjectText.textContent = subject.trim() || "Not set";
    }

    const exportSubjectDot = clonedElement.querySelector<HTMLElement>(".lesson-export-subject-dot-print");
    if (exportSubjectDot) {
      if (selectedSubjectColor) {
        exportSubjectDot.style.display = "inline-block";
        exportSubjectDot.style.backgroundColor = selectedSubjectColor;
      } else {
        exportSubjectDot.style.display = "none";
      }
    }

    const teacherText = clonedElement.querySelector<HTMLElement>(".lesson-export-teacher-text");
    if (teacherText) {
      teacherText.textContent = teacher.trim() || "Not set";
      teacherText.style.display = "inline";
    }

    const plannedText = clonedElement.querySelector<HTMLElement>(".lesson-export-planned-text");
    if (plannedText) {
      plannedText.textContent = plannedForInput.trim() || "Not set";
      plannedText.style.display = "inline";
    }

    exportHost.appendChild(clonedElement);
    document.body.appendChild(exportHost);

    try {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });

      const normalizedSubject =
        subject.trim().replace(/[^a-zA-Z0-9\-\s_]/g, "").replace(/\s+/g, "-") || "lesson-plan";
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const fileName = `${normalizedSubject}-${stamp}.pdf`;

      const pdfBytes = await renderElementToPdfBytes(clonedElement, {
        orientation: "landscape",
        marginMm: 8,
        scale: 2,
        backgroundColor: "#ffffff",
        multiPage: true,
      });

      return { pdfBytes, fileName };
    } finally {
      exportHost.remove();
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

  const handlePdfPreviewBackdropMouseDown = (
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    if (event.target !== event.currentTarget) {
      return;
    }
    setPdfPreviewUrl(null);
  };

  const handlePrintPDF = async () => {
    if (!vaultPath) {
      alert("Please open a vault before printing.");
      return;
    }

    setIsPdfBusy(true);

    try {
      setTableContextMenu(null);
      setPlannedCalendarOpen(false);

      const { pdfBytes, fileName } = await createLessonPdf();

      if (osType() === "windows") {
        const printBlobUrl = createPdfBlobUrl(pdfBytes);

        try {
          await printPdfBlobUrl(printBlobUrl);
          return;
        } catch (printError) {
          console.warn(
            "Lesson PDF blob print failed on Windows, falling back to webview print dialog.",
            printError,
          );
          await printCurrentWindow(["tp-exporting"]);
          return;
        } finally {
          revokePdfBlobUrl(printBlobUrl);
        }
      }
      
      const { tempDir, join } = await import("@tauri-apps/api/path");
      const { writeFile } = await import("@tauri-apps/plugin-fs");
      const { invoke } = await import("@tauri-apps/api/core");

      const sysTempDir = await tempDir();
      const tempPdfPath = await join(sysTempDir, fileName);

      await writeFile(tempPdfPath, pdfBytes);
      await invoke("print_pdf_file", { path: tempPdfPath });
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
  const canRunAiContextActions = !!tableContextMenu?.aiSelection && !isAiBusy && aiEnabled;
  const normalizedSubjectName = subject.trim().toLowerCase();
  const selectedSubjectConfig = normalizedSubjectName
    ? subjects.find((entry) => entry.name.trim().toLowerCase() === normalizedSubjectName)
    : undefined;
  const selectedSubjectColor = selectedSubjectConfig
    ? normalizeColorForPicker(selectedSubjectConfig.color, "#9ca3af")
    : null;
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
      className="tp-editor-page w-full max-w-none mx-auto print:max-w-none print:w-full"
    >
      <div className="sticky top-0 z-[66] bg-[#1e1e1e] pt-6 print:hidden">
        <div className="mb-3 flex gap-2">
          <button
            onClick={insertLessonTable}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-[#222] hover:bg-[#2d2d2d] border border-[#333] rounded-md text-white font-medium shadow-sm transition-colors"
          >
            <TableIcon className="w-4 h-4" /> Insert Lesson Table
          </button>
        </div>
        <MenuBar
          editor={editor}
          onSave={handleSave}
          onPreview={handlePreviewPDF}
          onPrint={handlePrintPDF}
          onExport={handleExportPDF}
          onToggleChat={toggleChatPanel}
          onToggleNotes={toggleNotesPanel}
          onToggleMethodBank={toggleMethodBankPanel}
          chatOpen={chatOpen}
          notesOpen={notesOpen}
          methodBankOpen={methodBankOpen}
          isPdfBusy={isPdfBusy}
          showActionButtonLabels={showActionButtonLabels}
          aiEnabled={aiEnabled}
        />
        {aiStatusMessage && (
          <div className="mt-2 rounded-md border border-[#333] bg-[#202020] px-3 py-2 text-xs text-gray-300">
            {aiStatusMessage}
          </div>
        )}
      </div>
      
      <div id="lesson-plan-container" className="tp-editor-surface bg-[#181818] rounded-b-md rounded-t-none shadow-sm border border-[#2a2a2a] min-h-[70vh] flex flex-col w-full print:bg-white print:border-none print:shadow-none print:min-h-0">
        <div id="lesson-plan-export-content" className="flex-1 lesson-export-surface">
          {activeFileContent?.metadata && (
            <div className="px-6 pt-4 pb-6 border-b border-[#2a2a2a] print:border-b-2 print:border-gray-300 mb-6 lesson-export-meta">
              <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-4 gap-y-4 gap-x-6 text-sm text-gray-400 print:text-black">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold text-gray-300 print:text-black min-w-[90px] lesson-export-label">Teacher:</span>
                  <input
                    type="text"
                    value={teacher}
                    onChange={(e) => setTeacher(e.target.value)}
                    placeholder="Your Name"
                    className="flex-1 min-w-[180px] bg-[#222] border border-[#333] rounded px-2 py-1.5 text-white text-sm outline-none focus:border-[var(--tp-accent)] print:bg-transparent print:border-none print:p-0 print:text-black lesson-export-input"
                  />
                  <span className="hidden lesson-export-value lesson-export-teacher-text text-black">{teacher.trim() || "Not set"}</span>
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
                  {subjects.length > 0 ? (
                    <div className="flex w-[260px] max-w-full items-center gap-2 lesson-export-subject-picker">
                      {selectedSubjectColor && (
                        <span
                          className="w-3 h-3 rounded-full shrink-0 border border-white/20"
                          style={{ backgroundColor: selectedSubjectColor }}
                        />
                      )}
                      <select
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        className="w-full bg-[#222] border border-[#333] rounded px-2 py-1.5 text-white text-sm outline-none focus:border-[var(--tp-accent)] print:bg-transparent print:border-none print:p-0 print:text-black lesson-export-input"
                      >
                        <option value="">— None —</option>
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
                      placeholder="e.g. Mathematics"
                      className="w-[260px] max-w-full bg-[#222] border border-[#333] rounded px-2 py-1.5 text-white text-sm outline-none focus:border-[var(--tp-accent)] print:bg-transparent print:border-none print:p-0 print:text-black lesson-export-input"
                    />
                  )}
                  <span className="hidden lesson-export-value lesson-export-subject-text">
                    <span className="lesson-export-subject-dot-print h-2.5 w-2.5 rounded-full border border-black/10" />
                    <span className="lesson-export-subject-name-print">{subject.trim() || "Not set"}</span>
                  </span>
                </div>
              </div>
            </div>
          )}

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
            <div
              className={buildContextMenuClassName("z-[70] min-w-[220px] print:hidden")}
              style={{
                top: tableContextMenu.y,
                left: tableContextMenu.x,
                maxHeight: `calc(100vh - ${Math.max(tableContextMenu.y + 8, 32)}px)`,
              }}
              onClick={(event) => event.stopPropagation()}
            >
              {tableContextMenu.showTableActions && (
                <>
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
                </>
              )}

              {aiEnabled && (
                <>
                  {/* ── Rewrite submenu ─────────────────────────────────── */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setRewriteSubmenuOpen((v) => !v);
                      setTranslateSubmenuOpen(false);
                    }}
                    disabled={!canRunAiContextActions}
                    className="w-full inline-flex items-center justify-between gap-2 text-left px-3 py-2 text-sm text-gray-200 hover:bg-[#2d2d2d] rounded disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-[var(--tp-accent)]" />
                      AI Rewrite
                    </span>
                    <ChevronRight className={`w-3.5 h-3.5 text-gray-400 transition-transform ${rewriteSubmenuOpen ? "rotate-90" : ""}`} />
                  </button>
                  {rewriteSubmenuOpen && (
                    <div className="ml-5 flex flex-col">
                      {(
                        [
                          { tone: "improve",  label: "Improve" },
                          { tone: "formal",   label: "More Formal" },
                          { tone: "casual",   label: "More Casual" },
                          { tone: "simple",   label: "Simpler" },
                          { tone: "engaging", label: "More Engaging" },
                          { tone: "concise",  label: "More Concise" },
                        ] as const
                      ).map(({ tone, label }) => (
                        <button
                          key={tone}
                          onClick={() => {
                            setTableContextMenu(null);
                            setRewriteSubmenuOpen(false);
                            void runAiSelectionAction("rewrite", tableContextMenu!.aiSelection, { tone });
                          }}
                          disabled={!canRunAiContextActions}
                          className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-[#2d2d2d] rounded disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* ── Translate submenu ────────────────────────────────── */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setTranslateSubmenuOpen((v) => !v);
                      setRewriteSubmenuOpen(false);
                    }}
                    disabled={!canRunAiContextActions}
                    className="w-full inline-flex items-center justify-between gap-2 text-left px-3 py-2 text-sm text-gray-200 hover:bg-[#2d2d2d] rounded disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Languages className="w-3.5 h-3.5 text-[var(--tp-accent)]" />
                      AI Translate
                    </span>
                    <ChevronRight className={`w-3.5 h-3.5 text-gray-400 transition-transform ${translateSubmenuOpen ? "rotate-90" : ""}`} />
                  </button>
                  {translateSubmenuOpen && (
                    <div className="ml-5 flex flex-col">
                      {/* configured language first */}
                      {aiTranslateTargetLanguage && (
                        <button
                          onClick={() => {
                            setTableContextMenu(null);
                            setTranslateSubmenuOpen(false);
                            void runAiSelectionAction("translate", tableContextMenu!.aiSelection, { language: aiTranslateTargetLanguage });
                          }}
                          disabled={!canRunAiContextActions}
                          className="w-full text-left px-3 py-1.5 text-sm text-[var(--tp-accent)] hover:bg-[#2d2d2d] rounded disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {aiTranslateTargetLanguage} ★
                        </button>
                      )}
                      {(
                        [
                          "English", "French", "Spanish", "German", "Greek",
                          "Italian", "Portuguese", "Dutch", "Russian",
                          "Arabic", "Japanese", "Chinese (Simplified)",
                        ] as const
                      )
                        .filter((lang) => lang !== aiTranslateTargetLanguage)
                        .map((lang) => (
                          <button
                            key={lang}
                            onClick={() => {
                              setTableContextMenu(null);
                              setTranslateSubmenuOpen(false);
                              void runAiSelectionAction("translate", tableContextMenu!.aiSelection, { language: lang });
                            }}
                            disabled={!canRunAiContextActions}
                            className="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-[#2d2d2d] rounded disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {lang}
                          </button>
                        ))}
                    </div>
                  )}
                </>
              )}

              {tableContextMenu.showTableActions && aiEnabled && <div className="h-px bg-[#333] my-1" />}

              {tableContextMenu.showTableActions && (
                <>
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
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div
        className={`fixed left-0 top-0 bottom-0 z-[200] w-72 print:hidden flex flex-col transition-transform duration-300 ease-in-out ${
          notesOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex flex-col h-full border-r border-[var(--tp-border-strong)] bg-[var(--tp-panel-elevated)] shadow-2xl">
          <div className="flex shrink-0 items-center gap-2 border-b border-[var(--tp-border-strong)] px-3 py-2">
            <FileText className="w-3.5 h-3.5 shrink-0 text-[var(--tp-accent)]" />
            <span className="flex-1 truncate text-sm font-semibold text-[var(--tp-text-primary)]">Lesson Notes</span>
            <button
              onClick={() => setLessonNotes("")}
              title="Clear notes"
              className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                lessonNotes.trim()
                  ? "text-[var(--tp-text-muted)] hover:bg-[var(--tp-panel-muted)] hover:text-red-400"
                  : "text-[var(--tp-border-strong)] cursor-default pointer-events-none"
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setNotesOpen(false)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--tp-text-muted)] hover:bg-[var(--tp-panel-muted)] hover:text-[var(--tp-text-primary)]"
              title="Close Notes"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex-1 p-3 bg-[var(--tp-app-bg)]">
            <textarea
              value={lessonNotes}
              onChange={(event) => setLessonNotes(event.target.value)}
              className="h-full w-full resize-none overflow-y-auto rounded-lg border border-[var(--tp-border-strong)] bg-[var(--tp-panel-elevated)] px-3 py-3 text-sm leading-relaxed text-[var(--tp-text-primary)] outline-none focus:border-[var(--tp-accent)] [scrollbar-width:thin] [scrollbar-color:#3a3a3a_#161616] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-[#161616] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#3a3a3a]"
            />
          </div>
        </div>
      </div>

      <div
        className={`fixed left-0 top-0 bottom-0 z-[200] w-72 print:hidden flex flex-col transition-transform duration-300 ease-in-out ${
          methodBankOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col border-r border-[var(--tp-border-strong)] bg-[var(--tp-panel-elevated)] shadow-2xl">
          <div className="flex shrink-0 items-center gap-2 border-b border-[var(--tp-border-strong)] px-3 py-2">
            <BookOpen className="h-3.5 w-3.5 shrink-0 text-[var(--tp-accent)]" />
            <span className="flex-1 truncate text-sm font-semibold text-[var(--tp-text-primary)]">Method Bank</span>
            <button
              onClick={() => setMethodBankOpen(false)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--tp-text-muted)] hover:bg-[var(--tp-panel-muted)] hover:text-[var(--tp-text-primary)]"
              title="Close Method Bank"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="shrink-0 space-y-2 border-b border-[var(--tp-border-strong)] bg-[var(--tp-panel-muted)] px-3 py-3">
            <input
              type="text"
              value={methodBankSearch}
              onChange={(event) => setMethodBankSearch(event.target.value)}
              placeholder="Search methods..."
              className="h-9 w-full rounded-md border border-[var(--tp-border-strong)] bg-[var(--tp-panel-elevated)] px-3 text-sm text-[var(--tp-text-primary)] outline-none placeholder:text-[var(--tp-text-muted)] focus:border-[var(--tp-accent)]"
            />
            <div className="flex flex-wrap gap-1.5">
              {([
                { key: "phase", label: "Phase" },
                { key: "socialForm", label: "Social" },
                { key: "method", label: "Method" },
              ] as const).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setMethodBankTypeFilter((previous) => (previous === key ? null : key))}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    methodBankTypeFilter === key
                      ? "border-[var(--tp-accent)] bg-[var(--tp-accent)]/20 text-[var(--tp-accent)]"
                      : "border-[var(--tp-border-strong)] text-[var(--tp-text-muted)] hover:text-[var(--tp-text-primary)]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--tp-app-bg)] py-3 pl-3 pr-2 [scrollbar-gutter:stable] [scrollbar-width:thin] [scrollbar-color:#3a3a3a_#161616] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-[#161616] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#3a3a3a]">
            {methodBankLoading && (
              <p className="text-xs text-[var(--tp-text-muted)]">Loading Method Bank...</p>
            )}

            {!methodBankLoading && methodBankError && (
              <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                {methodBankError}
              </p>
            )}

            {!methodBankLoading && !methodBankError && filteredMethodBankItems.length === 0 && (
              <p className="text-xs text-[var(--tp-text-muted)]">No methods match your current filters.</p>
            )}

            {!methodBankLoading && !methodBankError && filteredMethodBankItems.length > 0 && (
              <div className="space-y-1.5">
                {filteredMethodBankItems.map((entry) => {
                  const isSelected = selectedMethodId === entry.id;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      draggable={false}
                      onClick={() => setSelectedMethodId(entry.id)}
                      onDoubleClick={() => handleInsertMethod(entry)}
                      title={entry.title}
                      className={`w-full rounded-md border px-2 py-2 text-left transition-colors ${
                        isSelected
                          ? "border-[var(--tp-accent)] bg-[var(--tp-accent)]/15"
                          : "border-[var(--tp-border-strong)] bg-[var(--tp-panel-elevated)] hover:border-[var(--tp-accent)]/60"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-[13px] font-semibold text-[var(--tp-text-primary)]">
                            {entry.title}
                          </p>
                          <span className={`shrink-0 text-[11px] font-medium ${METHOD_TYPE_ACCENT[entry.type]}`}>
                            {METHOD_TYPE_LABELS[entry.type]}
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
            {selectedMethod ? (
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-[var(--tp-text-primary)]">{selectedMethod.title}</p>
                  <span className={`text-[12px] font-medium ${METHOD_TYPE_ACCENT[selectedMethod.type]}`}>
                    {METHOD_TYPE_LABELS[selectedMethod.type]}
                  </span>
                </div>
                <p className="text-[12px] leading-relaxed text-[var(--tp-text-muted)]">{selectedMethod.description}</p>
                <div className="flex flex-wrap gap-1">
                  {selectedMethod.tags.map((tag) => (
                    <span
                      key={`${selectedMethod.id}-${tag}`}
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

      <div
        className={`fixed left-0 top-0 bottom-0 z-[200] w-72 print:hidden flex flex-col transition-transform duration-300 ease-in-out ${
          chatOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
          <div className="flex flex-col h-full border-r border-[var(--tp-border-strong)] bg-[var(--tp-panel-elevated)] shadow-2xl">
            {/* Header */}
            <div className="flex shrink-0 items-center gap-2 border-b border-[var(--tp-border-strong)] px-3 py-2">
              <MessageSquare className="w-3.5 h-3.5 shrink-0 text-[var(--tp-accent)]" />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--tp-text-primary)]">
                AI Chat
              </span>
              <span className="inline-flex max-w-[112px] shrink items-center truncate rounded-full bg-[var(--tp-panel-muted)] px-2 py-0.5 text-[11px] font-medium text-[var(--tp-text-muted)]">
                {aiDefaultModelId}
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => setChatMessages([])}
                  title="Clear chat history"
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                    chatMessages.length > 0
                      ? "text-[var(--tp-text-muted)] hover:bg-[var(--tp-panel-muted)] hover:text-red-400"
                      : "text-[var(--tp-border-strong)] cursor-default pointer-events-none"
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => {
                    if (modelSupportsThinking) {
                      setAiThinkingEnabled(!aiThinkingEnabled);
                    }
                  }}
                  title={
                    !modelSupportsThinking
                      ? "This model does not expose thinking traces in TeacherPro."
                      : aiThinkingEnabled
                        ? "Thinking mode requested (supported models only) — click to disable"
                        : "Enable thinking mode request (supported models only)"
                  }
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                    modelSupportsThinking && aiThinkingEnabled
                      ? "text-[var(--tp-accent)] hover:bg-[var(--tp-panel-muted)]"
                      : modelSupportsThinking
                        ? "text-[var(--tp-text-muted)] hover:bg-[var(--tp-panel-muted)]"
                        : "text-[var(--tp-border-strong)] cursor-not-allowed"
                  }`}
                  aria-disabled={!modelSupportsThinking}
                >
                  <Brain className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setChatOpen(false)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--tp-text-muted)] hover:bg-[var(--tp-panel-muted)] hover:text-[var(--tp-text-primary)]"
                  title="Close AI Chat"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>


            {/* Messages */}
            <div
              ref={chatScrollRef}
              className="flex-1 overflow-y-auto bg-[var(--tp-app-bg)] px-4 py-4 space-y-4 [scrollbar-width:thin] [scrollbar-color:#3a3a3a_#161616] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-[#161616] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#3a3a3a]"
            >
              {chatMessages.length === 0 && (
                <div className="flex h-full flex-col items-center justify-center gap-4">
                  <p className="text-xs text-[var(--tp-text-muted)] text-center max-w-xs leading-relaxed">
                    Ask anything about your lesson plan — summarize it, discuss themes, get recommendations.
                  </p>
                  <div className="flex flex-col gap-1.5 w-full">
                    {([
                      { label: "Summarize this lesson", prompt: "Please summarize this lesson plan in a few sentences." },
                      { label: "Key themes & topics", prompt: "What are the key themes and topics covered in this lesson plan?" },
                      { label: "Check learning objectives", prompt: "Are the learning objectives clear and well-structured? How could they be improved?" },
                      { label: "Suggest improvements", prompt: "What improvements would you suggest to make this lesson plan more effective?" },
                      { label: "Activity ideas", prompt: "Can you suggest some additional activity ideas that would complement this lesson?" },
                    ] as const).map(({ label, prompt }) => (
                      <button
                        key={label}
                        disabled={isChatBusy}
                        onClick={() => void handleSubmitChat(prompt)}
                        className="w-full text-left px-3 py-2 rounded-lg border border-[var(--tp-border-strong)] bg-[var(--tp-panel-muted)] text-xs text-gray-300 hover:border-[var(--tp-accent)] hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {chatMessages.map((message) => (
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
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--tp-accent)] opacity-70">AI</span>
                      </div>
                      <div className="w-full text-[13px] leading-relaxed text-[var(--tp-text-primary)]">
                        <AiMarkdown text={message.text} />
                      </div>
                      {message.thinking != null && (
                        <div className="mt-2">
                          <button
                            onClick={() => {
                              setExpandedThinking((prev) => {
                                const next = new Set(prev);
                                if (next.has(message.id)) next.delete(message.id);
                                else next.add(message.id);
                                return next;
                              });
                            }}
                            className="flex items-center gap-1.5 text-[11px] text-[var(--tp-text-muted)] hover:text-[var(--tp-accent)] transition-colors"
                          >
                            <Brain className="w-3 h-3" />
                            {expandedThinking.has(message.id) ? "Hide thinking" : "Show thinking"}
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

              {isChatBusy && (
                <div className="w-full">
                  <div className="mb-1 flex items-center gap-1.5">
                    <MessageSquare className="w-3 h-3 text-[var(--tp-accent)]" />
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--tp-accent)] opacity-70">AI</span>
                  </div>
                  <div className="flex items-center gap-1.5 py-1">
                    <span className="inline-block w-2 h-2 rounded-full bg-[var(--tp-text-muted)] animate-bounce [animation-delay:0ms]" />
                    <span className="inline-block w-2 h-2 rounded-full bg-[var(--tp-text-muted)] animate-bounce [animation-delay:150ms]" />
                    <span className="inline-block w-2 h-2 rounded-full bg-[var(--tp-text-muted)] animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              )}
            </div>

            {/* Input bar */}
            <div className="shrink-0 border-t border-[var(--tp-border-strong)] bg-[var(--tp-panel-elevated)] px-3 py-3">
              <div className="flex items-center gap-2 rounded-xl border border-[var(--tp-border-strong)] bg-[var(--tp-panel-muted)] px-3 py-2 focus-within:border-[var(--tp-accent)]">
                <textarea
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void handleSubmitChat();
                    }
                  }}
                  placeholder="Message AI..."
                  rows={1}
                  className="flex-1 min-h-[24px] max-h-32 resize-none bg-transparent text-sm text-[var(--tp-text-primary)] placeholder:text-[var(--tp-text-muted)] outline-none leading-6"
                  style={{ fieldSizing: "content" } as React.CSSProperties}
                />
                <button
                  onClick={() => { void handleSubmitChat(); }}
                  disabled={isChatBusy || !chatInput.trim()}
                  className="h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-lg bg-[var(--tp-accent)] text-white hover:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                  title={isChatBusy ? "AI is responding..." : "Send (Enter)"}
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="mt-1.5 text-center text-[10px] text-[var(--tp-text-muted)]">Enter to send · Shift+Enter for new line</p>
            </div>
          </div>
      </div>

      {slashMenu && (
        <div
          className="fixed z-[210] w-[320px] overflow-hidden rounded-lg border border-[var(--tp-border-strong)] bg-[var(--tp-panel-elevated)] shadow-2xl print:hidden"
          style={{ left: slashMenu.x, top: slashMenu.y }}
        >
          <div className="border-b border-[var(--tp-border-strong)] bg-[var(--tp-panel-muted)] px-3 py-2 text-[11px] text-[var(--tp-text-muted)]">
            {METHOD_TYPE_LABELS[slashMenu.requiredType]} suggestions
          </div>
          <div className="max-h-[250px] overflow-y-auto [scrollbar-width:thin] [scrollbar-color:#3a3a3a_#161616] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-[#161616] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#3a3a3a]">
            {slashSuggestions.length === 0 ? (
              <div className="px-3 py-2 text-[11px] text-[var(--tp-text-muted)]">
                No Method Bank matches for "{slashMenu.query}".
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
                      : "hover:bg-[var(--tp-panel-muted)]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[12px] font-medium text-[var(--tp-text-primary)]">{entry.title}</span>
                    <span className={`shrink-0 text-[10px] ${METHOD_TYPE_ACCENT[entry.type]}`}>
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

      {pdfPreviewUrl && (
        <div
          className="fixed inset-0 z-[78] bg-black/65 p-6 flex items-center justify-center print:hidden pdf-preview-modal"
          onMouseDown={handlePdfPreviewBackdropMouseDown}
        >
          <div
            ref={pdfPreviewRef}
            tabIndex={-1}
            className="tp-preview-surface w-full max-w-6xl h-[88vh] bg-[#161616] border border-[#333] rounded-xl shadow-2xl overflow-hidden"
            onMouseDown={(event) => event.stopPropagation()}
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
  );
}
