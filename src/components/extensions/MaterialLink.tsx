import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { File, ExternalLink, Trash2, Folder, Eye, FolderOpen, X } from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { join } from "@tauri-apps/api/path";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { exists, readFile, readTextFile } from "@tauri-apps/plugin-fs";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../../store";

interface LinkContextMenuState {
  x: number;
  y: number;
}

const MaterialLinkComponent = (props: NodeViewProps) => {
  const { vaultPath } = useAppStore();
  const filePath = String(props.node.attrs.filePath ?? props.node.attrs.fileName ?? "");
  const fileName = filePath ? filePath.split("/").pop() || filePath : "Material";
  const itemType = props.node.attrs.itemType === "folder" ? "folder" : "file";
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtmlSrc, setPreviewHtmlSrc] = useState<string | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<LinkContextMenuState | null>(null);
  const previewModalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      if (previewBlobUrl) {
        URL.revokeObjectURL(previewBlobUrl);
      }
    };
  }, [previewBlobUrl]);

  useEffect(() => {
    const closeMenu = () => setContextMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
        setPreviewOpen(false);
        if (previewBlobUrl) {
          URL.revokeObjectURL(previewBlobUrl);
          setPreviewBlobUrl(null);
        }
      }
    };

    window.addEventListener("click", closeMenu);
    window.addEventListener("keydown", closeOnEscape, true);

    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", closeOnEscape, true);
    };
  }, [previewBlobUrl]);

  useEffect(() => {
    if (!previewOpen) {
      return;
    }

    requestAnimationFrame(() => {
      previewModalRef.current?.focus();
    });
  }, [previewOpen]);

  const extension = useMemo(() => {
    const ext = fileName.split(".").pop();
    return (ext || "").toLowerCase();
  }, [fileName]);

  const previewKind = useMemo<"pdf" | "image" | "text" | null>(() => {
    if (itemType === "folder") {
      return null;
    }

    if (extension === "pdf") {
      return "pdf";
    }

    if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(extension)) {
      return "image";
    }

    if (["txt", "md", "json", "csv", "log", "js", "jsx", "ts", "tsx", "html", "css"].includes(extension)) {
      return "text";
    }

    return null;
  }, [extension, itemType]);

  const resolveMaterialPath = async (): Promise<string | null> => {
    if (!vaultPath || !filePath) {
      return null;
    }

    const pathSegments = filePath.split("/").filter(Boolean);
    return join(vaultPath, "Materials", ...pathSegments);
  };

  const handleOpen = async () => {
    const fullPath = await resolveMaterialPath();
    if (!fullPath) return;

    try {
      const isPresent = await exists(fullPath);
      if (!isPresent) {
        alert(`Material path not found: ${filePath}`);
        return;
      }
      await invoke("open_file_in_default_app", { path: fullPath });
    } catch (error) {
      console.error("Failed to open file", error);
      alert("Could not open this material item in the default app.");
    }
  };

  const handleReveal = async () => {
    const fullPath = await resolveMaterialPath();
    if (!fullPath) return;

    try {
      const isPresent = await exists(fullPath);
      if (!isPresent) {
        alert(`Material path not found: ${filePath}`);
        return;
      }
      await revealItemInDir(fullPath);
    } catch (error) {
      console.error("Failed to reveal file", error);
      alert("Could not reveal this item in your file manager.");
    }
  };

  const handlePreview = async () => {
    const fullPath = await resolveMaterialPath();
    if (!fullPath) return;

    setPreviewError(null);
    setPreviewHtmlSrc(null);
    setPreviewText(null);
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
      setPreviewBlobUrl(null);
    }

    try {
      const isPresent = await exists(fullPath);
      if (!isPresent) {
        setPreviewError(`Material path not found: ${filePath}`);
        setPreviewOpen(true);
        return;
      }

      if (!previewKind) {
        setPreviewError("Preview is not available for this file type.");
        setPreviewOpen(true);
        return;
      }

      if (previewKind === "text") {
        const content = await readTextFile(fullPath);
        setPreviewText(content);
        setPreviewOpen(true);
        return;
      }

      if (previewKind === "pdf") {
        const bytes = await readFile(fullPath);
        const blobUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
        setPreviewBlobUrl(blobUrl);
        setPreviewHtmlSrc(blobUrl);
        setPreviewOpen(true);
        return;
      }

      setPreviewHtmlSrc(convertFileSrc(fullPath));
      setPreviewOpen(true);
    } catch (error) {
      console.error("Failed to preview file", error);
      setPreviewError("Could not load a preview for this item.");
      setPreviewOpen(true);
    }
  };

  const handleDelete = () => {
    props.deleteNode();
  };

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ x: event.clientX, y: event.clientY });
  };

  const closeContextMenu = () => setContextMenu(null);

  const closePreview = () => {
    setPreviewOpen(false);
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
      setPreviewBlobUrl(null);
    }
  };

  return (
    <NodeViewWrapper className="inline-block my-2 mx-1">
      <div
        onContextMenu={handleContextMenu}
        className="flex items-center gap-3 px-3 py-2 bg-[#222] border border-[#333] rounded-lg group hover:border-[color:var(--tp-accent)] transition-all shadow-sm"
        title={filePath || fileName}
      >
        {itemType === "folder" ? (
          <Folder className="w-4 h-4 text-[var(--tp-accent)]" />
        ) : (
          <File className="w-4 h-4 text-[var(--tp-accent)]" />
        )}
        <span
          className="text-sm text-gray-200 font-medium truncate max-w-[180px] sm:max-w-[260px]"
          title={filePath || fileName}
        >
          {fileName}
        </span>

        <div className="flex items-center gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => {
              closeContextMenu();
              void handlePreview();
            }}
            className="p-1 hover:bg-[#333] rounded text-gray-400 hover:text-[var(--tp-accent)] transition-colors"
            title="Preview"
          >
            <Eye className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              closeContextMenu();
              void handleOpen();
            }}
            className="p-1 hover:bg-[#333] rounded text-gray-400 hover:text-[var(--tp-accent)] transition-colors"
            title="Open in default app"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              closeContextMenu();
              void handleReveal();
            }}
            className="p-1 hover:bg-[#333] rounded text-gray-400 hover:text-[var(--tp-accent)] transition-colors"
            title="Show in file manager"
          >
            <FolderOpen className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleDelete}
            className="p-1 hover:bg-[#333] rounded text-gray-400 hover:text-red-400 transition-colors"
            title="Remove link"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {contextMenu && (
        <div
          className="fixed z-[85] min-w-[180px] rounded-md border border-[#3a3a3a] bg-[#1f1f1f] p-1 shadow-xl"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            onClick={() => {
              closeContextMenu();
              void handlePreview();
            }}
            className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-[#2d2d2d] rounded"
          >
            Preview
          </button>
          <button
            onClick={() => {
              closeContextMenu();
              void handleOpen();
            }}
            className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-[#2d2d2d] rounded"
          >
            Open
          </button>
          <button
            onClick={() => {
              closeContextMenu();
              void handleReveal();
            }}
            className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-[#2d2d2d] rounded"
          >
            Show In File Manager
          </button>
          <button
            onClick={() => {
              closeContextMenu();
              handleDelete();
            }}
            className="w-full text-left px-3 py-2 text-sm text-red-300 hover:bg-[#2d2d2d] rounded"
          >
            Remove Link
          </button>
        </div>
      )}

      {previewOpen && (
        <div
          className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-6"
          onClick={() => {
            closeContextMenu();
            closePreview();
          }}
        >
          <div
            ref={previewModalRef}
            tabIndex={-1}
            className="w-full max-w-5xl max-h-[88vh] bg-[#151515] border border-[#333] rounded-xl shadow-2xl overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="h-11 border-b border-[#333] px-4 flex items-center justify-between">
              <div className="text-sm text-gray-200 font-medium truncate">{fileName}</div>
              <button
                onClick={closePreview}
                className="p-1 text-gray-400 hover:text-gray-200 hover:bg-[#232323] rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 h-[calc(88vh-44px)] overflow-auto">
              {previewError && <div className="text-sm text-red-300">{previewError}</div>}

              {!previewError && previewKind === "pdf" && previewHtmlSrc && (
                <iframe src={previewHtmlSrc} className="w-full h-full min-h-[70vh] rounded-md bg-white" title={fileName} />
              )}

              {!previewError && previewKind === "image" && previewHtmlSrc && (
                <div className="w-full h-full flex items-center justify-center">
                  <img src={previewHtmlSrc} alt={fileName} className="max-w-full max-h-[72vh] object-contain rounded-md" />
                </div>
              )}

              {!previewError && previewKind === "text" && (
                <pre className="whitespace-pre-wrap break-words text-sm text-gray-200 leading-relaxed bg-[#101010] border border-[#2d2d2d] rounded-md p-4">
                  {previewText || "(Empty file)"}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </NodeViewWrapper>
  );
};

export const MaterialLink = Node.create({
  name: "materialLink",
  group: "inline",
  inline: true,
  selectable: true,
  draggable: true,
  atom: true,

  addAttributes() {
    return {
      fileName: {
        default: null,
      },
      filePath: {
        default: null,
      },
      itemType: {
        default: "file",
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "material-link",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["material-link", mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MaterialLinkComponent);
  },
});
