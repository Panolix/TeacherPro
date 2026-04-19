import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { join } from "@tauri-apps/api/path";
import { convertFileSrc } from "@tauri-apps/api/core";
import { exists, readFile, readTextFile } from "@tauri-apps/plugin-fs";
import { useAppStore } from "../store";

type PreviewKind = "pdf" | "image" | "text" | null;

interface Props {
  open: boolean;
  relativePath: string | null;
  onClose: () => void;
}

export function MaterialPreviewModal({ open, relativePath, onClose }: Props) {
  const { vaultPath } = useAppStore();
  const [src, setSrc] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);

  const fileName = useMemo(() => {
    if (!relativePath) return "Material";
    return relativePath.split("/").pop() || relativePath;
  }, [relativePath]);

  const extension = useMemo(() => {
    return (fileName.split(".").pop() || "").toLowerCase();
  }, [fileName]);

  const previewKind = useMemo<PreviewKind>(() => {
    if (extension === "pdf") return "pdf";
    if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"].includes(extension)) return "image";
    if (["txt", "md", "json", "csv", "log", "js", "jsx", "ts", "tsx", "html", "css", "yml", "yaml"].includes(extension)) return "text";
    return null;
  }, [extension]);

  // Cleanup blob URL on unmount / change
  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  // Load preview content whenever modal opens for a new file
  useEffect(() => {
    if (!open || !relativePath || !vaultPath) {
      return;
    }

    let cancelled = false;
    (async () => {
      setError(null);
      setSrc(null);
      setText(null);
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        setBlobUrl(null);
      }

      const segs = relativePath.split("/").filter(Boolean);
      const fullPath = await join(vaultPath, "Materials", ...segs);

      try {
        const present = await exists(fullPath);
        if (!present) {
          if (!cancelled) setError("File not found in vault.");
          return;
        }

        if (previewKind === "pdf") {
          const bytes = await readFile(fullPath);
          const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
          const url = URL.createObjectURL(blob);
          if (!cancelled) {
            setBlobUrl(url);
            setSrc(url);
          } else {
            URL.revokeObjectURL(url);
          }
        } else if (previewKind === "image") {
          if (!cancelled) setSrc(convertFileSrc(fullPath));
        } else if (previewKind === "text") {
          const content = await readTextFile(fullPath);
          if (!cancelled) setText(content);
        } else {
          if (!cancelled) setError("This file type can't be previewed in the app. Use Open in Default App.");
        }
      } catch (err) {
        console.error("Failed to load preview", err);
        if (!cancelled) setError("Could not load file: " + String(err));
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, relativePath, vaultPath, previewKind]);

  // Esc to close + reclaim focus from PDF iframe
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const reclaimFocus = () => {
      requestAnimationFrame(() => {
        const active = document.activeElement;
        if (active && active.tagName === "IFRAME") {
          (active as HTMLIFrameElement).blur();
          modalRef.current?.focus();
        }
      });
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", reclaimFocus, true);
    requestAnimationFrame(() => modalRef.current?.focus());
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", reclaimFocus, true);
    };
  }, [open, onClose]);

  if (!open || !relativePath) return null;

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/65 p-6 flex items-center justify-center"
      onMouseDown={onClose}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="tp-preview-surface w-full max-w-5xl h-[88vh] rounded-xl shadow-2xl overflow-hidden flex flex-col"
        style={{ background: "#161616", border: "1px solid #333" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          className="h-11 px-4 flex items-center justify-between shrink-0"
          style={{ borderBottom: "1px solid #333" }}
        >
          <div className="text-sm text-gray-200 font-medium truncate">{fileName}</div>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-200 hover:bg-[#232323] rounded"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4">
          {error && <div className="text-sm text-red-300">{error}</div>}
          {!error && previewKind === "pdf" && src && (
            <iframe src={src} className="w-full h-full min-h-[70vh] rounded-md bg-white" title={fileName} />
          )}
          {!error && previewKind === "image" && src && (
            <div className="w-full h-full flex items-center justify-center">
              <img
                src={src}
                alt={fileName}
                className="max-w-full max-h-[72vh] object-contain rounded-md"
              />
            </div>
          )}
          {!error && previewKind === "text" && (
            <pre className="whitespace-pre-wrap break-words text-sm text-gray-200 leading-relaxed bg-[#101010] border border-[#2d2d2d] rounded-md p-4">
              {text || "(Empty file)"}
            </pre>
          )}
          {!error && previewKind === null && (
            <div className="text-sm" style={{ color: "var(--tp-t-3)" }}>
              No in-app preview available for <code style={{ color: "var(--tp-t-1)" }}>{`.${extension}`}</code> files. Use{" "}
              <strong>Open in Default App</strong> from the right-click menu.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
