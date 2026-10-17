import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { readText, writeHtml, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { DOMSerializer } from "@tiptap/pm/model";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Highlighter,
  Link2,
  Eraser,
  Scissors,
  Copy as CopyIcon,
  ClipboardPaste,
  Table as TableIcon,
  ListChecks,
  Quote,
  Minus as MinusIcon,
  TextSelect,
  Sparkles,
  Languages,
  ChevronRight,
} from "lucide-react";
import { useTranslation } from "../../i18n/useTranslation";
import { buildContextMenuClassName } from "../../utils/contextMenu";
import { snapSelectionInsideTextblock } from "../../utils/editorSelection";

export interface SelectedTextRange {
  from: number;
  to: number;
  selectedText: string;
}

export interface TableContextMenuState {
  x: number;
  y: number;
  showTableActions: boolean;
  showFormatActions: boolean;
  showInsertActions: boolean;
  aiSelection: SelectedTextRange | null;
}

interface Props {
  editor: any;
  menu: TableContextMenuState;
  onClose: () => void;
  aiEnabled: boolean;
  aiBusy: boolean;
  highlightColor: string;
  aiTranslateTargetLanguage: string | null;
  tableActionsEnabled: Record<string, boolean>;
  onInsertCustomTable: () => void;
  runAiSelectionAction: (
    mode: "rewrite" | "translate",
    selection?: SelectedTextRange | null,
    options?: { tone?: string; language?: string },
  ) => void;
}

/** Word-style, context-aware right-click menu for the lesson editor. */
export function EditorContextMenu({
  editor,
  menu,
  onClose,
  aiEnabled,
  aiBusy,
  highlightColor,
  aiTranslateTargetLanguage,
  tableActionsEnabled,
  onInsertCustomTable,
  runAiSelectionAction,
}: Props) {
  const { t } = useTranslation();
  const [rewriteSubmenuOpen, setRewriteSubmenuOpen] = useState(false);
  const [translateSubmenuOpen, setTranslateSubmenuOpen] = useState(false);
  const [clipboardHasText, setClipboardHasText] = useState(false);

  // A fresh menu instance always starts collapsed; probe the clipboard so the
  // insert menu only offers Paste when there is actually something to paste.
  useEffect(() => {
    setRewriteSubmenuOpen(false);
    setTranslateSubmenuOpen(false);
    void readText()
      .then((text) => setClipboardHasText(!!text && !!text.trim()))
      .catch(() => setClipboardHasText(false));
  }, [menu]);

  const canRunAiContextActions = !!menu.aiSelection && !aiBusy && aiEnabled;
  const contextMenuItemClass = (active = false) =>
    `w-full inline-flex items-center justify-start gap-2 text-left px-2.5 py-1 text-[12.5px] rounded hover:bg-[#2d2d2d] disabled:opacity-40 disabled:cursor-not-allowed ${
      active ? "text-[var(--tp-accent)]" : "text-gray-200"
    }`;
  const contextMenuMiniBtn = (active = false) =>
    `h-6 w-6 inline-flex items-center justify-center rounded transition-colors ${
      active
        ? "text-[var(--tp-accent)] bg-[rgba(45,134,165,0.15)]"
        : "text-gray-200 hover:bg-[#2d2d2d]"
    }`;

  const copySelectionToClipboard = async () => {
    if (!editor) return;
    const { from, to, empty } = editor.state.selection;
    if (empty) return;
    const text = editor.state.doc.textBetween(from, to, "\n", "\n");

    // Also put a rich HTML flavour on the clipboard so pasting into Word /
    // other apps keeps bold, italic, lists, etc. Falls back to text only.
    try {
      const slice = editor.state.selection.content();
      const container = document.createElement("div");
      container.appendChild(
        DOMSerializer.fromSchema(editor.schema).serializeFragment(slice.content),
      );
      await writeHtml(container.innerHTML, text);
      setClipboardHasText(true);
    } catch (error) {
      console.warn("Clipboard HTML write failed, falling back to text", error);
      try {
        await writeText(text);
        setClipboardHasText(true);
      } catch (fallbackError) {
        console.warn("Clipboard write failed", fallbackError);
      }
    }
  };

  const cutSelectionToClipboard = async () => {
    if (!editor) return;
    await copySelectionToClipboard();
    editor.chain().focus().deleteSelection().run();
  };

  const pastePlainTextFromClipboard = async () => {
    if (!editor) return;
    let text = "";
    try {
      text = (await readText()) ?? "";
    } catch (error) {
      console.warn("Clipboard read failed", error);
      return;
    }
    if (!text.trim()) return;

    snapSelectionInsideTextblock(editor);

    const pastedLines = text.replace(/\r\n?/g, "\n").split("\n");
    if (pastedLines.length > 1 && pastedLines[pastedLines.length - 1] === "") {
      pastedLines.pop();
    }

    // Single line: insert as inline text at the cursor so it lands exactly
    // where clicked instead of opening a new paragraph (Word behaviour).
    if (pastedLines.length <= 1) {
      editor.chain().focus().insertContent({ type: "text", text: pastedLines[0] ?? "" }).run();
      return;
    }

    const blocks = pastedLines.map((line) =>
      line
        ? { type: "paragraph", content: [{ type: "text", text: line }] }
        : { type: "paragraph" },
    );

    // Replace the clicked empty block instead of inserting below it, so the
    // pasted text lands exactly on the clicked line.
    const { $from } = editor.state.selection;
    const parentBlock = $from.parent;
    const grandParent = $from.depth > 0 ? $from.node($from.depth - 1) : null;
    const shouldReplaceEmptyBlock =
      parentBlock.isTextblock &&
      parentBlock.content.size === 0 &&
      !!grandParent &&
      grandParent.childCount > 1;

    const chain = editor.chain().focus();
    if (shouldReplaceEmptyBlock) {
      chain.deleteRange({ from: $from.before($from.depth), to: $from.after($from.depth) });
    }
    chain.insertContent(blocks).run();
  };

  const runTableCommand = (runner: () => boolean) => {
    if (!editor) return;
    runner();
    onClose();
  };

  return createPortal(                <div
              className={buildContextMenuClassName(
                `z-[70] print:hidden ${
                  menu.showTableActions
                    ? "min-w-[240px]"
                    : menu.showFormatActions
                      ? "min-w-[260px]"
                      : "min-w-[190px]"
                }`,
              )}
              style={{
                top: menu.y,
                left: menu.x,
                maxHeight: `calc(100vh - ${Math.max(menu.y + 8, 32)}px)`,
              }}
              onClick={(event) => event.stopPropagation()}
            >
              {menu.showFormatActions && (
                <>
                  {/* Word-style mini format bar */}
                  <div className="flex items-center gap-0.5 px-1 py-1">
                    <button
                      type="button"
                      title={t("editor.toolbar.bold")}
                      onClick={() => editor!.chain().focus().toggleBold().run()}
                      className={contextMenuMiniBtn(editor!.isActive("bold"))}
                    >
                      <Bold className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      title={t("editor.toolbar.italic")}
                      onClick={() => editor!.chain().focus().toggleItalic().run()}
                      className={contextMenuMiniBtn(editor!.isActive("italic"))}
                    >
                      <Italic className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      title={t("editor.toolbar.underline")}
                      onClick={() => editor!.chain().focus().toggleUnderline().run()}
                      className={contextMenuMiniBtn(editor!.isActive("underline"))}
                    >
                      <Underline className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      title={t("editor.toolbar.strikethrough")}
                      onClick={() => editor!.chain().focus().toggleStrike().run()}
                      className={contextMenuMiniBtn(editor!.isActive("strike"))}
                    >
                      <Strikethrough className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      title={t("editor.contextMenu.highlight")}
                      onClick={() => {
                        if (editor!.isActive("highlight")) {
                          editor!.chain().focus().unsetHighlight().run();
                        } else {
                          editor!.chain().focus().setHighlight({ color: highlightColor }).run();
                        }
                      }}
                      className={contextMenuMiniBtn(editor!.isActive("highlight"))}
                    >
                      <Highlighter className="w-3.5 h-3.5" />
                    </button>

                    <div className="w-px h-3.5 bg-[#3a3a3a] mx-0.5" aria-hidden="true" />

                    <button
                      type="button"
                      title={t("editor.toolbar.link")}
                      onClick={() => {
                        onClose();
                        window.dispatchEvent(new CustomEvent("tp:open-link-popover"));
                      }}
                      className={contextMenuMiniBtn(editor!.isActive("link"))}
                    >
                      <Link2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      title={t("editor.contextMenu.removeFormatting")}
                      onClick={() => {
                        editor!.chain().focus().unsetAllMarks().clearNodes().run();
                        onClose();
                      }}
                      className={contextMenuMiniBtn(false)}
                    >
                      <Eraser className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </>
              )}

              {menu.showFormatActions && <div className="h-px bg-[#333] my-0.5" />}

              {/* Clipboard actions — below the format bar, Word-style */}
              <button
                onClick={() => {
                  void cutSelectionToClipboard();
                  onClose();
                }}
                disabled={editor!.state.selection.empty}
                className={contextMenuItemClass(false)}
              >
                <Scissors className="w-3.5 h-3.5 shrink-0" />
                {t("editor.contextMenu.cut")}
              </button>
              <button
                onClick={() => {
                  void copySelectionToClipboard();
                  onClose();
                }}
                disabled={editor!.state.selection.empty}
                className={contextMenuItemClass(false)}
              >
                <CopyIcon className="w-3.5 h-3.5 shrink-0" />
                {t("editor.contextMenu.copy")}
              </button>
              {(!menu.showInsertActions || clipboardHasText) && (
                <button
                  onClick={() => {
                    void pastePlainTextFromClipboard();
                    onClose();
                  }}
                  className={contextMenuItemClass(false)}
                >
                  <ClipboardPaste className="w-3.5 h-3.5 shrink-0" />
                  {t("editor.contextMenu.paste")}
                </button>
              )}

              {(menu.showInsertActions ||
                menu.showTableActions ||
                (aiEnabled && menu.aiSelection)) && (
                <div className="h-px bg-[#333] my-0.5" />
              )}

              {menu.showInsertActions && (
                <>
                  <button
                    onClick={() => {
                      onClose();
                      onInsertCustomTable();
                    }}
                    className={contextMenuItemClass(false)}
                  >
                    <TableIcon className="w-3.5 h-3.5 shrink-0" />
                    {t("editor.toolbar.insertTable")}
                  </button>
                  <button
                    onClick={() => {
                      onClose();
                      editor!.chain().focus().toggleTaskList().run();
                    }}
                    className={contextMenuItemClass(false)}
                  >
                    <ListChecks className="w-3.5 h-3.5 shrink-0" />
                    {t("editor.toolbar.taskList")}
                  </button>
                  <button
                    onClick={() => {
                      onClose();
                      editor!.chain().focus().toggleBlockquote().run();
                    }}
                    className={contextMenuItemClass(false)}
                  >
                    <Quote className="w-3.5 h-3.5 shrink-0" />
                    {t("editor.toolbar.blockquote")}
                  </button>
                  <button
                    onClick={() => {
                      onClose();
                      editor!.chain().focus().setHorizontalRule().run();
                    }}
                    className={contextMenuItemClass(false)}
                  >
                    <MinusIcon className="w-3.5 h-3.5 shrink-0" />
                    {t("editor.toolbar.horizontalRule")}
                  </button>

                  <div className="h-px bg-[#333] my-0.5" />

                  <button
                    onClick={() => {
                      onClose();
                      editor!.chain().focus().selectAll().run();
                    }}
                    className={contextMenuItemClass(false)}
                  >
                    <TextSelect className="w-3.5 h-3.5 shrink-0" />
                    {t("editor.contextMenu.selectAll")}
                  </button>
                </>
              )}

              {menu.showTableActions && (
                <>
                  <button
                    onClick={() => runTableCommand(() => editor!.chain().focus().addRowBefore().run())}
                    disabled={!tableActionsEnabled.addRowBefore}
                    className="w-full text-left px-2.5 py-1 text-[12.5px] text-gray-200 hover:bg-[#2d2d2d] rounded disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {t("editor.tableContextMenu.insertRowAbove")}
                  </button>
                  <button
                    onClick={() => runTableCommand(() => editor!.chain().focus().addRowAfter().run())}
                    disabled={!tableActionsEnabled.addRowAfter}
                    className="w-full text-left px-2.5 py-1 text-[12.5px] text-gray-200 hover:bg-[#2d2d2d] rounded disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {t("editor.tableContextMenu.insertRowBelow")}
                  </button>
                  <button
                    onClick={() => runTableCommand(() => editor!.chain().focus().addColumnBefore().run())}
                    disabled={!tableActionsEnabled.addColumnBefore}
                    className="w-full text-left px-2.5 py-1 text-[12.5px] text-gray-200 hover:bg-[#2d2d2d] rounded disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {t("editor.tableContextMenu.insertColumnLeft")}
                  </button>
                  <button
                    onClick={() => runTableCommand(() => editor!.chain().focus().addColumnAfter().run())}
                    disabled={!tableActionsEnabled.addColumnAfter}
                    className="w-full text-left px-2.5 py-1 text-[12.5px] text-gray-200 hover:bg-[#2d2d2d] rounded disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {t("editor.tableContextMenu.insertColumnRight")}
                  </button>

                  <div className="h-px bg-[#333] my-0.5" />
                </>
              )}

              {aiEnabled && menu.aiSelection && (
                <>
                  {/* ── Rewrite submenu ─────────────────────────────────── */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setRewriteSubmenuOpen((v) => !v);
                      setTranslateSubmenuOpen(false);
                    }}
                    disabled={!canRunAiContextActions}
                    className="w-full inline-flex items-center justify-between gap-2 text-left px-2.5 py-1 text-[12.5px] text-gray-200 hover:bg-[#2d2d2d] rounded disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-[var(--tp-accent)]" />
                      {t("editor.aiMenu.aiRewrite")}
                    </span>
                    <ChevronRight className={`w-3.5 h-3.5 text-gray-400 transition-transform ${rewriteSubmenuOpen ? "rotate-90" : ""}`} />
                  </button>
                  {rewriteSubmenuOpen && (
                    <div className="ml-5 flex flex-col">
                      {(
                        [
                          { tone: "improve",  label: t("editor.aiMenu.improve") },
                          { tone: "formal",   label: t("editor.aiMenu.moreFormal") },
                          { tone: "casual",   label: t("editor.aiMenu.moreCasual") },
                          { tone: "simple",   label: t("editor.aiMenu.simpler") },
                          { tone: "engaging", label: t("editor.aiMenu.moreEngaging") },
                          { tone: "concise",  label: t("editor.aiMenu.moreConcise") },
                        ] as const
                      ).map(({ tone, label }) => (
                        <button
                          key={tone}
                          onClick={() => {
                            onClose();
                            setRewriteSubmenuOpen(false);
                            void runAiSelectionAction("rewrite", menu!.aiSelection, { tone });
                          }}
                          disabled={!canRunAiContextActions}
                          className="w-full text-left px-2.5 py-1 text-[12.5px] text-gray-300 hover:bg-[#2d2d2d] rounded disabled:opacity-40 disabled:cursor-not-allowed"
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
                    className="w-full inline-flex items-center justify-between gap-2 text-left px-2.5 py-1 text-[12.5px] text-gray-200 hover:bg-[#2d2d2d] rounded disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Languages className="w-3.5 h-3.5 text-[var(--tp-accent)]" />
                      {t("editor.aiMenu.aiTranslate")}
                    </span>
                    <ChevronRight className={`w-3.5 h-3.5 text-gray-400 transition-transform ${translateSubmenuOpen ? "rotate-90" : ""}`} />
                  </button>
                  {translateSubmenuOpen && (
                    <div className="ml-5 flex flex-col">
                      {/* configured language first */}
                      {aiTranslateTargetLanguage && (
                        <button
                          onClick={() => {
                            onClose();
                            setTranslateSubmenuOpen(false);
                            void runAiSelectionAction("translate", menu!.aiSelection, { language: aiTranslateTargetLanguage });
                          }}
                          disabled={!canRunAiContextActions}
                          className="w-full text-left px-2.5 py-1 text-[12.5px] text-[var(--tp-accent)] hover:bg-[#2d2d2d] rounded disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {aiTranslateTargetLanguage} ★
                        </button>
                      )}
                      {(
                        [
                          { code: "en", name: "English" },
                          { code: "fr", name: "French" },
                          { code: "es", name: "Spanish" },
                          { code: "de", name: "German" },
                          { code: "el", name: "Greek" },
                          { code: "it", name: "Italian" },
                          { code: "pt", name: "Portuguese" },
                          { code: "nl", name: "Dutch" },
                          { code: "ru", name: "Russian" },
                          { code: "ar", name: "Arabic" },
                          { code: "ja", name: "Japanese" },
                          { code: "zh", name: "Chinese (Simplified)" },
                        ] as const
                      )
                        .filter(({ name }) => name !== aiTranslateTargetLanguage)
                        .map(({ code, name }) => (
                          <button
                            key={code}
                            onClick={() => {
                              onClose();
                              setTranslateSubmenuOpen(false);
                              void runAiSelectionAction("translate", menu!.aiSelection, { language: name });
                            }}
                            disabled={!canRunAiContextActions}
                            className="w-full text-left px-2.5 py-1 text-[12.5px] text-gray-300 hover:bg-[#2d2d2d] rounded disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {t(`languages.${code}`)}
                          </button>
                        ))}
                    </div>
                  )}
                </>
              )}

              {menu.showTableActions && aiEnabled && <div className="h-px bg-[#333] my-0.5" />}

              {menu.showTableActions && (
                <>
                  <button
                    onClick={() => runTableCommand(() => editor!.chain().focus().deleteRow().run())}
                    disabled={!tableActionsEnabled.deleteRow}
                    className="w-full text-left px-2.5 py-1 text-[12.5px] text-gray-200 hover:bg-[#2d2d2d] rounded disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {t("editor.tableContextMenu.deleteRow")}
                  </button>
                  <button
                    onClick={() => runTableCommand(() => editor!.chain().focus().deleteColumn().run())}
                    disabled={!tableActionsEnabled.deleteColumn}
                    className="w-full text-left px-2.5 py-1 text-[12.5px] text-gray-200 hover:bg-[#2d2d2d] rounded disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {t("editor.tableContextMenu.deleteColumn")}
                  </button>
                  <button
                    onClick={() => runTableCommand(() => editor!.chain().focus().deleteTable().run())}
                    disabled={!tableActionsEnabled.deleteTable}
                    className="w-full text-left px-2.5 py-1 text-[12.5px] text-red-300 hover:bg-[#2d2d2d] rounded disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {t("editor.tableContextMenu.deleteTable")}
                  </button>

                  <div className="h-px bg-[#333] my-0.5" />

                  <button
                    onClick={() => runTableCommand(() => editor!.chain().focus().mergeCells().run())}
                    disabled={!tableActionsEnabled.mergeCells}
                    className="w-full text-left px-2.5 py-1 text-[12.5px] text-gray-200 hover:bg-[#2d2d2d] rounded disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {t("editor.tableContextMenu.mergeCells")}
                  </button>
                  <button
                    onClick={() => runTableCommand(() => editor!.chain().focus().splitCell().run())}
                    disabled={!tableActionsEnabled.splitCell}
                    className="w-full text-left px-2.5 py-1 text-[12.5px] text-gray-200 hover:bg-[#2d2d2d] rounded disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {t("editor.tableContextMenu.splitCell")}
                  </button>
                  <button
                    onClick={() => runTableCommand(() => editor!.chain().focus().toggleHeaderRow().run())}
                    disabled={!tableActionsEnabled.toggleHeaderRow}
                    className="w-full text-left px-2.5 py-1 text-[12.5px] text-gray-200 hover:bg-[#2d2d2d] rounded disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {t("editor.tableContextMenu.toggleHeaderRow")}
                  </button>
                  <button
                    onClick={() => runTableCommand(() => editor!.chain().focus().toggleHeaderColumn().run())}
                    disabled={!tableActionsEnabled.toggleHeaderColumn}
                    className="w-full text-left px-2.5 py-1 text-[12.5px] text-gray-200 hover:bg-[#2d2d2d] rounded disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {t("editor.tableContextMenu.toggleHeaderColumn")}
                  </button>
                </>
              )}
            </div>,
    document.body,
  );
}