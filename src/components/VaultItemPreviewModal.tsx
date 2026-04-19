import { useEffect, useMemo, useRef, useState } from "react";
import { X, FileText, Network, Calendar, User, BookOpen } from "lucide-react";
import { join } from "@tauri-apps/api/path";
import { exists, readTextFile } from "@tauri-apps/plugin-fs";
import { useAppStore, type LessonData, type MindmapData } from "../store";
import {
  ReactFlow,
  Background,
  Controls,
  Node,
  Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

interface Props {
  open: boolean;
  itemType: "lesson" | "mindmap";
  relativePath: string | null;
  onClose: () => void;
}

// Simple HTML renderer for TipTap lesson content
function renderTipTapContent(content: any): string {
  if (!content || typeof content !== "object") return "";
  
  if (Array.isArray(content)) {
    return content.map(renderTipTapContent).join("");
  }
  
  if (content.type === "text") {
    let text = escapeHtml(content.text || "");
    if (content.marks) {
      for (const mark of content.marks) {
        if (mark.type === "bold") text = `<strong>${text}</strong>`;
        else if (mark.type === "italic") text = `<em>${text}</em>`;
        else if (mark.type === "underline") text = `<u>${text}</u>`;
        else if (mark.type === "strike") text = `<s>${text}</s>`;
        else if (mark.type === "code") text = `<code>${text}</code>`;
        else if (mark.type === "highlight") {
          const color = mark.attrs?.color || "#fbbf24";
          text = `<mark style="background:${color};padding:2px 4px;border-radius:3px;">${text}</mark>`;
        }
      }
    }
    return text;
  }
  
  const attrs = content.attrs || {};
  switch (content.type) {
    case "paragraph":
      return `<p style="margin:0.5em 0;">${renderTipTapContent(content.content)}</p>`;
    case "heading":
      const level = attrs.level || 1;
      const sizes = ["1.75em", "1.5em", "1.25em", "1.1em", "1em", "0.9em"];
      return `<h${level} style="margin:0.75em 0 0.5em;font-size:${sizes[level-1]};font-weight:600;">${renderTipTapContent(content.content)}</h${level}>`;
    case "bulletList":
      return `<ul style="margin:0.5em 0;padding-left:1.5em;">${renderTipTapContent(content.content)}</ul>`;
    case "orderedList":
      return `<ol style="margin:0.5em 0;padding-left:1.5em;">${renderTipTapContent(content.content)}</ol>`;
    case "listItem":
      return `<li style="margin:0.25em 0;">${renderTipTapContent(content.content)}</li>`;
    case "blockquote":
      return `<blockquote style="margin:0.5em 0;padding-left:1em;border-left:3px solid var(--tp-accent, #60a5fa);color:var(--tp-t-3,#9ca3af);">${renderTipTapContent(content.content)}</blockquote>`;
    case "horizontalRule":
      return `<hr style="margin:1em 0;border:none;border-top:1px solid var(--tp-b-1,#374151);" />`;
    case "hardBreak":
      return "<br />";
    case "table":
      return `<table style="width:100%;border-collapse:collapse;margin:0.5em 0;">${renderTipTapContent(content.content)}</table>`;
    case "tableRow":
      return `<tr>${renderTipTapContent(content.content)}</tr>`;
    case "tableCell":
      const cellTag = attrs.header ? "th" : "td";
      const cellStyle = attrs.header 
        ? "padding:8px;border:1px solid var(--tp-b-1,#374151);background:var(--tp-bg-2,#232323);font-weight:600;text-align:left;"
        : "padding:8px;border:1px solid var(--tp-b-1,#374151);";
      return `<${cellTag} style="${cellStyle}">${renderTipTapContent(content.content)}</${cellTag}>`;
    case "tableHeader":
      return `<th style="padding:8px;border:1px solid var(--tp-b-1,#374151);background:var(--tp-bg-2,#232323);font-weight:600;text-align:left;">${renderTipTapContent(content.content)}</th>`;
    default:
      return renderTipTapContent(content.content);
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

export function VaultItemPreviewModal({ open, itemType, relativePath, onClose }: Props) {
  const { vaultPath } = useAppStore();
  const [lessonData, setLessonData] = useState<LessonData | null>(null);
  const [mindmapData, setMindmapData] = useState<MindmapData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const modalRef = useRef<HTMLDivElement | null>(null);

  const fileName = useMemo(() => {
    if (!relativePath) return "Preview";
    return relativePath.split("/").pop()?.replace(/\.json$/i, "") || relativePath;
  }, [relativePath]);

  // Load content when modal opens
  useEffect(() => {
    if (!open || !relativePath || !vaultPath) {
      setLessonData(null);
      setMindmapData(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const rootFolder = itemType === "lesson" ? "Lesson Plans" : "Mindmaps";
        const segs = relativePath.split("/").filter(Boolean);
        const fullPath = await join(vaultPath, rootFolder, ...segs);

        const present = await exists(fullPath);
        if (!present) {
          if (!cancelled) setError("File not found in vault.");
          return;
        }

        const text = await readTextFile(fullPath);
        const data = JSON.parse(text);

        if (itemType === "lesson") {
          if (!cancelled) setLessonData(data as LessonData);
        } else {
          if (!cancelled) setMindmapData(data as MindmapData);
        }
      } catch (err) {
        console.error("Failed to load preview:", err);
        if (!cancelled) setError("Could not load preview: " + String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, relativePath, vaultPath, itemType]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey, true);
    requestAnimationFrame(() => modalRef.current?.focus());
    return () => {
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open, onClose]);

  // Generate lesson HTML
  const lessonHtml = useMemo(() => {
    if (!lessonData?.content) return "";
    return renderTipTapContent(lessonData.content);
  }, [lessonData]);

  // Format metadata dates
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Not set";
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString(undefined, { 
        weekday: "short", 
        year: "numeric", 
        month: "short", 
        day: "numeric" 
      });
    } catch {
      return dateStr;
    }
  };

  if (!open || !relativePath) return null;

  const Icon = itemType === "lesson" ? FileText : Network;
  const typeLabel = itemType === "lesson" ? "Lesson Plan" : "Mindmap";

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/65 p-6 flex items-center justify-center"
      onMouseDown={onClose}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="tp-preview-surface w-full max-w-4xl h-[85vh] rounded-xl shadow-2xl overflow-hidden flex flex-col"
        style={{ background: "#161616", border: "1px solid #333" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="h-12 px-4 flex items-center justify-between shrink-0"
          style={{ borderBottom: "1px solid #333" }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-1.5 rounded-md bg-[var(--tp-accent)]/10 text-[var(--tp-accent)]">
              <Icon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm text-gray-200 font-medium truncate">{fileName}</div>
              <div className="text-xs text-gray-500">{typeLabel}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-[#232323] rounded-md transition-colors"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {loading && (
            <div className="h-full flex items-center justify-center text-gray-400">
              Loading preview...
            </div>
          )}

          {error && (
            <div className="h-full flex items-center justify-center text-red-300 p-6">
              {error}
            </div>
          )}

          {/* Lesson Preview */}
          {!loading && !error && itemType === "lesson" && lessonData && (
            <div className="p-6">
              {/* Metadata Card */}
              <div 
                className="rounded-lg p-4 mb-6"
                style={{ background: "var(--tp-bg-2, #1e1e1e)", border: "1px solid var(--tp-b-1, #2d2d2d)" }}
              >
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-gray-500" />
                    <div>
                      <div className="text-xs text-gray-500">Teacher</div>
                      <div className="text-sm text-gray-200">{lessonData.metadata?.teacher || "Not set"}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-gray-500" />
                    <div>
                      <div className="text-xs text-gray-500">Subject</div>
                      <div className="text-sm text-gray-200">{lessonData.metadata?.subject || "Not set"}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-500" />
                    <div>
                      <div className="text-xs text-gray-500">Created</div>
                      <div className="text-sm text-gray-200">{formatDate(lessonData.metadata?.createdAt)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-500" />
                    <div>
                      <div className="text-xs text-gray-500">Planned For</div>
                      <div className="text-sm text-gray-200">{formatDate(lessonData.metadata?.plannedFor)}</div>
                    </div>
                  </div>
                </div>
                {lessonData.notes && (
                  <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--tp-b-1, #2d2d2d)" }}>
                    <div className="text-xs text-gray-500 mb-1">Notes</div>
                    <div className="text-sm text-gray-300 whitespace-pre-wrap">{lessonData.notes}</div>
                  </div>
                )}
              </div>

              {/* Lesson Content */}
              <div 
                className="rounded-lg p-6"
                style={{ background: "var(--tp-bg-2, #1e1e1e)", border: "1px solid var(--tp-b-1, #2d2d2d)" }}
              >
                <div 
                  className="prose prose-invert max-w-none"
                  style={{ color: "var(--tp-t-1, #e5e7eb)" }}
                  dangerouslySetInnerHTML={{ __html: lessonHtml }}
                />
              </div>
            </div>
          )}

          {/* Mindmap Preview */}
          {!loading && !error && itemType === "mindmap" && mindmapData && (
            <div className="h-full">
              <MindmapPreview nodes={mindmapData.nodes} edges={mindmapData.edges} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Read-only mindmap preview component
function MindmapPreview({ nodes, edges }: { nodes: any[]; edges: any[] }) {
  const [rfNodes, setRfNodes] = useState<Node[]>([]);
  const [rfEdges, setRfEdges] = useState<Edge[]>([]);

  useEffect(() => {
    // Convert mindmap data to ReactFlow format
    const convertedNodes: Node[] = (nodes || []).map((n: any) => ({
      id: n.id || String(Math.random()),
      position: { x: n.position?.x || 0, y: n.position?.y || 0 },
      data: { 
        label: n.data?.label || "Untitled",
        style: n.data?.style || {}
      },
      style: {
        background: n.data?.style?.backgroundColor || "#2d2d2d",
        color: n.data?.style?.color || "#e5e7eb",
        border: "1px solid #404040",
        borderRadius: "8px",
        padding: "10px 14px",
        fontSize: "14px",
        fontWeight: 500,
        minWidth: 120,
        ...n.data?.style,
      },
    }));

    const convertedEdges: Edge[] = (edges || []).map((e: any) => ({
      id: e.id || `${e.source}-${e.target}`,
      source: e.source,
      target: e.target,
      style: { stroke: "#60a5fa", strokeWidth: 2 },
      type: "smoothstep",
    }));

    setRfNodes(convertedNodes);
    setRfEdges(convertedEdges);
  }, [nodes, edges]);

  if (rfNodes.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        No nodes in this mindmap
      </div>
    );
  }

  return (
    <div className="h-full w-full" style={{ minHeight: "400px" }}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnScroll={true}
        panOnScroll={true}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#404040" gap={16} size={1} />
        <Controls className="!bg-[#1e1e1e] !border-[#333]" />
      </ReactFlow>
    </div>
  );
}
