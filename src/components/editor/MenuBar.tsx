import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Eraser,
  ExternalLink,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus as MinusIcon,
  Quote,
  Redo,
  Strikethrough,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  Table as TableIcon,
  Underline,
  Undo,
  X,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "../../i18n/useTranslation";
import { normalizeColorForPicker } from "../../utils/colors";
import { MOD_LABEL, REDO_LABEL, UNDO_LABEL } from "./editorKeys";

export const MenuBar = ({
  editor,
  onInsertCustomTable,
  onHighlightColorChange,
}: {
  editor: any;
  onInsertCustomTable: () => void;
  onHighlightColorChange: (color: string) => void;
}) => {
  const { t } = useTranslation();
  // Force a re-render when the editor state changes so active buttons update
  const [, setForceUpdate] = useState(0);
  const [fontSizeOpen, setFontSizeOpen] = useState(false);
  const fontSizeWrapRef = useRef<HTMLDivElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const linkWrapRef = useRef<HTMLDivElement>(null);
  const [fontFamilyOpen, setFontFamilyOpen] = useState(false);
  const fontFamilyWrapRef = useRef<HTMLDivElement>(null);

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

  // Close font-size dropdown on outside click / Escape
  useEffect(() => {
    if (!fontSizeOpen) return;
    const onDown = (e: MouseEvent) => {
      if (fontSizeWrapRef.current && !fontSizeWrapRef.current.contains(e.target as Node)) {
        setFontSizeOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFontSizeOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [fontSizeOpen]);

  // Close link popover on outside click / Escape
  useEffect(() => {
    if (!linkOpen) return;
    const onDown = (e: MouseEvent) => {
      if (linkWrapRef.current && !linkWrapRef.current.contains(e.target as Node)) {
        setLinkOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLinkOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [linkOpen]);

  // Close font-family popover on outside click / Escape
  useEffect(() => {
    if (!fontFamilyOpen) return;
    const onDown = (e: MouseEvent) => {
      if (fontFamilyWrapRef.current && !fontFamilyWrapRef.current.contains(e.target as Node)) {
        setFontFamilyOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFontFamilyOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [fontFamilyOpen]);

  const openLinkPopover = useCallback(() => {
    if (!editor) {
      return;
    }
    setLinkUrl(editor.getAttributes("link").href || "");
    setLinkOpen(true);
  }, [editor]);

  // Mod+K (dispatched from the link extension shortcut) opens the popover.
  useEffect(() => {
    const handleOpen = () => openLinkPopover();
    window.addEventListener("tp:open-link-popover", handleOpen);
    return () => window.removeEventListener("tp:open-link-popover", handleOpen);
  }, [openLinkPopover]);

  if (!editor) {
    return null;
  }

  const applyLink = () => {
    const raw = linkUrl.trim();
    if (!raw) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      setLinkOpen(false);
      return;
    }

    const href = /^(https?:|mailto:|tel:)/i.test(raw) ? raw : `https://${raw}`;
    const { empty } = editor.state.selection;

    if (empty) {
      editor
        .chain()
        .focus()
        .insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] })
        .run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }

    setLinkOpen(false);
  };

  const removeLink = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkOpen(false);
  };

  const FONT_SIZES = ["8pt", "10pt", "11pt", "12pt", "14pt", "16pt", "18pt", "24pt"];
  const currentFontSize = editor.getAttributes("textStyle").fontSize || "11pt";
  const FONT_FAMILIES: { label: string; value: string | null; group?: string }[] = [
    { label: t("editor.toolbar.fontFamilyDefault"), value: null },
    { label: "Inter", value: "'Inter', 'Segoe UI', sans-serif", group: t("editor.toolbar.fontGroupSans") },
    { label: "Lato", value: "'Lato', 'Segoe UI', sans-serif", group: t("editor.toolbar.fontGroupSans") },
    { label: "Nunito", value: "'Nunito', 'Segoe UI', sans-serif", group: t("editor.toolbar.fontGroupSans") },
    { label: "Lexend", value: "'Lexend', 'Segoe UI', sans-serif", group: t("editor.toolbar.fontGroupSans") },
    { label: "Atkinson Hyperlegible", value: "'Atkinson Hyperlegible', 'Segoe UI', sans-serif", group: t("editor.toolbar.fontGroupSans") },
    { label: "Merriweather", value: "'Merriweather', Georgia, serif", group: t("editor.toolbar.fontGroupSerif") },
    { label: "Lora", value: "'Lora', Georgia, serif", group: t("editor.toolbar.fontGroupSerif") },
    { label: "Playfair Display", value: "'Playfair Display', Georgia, serif", group: t("editor.toolbar.fontGroupSerif") },
    { label: "EB Garamond", value: "'EB Garamond', Georgia, serif", group: t("editor.toolbar.fontGroupSerif") },
    { label: "Caveat", value: "'Caveat', 'Comic Sans MS', cursive", group: t("editor.toolbar.fontGroupHandwriting") },
    { label: "Patrick Hand", value: "'Patrick Hand', 'Comic Sans MS', cursive", group: t("editor.toolbar.fontGroupHandwriting") },
    { label: "Shadows Into Light", value: "'Shadows Into Light', 'Comic Sans MS', cursive", group: t("editor.toolbar.fontGroupHandwriting") },
    { label: "Arial", value: "Arial, Helvetica, sans-serif", group: t("editor.toolbar.fontGroupSystem") },
    { label: "Calibri", value: "Calibri, Candara, 'Segoe UI', sans-serif", group: t("editor.toolbar.fontGroupSystem") },
    { label: "Georgia", value: "Georgia, 'Times New Roman', serif", group: t("editor.toolbar.fontGroupSystem") },
    { label: "Times New Roman", value: "'Times New Roman', Times, serif", group: t("editor.toolbar.fontGroupSystem") },
    { label: "Courier New", value: "'Courier New', Courier, monospace", group: t("editor.toolbar.fontGroupSystem") },
    { label: "Verdana", value: "Verdana, Geneva, sans-serif", group: t("editor.toolbar.fontGroupSystem") },
    { label: "Trebuchet MS", value: "'Trebuchet MS', Tahoma, Geneva, sans-serif", group: t("editor.toolbar.fontGroupSystem") },
  ];
  const currentFontFamily = editor.getAttributes("textStyle").fontFamily || "";
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

  // --- Vertical Right Rail (v3 design) ---
  const railBtn = (isActive?: boolean) =>
    `h-8 w-10 inline-flex items-center justify-center rounded-md transition-colors ${
      isActive ? "tp-rail-btn-active" : "tp-rail-btn"
    }`;
  const compactBtn = (isActive?: boolean) =>
    `h-6 w-6 inline-flex items-center justify-center rounded ${
      isActive ? "tp-rail-btn-active" : "tp-rail-btn"
    }`;
  const railDivider = (
    <div
      className="w-6 h-px my-0.5"
      style={{ background: "var(--tp-b-1)" }}
      aria-hidden="true"
    />
  );

  return (
    <div
      className="tp-editor-rail print:hidden self-stretch flex flex-col items-center py-2 gap-0.5 overflow-y-auto shrink-0"
      role="toolbar"
      aria-orientation="vertical"
      aria-label={t("editor.toolbar.railLabel")}
      style={{
        width: "var(--tp-rail-w)",
        background: "var(--tp-bg-1)",
        borderLeft: "1px solid var(--tp-b-1)",
      }}
    >
      {/* Font size — custom popover dropdown (OS-independent, escapes rail overflow via fixed positioning) */}
      <div ref={fontSizeWrapRef} className="relative">
        <button
          type="button"
          onClick={() => setFontSizeOpen((v) => !v)}
          className="h-10 w-10 inline-flex items-center justify-center gap-0.5 rounded text-[12.5px] font-medium cursor-pointer outline-none bg-[var(--tp-bg-2)] border border-[var(--tp-b-2)] text-[var(--tp-t-1)] hover:bg-[var(--tp-bg-4)]"
          title={t("editor.toolbar.fontSize")}
          aria-haspopup="listbox"
          aria-expanded={fontSizeOpen}
        >
          <span>{currentFontSize.replace("pt", "")}</span>
          <ChevronDown className="w-3.5 h-3.5 opacity-60" />
        </button>
        {fontSizeOpen && (() => {
          const rect = fontSizeWrapRef.current?.getBoundingClientRect();
          const top = rect ? rect.top : 0;
          const left = rect ? rect.left - 92 : 0; // 84px width + 8px gap
          return (
            <div
              className="py-1 rounded-lg shadow-2xl"
              style={{
                position: "fixed",
                top,
                left,
                zIndex: 1000,
                background: "#222222",
                border: "1px solid #333333",
                minWidth: "84px",
              }}
              role="listbox"
            >
              {FONT_SIZES.map((size) => {
                const isSelected = size === currentFontSize;
                return (
                  <button
                    key={size}
                    onClick={() => {
                      editor.chain().focus().setFontSize(size).run();
                      setFontSizeOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-1.5 text-[12.5px] text-left ${
                      isSelected
                        ? "bg-[rgba(45,134,165,0.12)] text-[var(--tp-accent)]"
                        : "text-[#b8b8b8] hover:bg-[var(--tp-bg-4)] hover:text-[var(--tp-t-1)]"
                    }`}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <span>{size.replace("pt", "")} pt</span>
                    {isSelected && <span className="text-[10px]">●</span>}
                  </button>
                );
              })}
            </div>
          );
        })()}
      </div>
      {/* Font family — custom popover dropdown */}
      <div ref={fontFamilyWrapRef} className="relative">
        <button
          type="button"
          onClick={() => setFontFamilyOpen((v) => !v)}
          className="h-10 w-10 inline-flex items-center justify-center gap-0.5 rounded text-[12.5px] font-medium cursor-pointer outline-none bg-[var(--tp-bg-2)] border border-[var(--tp-b-2)] text-[var(--tp-t-1)] hover:bg-[var(--tp-bg-4)]"
          title={t("editor.toolbar.fontFamily")}
          aria-haspopup="listbox"
          aria-expanded={fontFamilyOpen}
        >
          <span>Aa</span>
          <ChevronDown className="w-3.5 h-3.5 opacity-60" />
        </button>
        {fontFamilyOpen && (() => {
          const rect = fontFamilyWrapRef.current?.getBoundingClientRect();
          const top = rect ? rect.top : 0;
          const left = rect ? rect.left - 180 : 0; // 172px width + 8px gap
          return (
            <div
              className="py-1 rounded-lg shadow-2xl"
              style={{
                position: "fixed",
                top,
                left,
                zIndex: 1000,
                background: "#222222",
                border: "1px solid #333333",
                minWidth: "172px",
              }}
              role="listbox"
            >
              {FONT_FAMILIES.map((option, index) => {
                const isSelected = (option.value || "") === currentFontFamily;
                const showGroup =
                  option.group && option.group !== FONT_FAMILIES[index - 1]?.group;
                return (
                  <Fragment key={option.label}>
                    {showGroup && (
                      <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[#6b7280]">
                        {option.group}
                      </div>
                    )}
                    <button
                      onClick={() => {
                        if (option.value) {
                          editor.chain().focus().setFontFamily(option.value).run();
                        } else {
                          editor.chain().focus().unsetFontFamily().run();
                        }
                        setFontFamilyOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-1.5 text-[12.5px] text-left ${
                        isSelected
                          ? "bg-[rgba(45,134,165,0.12)] text-[var(--tp-accent)]"
                          : "text-[#b8b8b8] hover:bg-[var(--tp-bg-4)] hover:text-[var(--tp-t-1)]"
                      }`}
                      style={{ fontFamily: option.value ?? undefined }}
                      role="option"
                      aria-selected={isSelected}
                    >
                      <span>{option.label}</span>
                      {isSelected && <span className="text-[10px]">●</span>}
                    </button>
                  </Fragment>
                );
              })}
            </div>
          );
        })()}
      </div>

      {railDivider}

      {/* Bold / Italic / Strike / Underline */}
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        disabled={!editor.can().chain().focus().toggleBold().run()}
        className={railBtn(editor.isActive("bold"))}
        title={`${t("editor.toolbar.bold")} (${MOD_LABEL}+B)`}
      >
        <Bold className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        disabled={!editor.can().chain().focus().toggleItalic().run()}
        className={railBtn(editor.isActive("italic"))}
        title={`${t("editor.toolbar.italic")} (${MOD_LABEL}+I)`}
      >
        <Italic className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        disabled={!editor.can().chain().focus().toggleUnderline().run()}
        className={railBtn(editor.isActive("underline"))}
        title={`${t("editor.toolbar.underline")} (${MOD_LABEL}+U)`}
      >
        <Underline className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleStrike().run()}
        disabled={!editor.can().chain().focus().toggleStrike().run()}
        className={railBtn(editor.isActive("strike"))}
        title={`${t("editor.toolbar.strikethrough")} (${MOD_LABEL}+Shift+S)`}
      >
        <Strikethrough className="w-4 h-4" />
      </button>

      {railDivider}

      {/* Colors A / U / H (each with hidden color picker + reset below) */}
      <div
        className="flex flex-col p-0.5 rounded gap-0.5"
        style={{
          background: "var(--tp-bg-2)",
          border: "1px solid var(--tp-b-2)",
        }}
      >
        <div className="flex gap-0.5">
          <label
            className="tp-rail-color-btn inline-flex items-center justify-center h-6 w-6 rounded cursor-pointer relative text-[11px] font-bold"
            title={t("editor.toolbar.textColor")}
            style={{ color: "var(--tp-t-1)" }}
          >
            A
            <span
              className="absolute left-0.5 right-0.5 bottom-[2px] h-[2px] rounded-sm"
              style={{ background: currentTextColor }}
            />
            <input
              type="color"
              value={currentTextColor}
              onChange={(event) => editor.chain().focus().setColor(event.target.value).run()}
              className="absolute opacity-0 pointer-events-none"
            />
          </label>
          <button
            onClick={() => editor.chain().focus().unsetColor().run()}
            className="h-6 w-6 rounded text-[10px] font-semibold tp-rail-btn"
            title={t("editor.toolbar.resetTextColor")}
          >
            A-
          </button>
        </div>
        <div className="flex gap-0.5">
          <label
            className="tp-rail-color-btn inline-flex items-center justify-center h-6 w-6 rounded cursor-pointer relative text-[11px] font-bold"
            title={t("editor.toolbar.underlineColor")}
            style={{ color: "var(--tp-t-1)" }}
          >
            U
            <span
              className="absolute left-0.5 right-0.5 bottom-[2px] h-[2px] rounded-sm"
              style={{ background: currentUnderlineColor }}
            />
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
            className="h-6 w-6 rounded text-[10px] font-semibold tp-rail-btn"
            title={t("editor.toolbar.resetUnderlineColor")}
          >
            U-
          </button>
        </div>
        <div className="flex gap-0.5">
          <label
            className="tp-rail-color-btn inline-flex items-center justify-center h-6 w-6 rounded cursor-pointer relative text-[11px] font-bold hover:brightness-125"
            title={t("editor.toolbar.highlightColor")}
            style={{ background: currentHighlightColor, color: "#1a1a1a" }}
          >
            H
            <input
              type="color"
              value={currentHighlightColor}
              onChange={(event) => {
                onHighlightColorChange(event.target.value);
                editor.chain().focus().setHighlight({ color: event.target.value }).run();
              }}
              className="absolute opacity-0 pointer-events-none"
            />
          </label>
          <button
            onClick={() => editor.chain().focus().unsetHighlight().run()}
            className="h-6 w-6 rounded text-[10px] font-semibold tp-rail-btn"
            title={t("editor.toolbar.clearHighlight")}
          >
            H-
          </button>
        </div>
      </div>

      {railDivider}

      {/* Headings */}
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        className={railBtn(editor.isActive("heading", { level: 1 }))}
        title={t("editor.toolbar.heading1")}
      >
        <Heading1 className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={railBtn(editor.isActive("heading", { level: 2 }))}
        title={t("editor.toolbar.heading2")}
      >
        <Heading2 className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        className={railBtn(editor.isActive("heading", { level: 3 }))}
        title={t("editor.toolbar.heading3")}
      >
        <Heading3 className="w-4 h-4" />
      </button>

      {railDivider}

      {/* Lists */}
      <button
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={railBtn(editor.isActive("bulletList"))}
        title={`${t("editor.toolbar.bulletList")} (${MOD_LABEL}+Shift+8)`}
      >
        <List className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={railBtn(editor.isActive("orderedList"))}
        title={`${t("editor.toolbar.orderedList")} (${MOD_LABEL}+Shift+7)`}
      >
        <ListOrdered className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().toggleTaskList().run()}
        className={railBtn(editor.isActive("taskList"))}
        title={`${t("editor.toolbar.taskList")} (${MOD_LABEL}+Shift+9)`}
      >
        <ListChecks className="w-4 h-4" />
      </button>

      {railDivider}

      {/* Text alignment */}
      <div
        className="grid grid-cols-2 p-0.5 gap-0.5 rounded"
        style={{ background: "var(--tp-bg-2)", border: "1px solid var(--tp-b-2)" }}
      >
        <button
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          className={compactBtn(editor.isActive({ textAlign: "left" }))}
          title={`${t("editor.toolbar.alignLeft")} (${MOD_LABEL}+L)`}
        >
          <AlignLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          className={compactBtn(editor.isActive({ textAlign: "center" }))}
          title={`${t("editor.toolbar.alignCenter")} (${MOD_LABEL}+E)`}
        >
          <AlignCenter className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          className={compactBtn(editor.isActive({ textAlign: "right" }))}
          title={`${t("editor.toolbar.alignRight")} (${MOD_LABEL}+R)`}
        >
          <AlignRight className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().setTextAlign("justify").run()}
          className={compactBtn(editor.isActive({ textAlign: "justify" }))}
          title={`${t("editor.toolbar.alignJustify")} (${MOD_LABEL}+J)`}
        >
          <AlignJustify className="w-4 h-4" />
        </button>
      </div>

      {railDivider}

      {/* Subscript / Superscript */}
      <div
        className="grid grid-cols-2 p-0.5 gap-0.5 rounded"
        style={{ background: "var(--tp-bg-2)", border: "1px solid var(--tp-b-2)" }}
      >
        <button
          onClick={() => editor.chain().focus().toggleSubscript().run()}
          className={compactBtn(editor.isActive("subscript"))}
          title={t("editor.toolbar.subscript")}
        >
          <SubscriptIcon className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleSuperscript().run()}
          className={compactBtn(editor.isActive("superscript"))}
          title={t("editor.toolbar.superscript")}
        >
          <SuperscriptIcon className="w-4 h-4" />
        </button>
      </div>

      {railDivider}

      {/* Block formats: Quote, Horizontal rule, Clear */}
      <button
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={railBtn(editor.isActive("blockquote"))}
        title={`${t("editor.toolbar.blockquote")} (${MOD_LABEL}+Shift+B)`}
      >
        <Quote className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        className={railBtn(false)}
        title={t("editor.toolbar.horizontalRule")}
      >
        <MinusIcon className="w-4 h-4" />
      </button>
      <button
        onClick={() => {
          // Select all first to ensure clear formatting works
          editor.chain().focus().selectAll().clearNodes().unsetAllMarks().run();
        }}
        className={railBtn(false)}
        title={t("editor.toolbar.clearFormatting")}
      >
        <Eraser className="w-4 h-4" />
      </button>

      {railDivider}

      {/* Insert table */}
      <button
        onClick={onInsertCustomTable}
        className={railBtn(false)}
        title={t("editor.toolbar.insertTable")}
      >
        <TableIcon className="w-4 h-4" />
      </button>

      {railDivider}

      {/* Insert / edit link */}
      <div ref={linkWrapRef} className="relative">
        <button
          onClick={openLinkPopover}
        className={railBtn(editor.isActive("link"))}
        title={`${t("editor.toolbar.link")} (${MOD_LABEL}+K)`}
        >
          <Link2 className="w-4 h-4" />
        </button>
        {linkOpen && (() => {
          const rect = linkWrapRef.current?.getBoundingClientRect();
          const top = rect ? rect.top : 0;
          const left = rect ? rect.left - 264 : 0; // 256px width + 8px gap
          return (
            <div
              className="p-2 rounded-lg shadow-2xl flex flex-col gap-1.5"
              style={{
                position: "fixed",
                top,
                left,
                zIndex: 1000,
                width: "256px",
                background: "#222222",
                border: "1px solid #333333",
              }}
            >
              <input
                autoFocus
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    applyLink();
                  }
                }}
                placeholder={t("editor.toolbar.linkUrlPlaceholder")}
                className="w-full px-2 py-1.5 rounded bg-black/25 border border-[#3a3a3a] text-[12.5px] text-[#e5e5e5] outline-none focus:border-[#2d86a5]"
              />
              <div className="flex items-center gap-1.5">
                <button
                  onClick={applyLink}
                  className="tp-accent-btn text-white flex-1 h-7 rounded text-[12px] font-medium"
                >
                  {t("editor.toolbar.linkApply")}
                </button>
                {editor.isActive("link") && (
                  <>
                    <button
                      onClick={() => {
                        const href = editor.getAttributes("link").href;
                        if (href) {
                          void openUrl(href);
                        }
                      }}
                      className="h-7 w-7 inline-flex items-center justify-center rounded text-[#b8b8b8] hover:bg-[var(--tp-bg-4)] hover:text-[var(--tp-t-1)]"
                      title={t("editor.toolbar.linkOpen")}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={removeLink}
                      className="h-7 w-7 inline-flex items-center justify-center rounded text-[#b8b8b8] hover:bg-[var(--tp-bg-4)] hover:text-[var(--tp-t-1)]"
                      title={t("editor.toolbar.linkRemove")}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })()}
      </div>

      {railDivider}

      {/* Undo / Redo */}
      <button
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().chain().focus().undo().run()}
        className={`${railBtn(false)} disabled:opacity-40`}
        title={`${t("editor.toolbar.undo")} (${UNDO_LABEL})`}
      >
        <Undo className="w-4 h-4" />
      </button>
      <button
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().chain().focus().redo().run()}
        className={`${railBtn(false)} disabled:opacity-40`}
        title={`${t("editor.toolbar.redo")} (${REDO_LABEL})`}
      >
        <Redo className="w-4 h-4" />
      </button>
    </div>
  );
};
