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

const COLOR_PRESETS = [
  "#111111", "#475569", "#94a3b8", "#ffffff", "#dc2626",
  "#ea580c", "#f59e0b", "#fef08a", "#16a34a", "#0d9488",
  "#2563eb", "#4f46e5", "#9333ea", "#db2777", "#64748b",
];

export const MenuBar = ({
  editor,
  onInsertCustomTable,
  lastHighlightColor,
  lastTextColor,
  lastUnderlineColor,
  onHighlightColorChange,
  onTextColorChange,
  onUnderlineColorChange,
}: {
  editor: any;
  onInsertCustomTable: () => void;
  lastHighlightColor: string;
  lastTextColor: string | null;
  lastUnderlineColor: string | null;
  onHighlightColorChange: (color: string) => void;
  onTextColorChange: (color: string) => void;
  onUnderlineColorChange: (color: string) => void;
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
  const [palette, setPalette] = useState<{ kind: "text" | "underline" | "highlight"; top: number; left: number } | null>(null);
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

  // Close the colour palette on outside click / Escape.
  useEffect(() => {
    if (!palette) return;
    const onDown = (e: MouseEvent) => {
      const el = document.getElementById("tp-rail-color-palette");
      if (el && !el.contains(e.target as Node)) {
        setPalette(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPalette(null);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [palette]);

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
    lastUnderlineColor ?? defaultTextColor,
  );
  const currentHighlightColor = normalizeColorForPicker(
    editor.getAttributes("highlight").color,
    lastHighlightColor,
  );

  // Clicking a color button applies the last-used color; right-click opens
  // the picker. The selection's own color always wins for the swatch.
  const appliedTextColor = lastTextColor ?? defaultTextColor;
  const appliedUnderlineColor = lastUnderlineColor ?? defaultTextColor;

  // All typography settings live on the shared 	extStyle mark. A bare
  // setMark call replaces the mark and wipes its other attributes, so every
  // change here merges with the current attributes instead.
  const applyTextStyleAttrs = (attrs: Record<string, unknown>) => {
    const current = editor.getAttributes("textStyle");
    editor.chain().focus().setMark("textStyle", { ...current, ...attrs }).run();
  };
  const clearTextStyleAttr = (attr: string) => {
    const current = editor.getAttributes("textStyle");
    editor.chain().focus().setMark("textStyle", { ...current, [attr]: null }).removeEmptyTextStyle().run();
  };

  const applyUnderlineColor = (color: string) => {
    if (!editor.isActive("underline")) {
      editor.chain().focus().toggleUnderline().run();
    }
    applyTextStyleAttrs({ underlineColor: color });
  };

  const readableInk = (hex: string) => {
    const match = /^#([0-9a-f]{6})$/i.exec(hex);
    if (!match) return "#f8f8f8";
    const value = parseInt(match[1], 16);
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? "#111111" : "#f5f5f5";
  };

  const openPalette = (
    kind: "text" | "underline" | "highlight",
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    setPalette({
      kind,
      top: Math.min(Math.max(8, rect.top - 8), window.innerHeight - 140),
      left: Math.max(8, rect.left - 138),
    });
  };

  const applyPaletteColor = (color: string) => {
    if (!palette) return;
    if (palette.kind === "text") {
      onTextColorChange(color);
      applyTextStyleAttrs({ color });
    } else if (palette.kind === "underline") {
      onUnderlineColorChange(color);
      applyUnderlineColor(color);
    } else {
      onHighlightColorChange(color);
      editor.chain().focus().setHighlight({ color }).run();
    }
    setPalette(null);
  };

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
                      applyTextStyleAttrs({ fontSize: size });
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
                    {isSelected && <span className="text-[11px]">●</span>}
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
                      <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-[#6b7280]">
                        {option.group}
                      </div>
                    )}
                    <button
                      onClick={() => {
                        if (option.value) {
                          applyTextStyleAttrs({ fontFamily: option.value });
                        } else {
                          clearTextStyleAttr("fontFamily");
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
                      {isSelected && <span className="text-[11px]">●</span>}
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
        <div className="flex gap-0.5 relative">
          <button
            type="button"
            onClick={() => applyTextStyleAttrs({ color: appliedTextColor })}
            onContextMenu={(event) => openPalette("text", event)}
            className="tp-rail-color-btn inline-flex items-center justify-center h-6 w-6 rounded cursor-pointer relative text-[11px] font-bold"
            title={t("editor.toolbar.textColorToggle")}
            style={{ background: currentTextColor, color: readableInk(currentTextColor) }}
          >
            A
          </button>

          <button
            onClick={() => clearTextStyleAttr("color")}
            className="h-6 w-6 rounded text-[11px] font-semibold tp-rail-btn"
            title={t("editor.toolbar.resetTextColor")}
          >
            A-
          </button>
        </div>
        <div className="flex gap-0.5 relative">
          <button
            type="button"
            onClick={() => applyUnderlineColor(appliedUnderlineColor)}
            onContextMenu={(event) => openPalette("underline", event)}
            className="tp-rail-color-btn inline-flex items-center justify-center h-6 w-6 rounded cursor-pointer relative text-[11px] font-bold"
            title={t("editor.toolbar.underlineColorToggle")}
            style={{ background: currentUnderlineColor, color: readableInk(currentUnderlineColor) }}
          >
            U
          </button>

          <button
            onClick={() => clearTextStyleAttr("underlineColor")}
            className="h-6 w-6 rounded text-[11px] font-semibold tp-rail-btn"
            title={t("editor.toolbar.resetUnderlineColor")}
          >
            U-
          </button>
        </div>
        <div className="flex gap-0.5">
          <button
            type="button"
            onClick={() => {
              if (editor.isActive("highlight")) {
                editor.chain().focus().unsetHighlight().run();
              } else {
                editor.chain().focus().setHighlight({ color: lastHighlightColor }).run();
              }
            }}
            onContextMenu={(event) => openPalette("highlight", event)}
            className="tp-rail-color-btn inline-flex items-center justify-center h-6 w-6 rounded cursor-pointer relative text-[11px] font-bold hover:brightness-125"
            title={t("editor.toolbar.highlightToggle")}
            style={{ background: currentHighlightColor, color: readableInk(currentHighlightColor) }}
          >
            H
          </button>

          <button
            onClick={() => editor.chain().focus().unsetHighlight().run()}
            className="h-6 w-6 rounded text-[11px] font-semibold tp-rail-btn"
            title={t("editor.toolbar.clearHighlight")}
          >
            H-
          </button>
        </div>
      </div>

      {palette && (
        <div
          id="tp-rail-color-palette"
          className="fixed z-[1000] p-1.5 rounded-lg shadow-2xl"
          style={{
            top: palette.top,
            left: palette.left,
            background: "#222222",
            border: "1px solid #333333",
            width: "130px",
          }}
        >
          <div className="grid grid-cols-5 gap-1">
            {COLOR_PRESETS.map((color) => (
              <button
                key={color}
                type="button"
                title={color}
                onClick={() => applyPaletteColor(color)}
                className="h-[20px] w-[20px] rounded border border-[#444] hover:scale-110 transition-transform"
                style={{ background: color }}
              />
            ))}
          </div>
        </div>
      )}

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
