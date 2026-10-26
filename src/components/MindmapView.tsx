import { useState, useCallback, useEffect, useRef } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  Handle,
  Position,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  Node,
  Edge,
  Connection,
  NodeProps,
  NodeTypes,
  ReactFlowInstance,
  getNodesBounds,
  NodeChange,
  EdgeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useAppStore } from "../store";
import { Eye, Plus, Save, Printer, Download, X, FolderOpen, ExternalLink } from "lucide-react";
import { useTranslation } from "../i18n/useTranslation";
import { join } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { exists, readFile, readTextFile } from "@tauri-apps/plugin-fs";
import { createImageBlobUrl } from "../utils/filePreview";
import {
  createPdfBlobUrl,
  printCurrentWindow,
  printPdfBlobUrl,
  renderElementToPdfBytes,
  PdfExportError,
  describePdfRenderError,
  PRINT_PDF_PIXEL_RATIO,
  revokePdfBlobUrl,
  savePdfToVault,
} from "../utils/pdfExport";
import { buildContextMenuClassName, clampContextMenuPosition } from "../utils/contextMenu";
import { registerCloseFlusher } from "../utils/closeFlush";
import { type as osType } from "@tauri-apps/plugin-os";

type ContextTarget =
  | { kind: "pane"; position: { x: number; y: number } }
  | { kind: "node"; nodeId: string; position: { x: number; y: number } };

interface ContextMenuState {
  x: number;
  y: number;
  target: ContextTarget;
}

interface NodeColorPreset {
  id: string;
  label: string;
  style: Record<string, string>;
}

interface MaterialDropPayload {
  relativePath: string;
  itemType: "file" | "folder";
}

type MaterialPreviewKind = "pdf" | "image" | "text" | "error";

interface MaterialPreviewState {
  title: string;
  kind: MaterialPreviewKind;
  src?: string;
  text?: string;
  message?: string;
  blobUrl?: string;
}

function normalizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  const shortHex = trimmed.match(/^#([0-9a-fA-F]{3})$/);
  if (shortHex) {
    const [r, g, b] = shortHex[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }

  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  return fallback;
}

function clampColorChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function shiftHexColor(hexColor: string, offset: number): string {
  const normalized = normalizeHexColor(hexColor, "#2d2d2d");
  const r = clampColorChannel(Number.parseInt(normalized.slice(1, 3), 16) + offset);
  const g = clampColorChannel(Number.parseInt(normalized.slice(3, 5), 16) + offset);
  const b = clampColorChannel(Number.parseInt(normalized.slice(5, 7), 16) + offset);
  return `#${[r, g, b].map((chunk) => chunk.toString(16).padStart(2, "0")).join("")}`;
}

function getReadableTextColor(hexColor: string): string {
  const normalized = normalizeHexColor(hexColor, "#2d2d2d");
  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness >= 160 ? "#111827" : "#ffffff";
}

function buildNodeColorStyle(backgroundColor: string): Record<string, string> {
  const normalizedBackground = normalizeHexColor(backgroundColor, "#2d2d2d");
  const textColor = getReadableTextColor(normalizedBackground);
  const borderOffset = textColor === "#ffffff" ? -26 : -16;

  return {
    background: normalizedBackground,
    color: textColor,
    border: `1px solid ${shiftHexColor(normalizedBackground, borderOffset)}`,
  };
}

const NODE_STYLE = {
  background: "#2d2d2d",
  color: "#e5e5e5",
  border: "1px solid #444",
  borderRadius: "8px",
  padding: "10px 20px",
  fontSize: "13px",
};

const MATERIAL_NODE_STYLE = {
  background: "#f8fafc",
  color: "#111827",
  border: "1px solid #94a3b8",
  borderRadius: "8px",
  padding: "10px 14px",
  fontSize: "13px",
  width: "220px",
  maxWidth: "240px",
  whiteSpace: "normal",
  wordBreak: "break-word" as const,
};

// The default React Flow node only exposes connection points on the top and
// bottom. Give mindmap nodes one on each side so they can be wired in any
// direction while keeping the existing top/bottom handles as the fallback for
// edges created before this change.
function MindmapNodeCard({ data }: NodeProps) {
  const label = typeof data.label === "string" ? data.label : "";
  return (
    <>
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="target" position={Position.Left} id="left" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="source" position={Position.Right} id="right" />
      <div className="pointer-events-none select-none text-center">{label}</div>
    </>
  );
}

const mindmapNodeTypes = { default: MindmapNodeCard } satisfies NodeTypes;

const NODE_COLOR_PRESETS: NodeColorPreset[] = [
  {
    id: "slate",
    label: "Slate",
    style: buildNodeColorStyle("#2d2d2d"),
  },
  {
    id: "blue",
    label: "Blue",
    style: buildNodeColorStyle("#2d86a5"),
  },
  {
    id: "emerald",
    label: "Emerald",
    style: buildNodeColorStyle("#059669"),
  },
  {
    id: "amber",
    label: "Amber",
    style: buildNodeColorStyle("#d97706"),
  },
  {
    id: "rose",
    label: "Rose",
    style: buildNodeColorStyle("#e11d48"),
  },
  {
    id: "violet",
    label: "Violet",
    style: buildNodeColorStyle("#7c3aed"),
  },
  {
    id: "teal",
    label: "Teal",
    style: buildNodeColorStyle("#0f766e"),
  },
  {
    id: "indigo",
    label: "Indigo",
    style: buildNodeColorStyle("#4338ca"),
  },
  {
    id: "sky",
    label: "Sky",
    style: buildNodeColorStyle("#0ea5e9"),
  },
  {
    id: "lime",
    label: "Lime",
    style: buildNodeColorStyle("#65a30d"),
  },
  {
    id: "coral",
    label: "Coral",
    style: buildNodeColorStyle("#f97316"),
  },
  {
    id: "light",
    label: "Light",
    style: buildNodeColorStyle("#f8fafc"),
  },
];

function getNodeLabel(node: Node, fallbackLabel = "New Idea"): string {
  const label = node.data?.label;
  return typeof label === "string" ? label : fallbackLabel;
}

function hasTransferType(dataTransfer: DataTransfer, type: string): boolean {
  return Array.from(dataTransfer.types || []).includes(type);
}

function hasMaterialDropData(dataTransfer: DataTransfer): boolean {
  return (
    hasTransferType(dataTransfer, "application/teacherpro-material") ||
    hasTransferType(dataTransfer, "application/teacherpro-file") ||
    hasTransferType(dataTransfer, "text/plain") ||
    hasTransferType(dataTransfer, "text")
  );
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
        itemType?: "file" | "folder";
      };
      relativePath = parsed.relativePath || "";
      itemType =
        parsed.isDirectory || parsed.itemType === "folder" ? "folder" : "file";
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

function getMaterialMetaFromNode(
  node: Node | undefined,
): { relativePath: string; itemType: "file" | "folder" } | null {
  if (!node || !node.data) {
    return null;
  }

  const relativePath = typeof node.data.materialPath === "string" ? node.data.materialPath : "";
  if (!relativePath) {
    return null;
  }

  const itemType = node.data.materialItemType === "folder" ? "folder" : "file";
  return { relativePath, itemType };
}

function findAvailablePosition(
  preferred: { x: number; y: number } | undefined,
  existingNodes: Node[],
): { x: number; y: number } {
  const fallbackBase = {
    x: 250 + existingNodes.length * 25,
    y: 150 + existingNodes.length * 20,
  };
  const base = preferred ?? fallbackBase;

  const overlaps = (candidate: { x: number; y: number }) =>
    existingNodes.some(
      (node) =>
        Math.abs(node.position.x - candidate.x) < 140 &&
        Math.abs(node.position.y - candidate.y) < 90,
    );

  if (!overlaps(base)) {
    return base;
  }

  for (let ring = 1; ring <= 8; ring += 1) {
    for (let i = 0; i < 8; i += 1) {
      const angle = (Math.PI / 4) * i;
      const candidate = {
        x: base.x + Math.cos(angle) * ring * 180,
        y: base.y + Math.sin(angle) * ring * 120,
      };

      if (!overlaps(candidate)) {
        return candidate;
      }
    }
  }

  return {
    x: base.x + 180,
    y: base.y + 120,
  };
}

export function MindmapView() {
  const {
    activeMindmapContent,
    saveMindmapAtPath,
    activeFilePath,
    createNewMindmap,
    vaultPath,
    draggedMaterial,
    setDraggedMaterial,
    pendingMaterialDrop,
    setPendingMaterialDrop,
    logDebug,
    setDocumentSaveState,
  } = useAppStore();
  const { t } = useTranslation();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<Node, Edge> | null>(null);
  const [isPdfBusy, setIsPdfBusy] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [customNodeColor, setCustomNodeColor] = useState("#2d2d2d");
  const [materialPreview, setMaterialPreview] = useState<MaterialPreviewState | null>(null);
  const pdfPreviewRef = useRef<HTMLDivElement | null>(null);
  const materialPreviewRef = useRef<HTMLDivElement | null>(null);
  const mindmapSurfaceRef = useRef<HTMLDivElement | null>(null);

  const setMaterialPreviewState = useCallback((next: MaterialPreviewState | null) => {
    setMaterialPreview((previous) => {
      if (previous?.blobUrl) {
        URL.revokeObjectURL(previous.blobUrl);
      }
      return next;
    });
  }, []);

  // Editing state for Tauri (since window.prompt is blocked)
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  // The graph state that was last handed to saveActiveMindmap. The store
  // echoes it back via activeMindmapContent once the write completes; without
  // this check the echo would reset the graph and discard edits made while
  // the save was still writing.
  const lastSavedNodesRef = useRef<Node[] | null>(null);
  const lastSavedEdgesRef = useRef<Edge[] | null>(null);

  // ── Autosave machinery (mirrors the lesson editor) ──
  // Mindmaps previously only saved via the explicit save button, so a crash
  // or hard window close discarded every unsaved node edit.
  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  useEffect(() => {
    nodesRef.current = nodes;
    edgesRef.current = edges;
  });
  const mindmapSaveTimerRef = useRef<number | null>(null);
  const mindmapDirtyRef = useRef(false);
  // Serialized graph state that matches the last persisted version (updated
  // on load, on save, and on flush) — the dirty check compares against it.
  const mindmapSnapshotRef = useRef<string>("");
  // Mirrors the lesson editor's revision guard: graph edits that happen while
  // a save is in flight must keep the document dirty.
  const mindmapRevisionRef = useRef(0);
  // The vault path whose graph the component currently holds (bound at load,
  // like the lesson editor's autosavePathRef). Flushes must target this path —
  // reading the live store during a switch would write the outgoing graph
  // into the incoming document.
  const mindmapPathRef = useRef<string | null>(null);

  const flushMindmapAutosave = useCallback((): Promise<boolean> => {
    if (mindmapSaveTimerRef.current !== null) {
      window.clearTimeout(mindmapSaveTimerRef.current);
      mindmapSaveTimerRef.current = null;
    }
    // The flush target is the path this component's graph belongs to (bound
    // at load, like the lesson editor's autosavePathRef) — NOT the store's
    // live activeFilePath, which may already point at a different document
    // when this flush runs on a switch/unmount/close.
    const path = mindmapPathRef.current;
    if (!path || !mindmapDirtyRef.current) {
      return Promise.resolve(true);
    }
    const nodesSnapshot = nodesRef.current;
    const edgesSnapshot = edgesRef.current;
    const snapshot = JSON.stringify({ nodes: nodesSnapshot, edges: edgesSnapshot });
    if (snapshot === mindmapSnapshotRef.current) {
      mindmapDirtyRef.current = false;
      setDocumentSaveState("saved");
      return Promise.resolve(true);
    }
    // Pre-register the echo guard so the store's echo of THIS save is
    // recognized by the sync effect (mirrors handleSave below).
    lastSavedNodesRef.current = nodesSnapshot;
    lastSavedEdgesRef.current = edgesSnapshot;
    const revisionAtStart = mindmapRevisionRef.current;
    setDocumentSaveState("saving");
    return saveMindmapAtPath(path, nodesSnapshot, edgesSnapshot, { silent: true }).then((ok) => {
      if (!ok) {
        setDocumentSaveState("error");
        return false;
      }
      if (mindmapRevisionRef.current !== revisionAtStart) {
        setDocumentSaveState("dirty");
        window.setTimeout(() => {
          void flushMindmapAutosave();
        }, 600);
        return false;
      }
      mindmapSnapshotRef.current = snapshot;
      mindmapDirtyRef.current = false;
      setDocumentSaveState("saved");
      return true;
    });
  }, [saveMindmapAtPath, setDocumentSaveState]);

  // Keep the flush target bound to the live active path (renames move it);
  // bound here — like the lesson editor's autosavePathRef — so flushes never
  // write the outgoing graph into a different document.
  useEffect(() => {
    if (mindmapPathRef.current !== activeFilePath) {
      mindmapPathRef.current = activeFilePath;
    }
  }, [activeFilePath]);

  // Register the flush for the window-close flow (App.tsx runs the registry
  // before confirming the close).
  useEffect(() => {
    return registerCloseFlusher(() => flushMindmapAutosave());
  }, [flushMindmapAutosave]);

  // Flush the outgoing mindmap when switching views, switching mindmaps, or
  // unmounting. Cleanups run before any new effects load the incoming graph,
  // so the refs still hold the outgoing document here.
  useEffect(() => {
    return () => {
      void flushMindmapAutosave();
    };
  }, [activeFilePath, flushMindmapAutosave]);

  // ── Undo/redo for graph mutations ──
  // Structural edits (add/delete/connect/color/rename, Delete-key removal)
  // snapshot the pre-mutation graph onto the past stack; undo moves the live
  // graph to the future stack and applies the past top (and vice versa), so
  // every step restores exactly one mutation. Position drags are intentionally
  // not snapshotted (noisy, non-destructive).
  const pastRef = useRef<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const futureRef = useRef<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const HISTORY_LIMIT = 50;

  const pushHistory = useCallback(() => {
    // Deleting a node fires remove changes for both nodes and edges in the
    // same synchronous pass — both handlers would push the identical
    // pre-mutation graph, making the first undo a no-op. Skip duplicates by
    // comparing against the last pushed snapshot.
    const last = pastRef.current[pastRef.current.length - 1];
    if (last && last.nodes === nodesRef.current && last.edges === edgesRef.current) {
      return;
    }
    pastRef.current.push({ nodes: nodesRef.current, edges: edgesRef.current });
    if (pastRef.current.length > HISTORY_LIMIT) {
      pastRef.current.shift();
    }
    // A new mutation invalidates everything that could have been redone.
    futureRef.current = [];
  }, []);

  const undo = useCallback(() => {
    const entry = pastRef.current.pop();
    if (!entry) {
      return;
    }
    futureRef.current.push({ nodes: nodesRef.current, edges: edgesRef.current });
    setNodes(entry.nodes);
    setEdges(entry.edges);
    // An undo changes the graph — it must persist like any other edit.
    mindmapDirtyRef.current = true;
  }, []);

  const redo = useCallback(() => {
    const entry = futureRef.current.pop();
    if (!entry) {
      return;
    }
    pastRef.current.push({ nodes: nodesRef.current, edges: edgesRef.current });
    setNodes(entry.nodes);
    setEdges(entry.edges);
    mindmapDirtyRef.current = true;
  }, []);

  // Ctrl+Z / Ctrl+Y (and Ctrl+Shift+Z). Ignored while typing in inputs or
  // the node-rename field so text editing keeps its native undo behavior.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if (key === "y") {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // Sync state when active file changes
  useEffect(() => {
    if (activeMindmapContent) {
      if (
        lastSavedNodesRef.current &&
        activeMindmapContent.nodes === lastSavedNodesRef.current &&
        activeMindmapContent.edges === lastSavedEdgesRef.current
      ) {
        // Echo of our own save — keep the live graph state.
        return;
      }
      lastSavedNodesRef.current = null;
      lastSavedEdgesRef.current = null;
      mindmapPathRef.current = activeFilePath;
      setNodes(activeMindmapContent.nodes || []);
      setEdges(activeMindmapContent.edges || []);
      // Seed the dirty-check baseline with the loaded content and reset the
      // undo history — a freshly opened mindmap has nothing to undo.
      mindmapSnapshotRef.current = JSON.stringify({
        nodes: activeMindmapContent.nodes || [],
        edges: activeMindmapContent.edges || [],
      });
      mindmapDirtyRef.current = false;
      pastRef.current = [];
      futureRef.current = [];
    } else {
      lastSavedNodesRef.current = null;
      lastSavedEdgesRef.current = null;
      mindmapPathRef.current = null;
      setNodes([]);
      setEdges([]);
      mindmapSnapshotRef.current = "";
      mindmapDirtyRef.current = false;
      mindmapRevisionRef.current = 0;
      setDocumentSaveState("saved");
      pastRef.current = [];
      futureRef.current = [];
    }
  }, [activeMindmapContent, setDocumentSaveState]);

  // Debounced autosave: schedule 1.8s after the last graph mutation, mirroring
  // the lesson editor's cadence. Skips load/echo passes via the snapshot.
  useEffect(() => {
    if (!activeFilePath) {
      return;
    }
    const snapshot = JSON.stringify({ nodes, edges });
    if (snapshot === mindmapSnapshotRef.current) {
      return;
    }
    mindmapDirtyRef.current = true;
    mindmapRevisionRef.current += 1;
    setDocumentSaveState("dirty");
    if (mindmapSaveTimerRef.current !== null) {
      window.clearTimeout(mindmapSaveTimerRef.current);
    }
    mindmapSaveTimerRef.current = window.setTimeout(() => {
      mindmapSaveTimerRef.current = null;
      void flushMindmapAutosave();
    }, 1800);
  }, [nodes, edges, activeFilePath, flushMindmapAutosave]);

  useEffect(() => {
    const closeContextMenu = () => setContextMenu(null);
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContextMenu(null);
        setEditingNodeId(null);
        setPdfPreviewUrl(null);
        setMaterialPreviewState(null);
      }
    };

    window.addEventListener("click", closeContextMenu);
    window.addEventListener("keydown", onEscape);

    return () => {
      window.removeEventListener("click", closeContextMenu);
      window.removeEventListener("keydown", onEscape);
    };
  }, [setMaterialPreviewState]);

  useEffect(() => {
    return () => {
      revokePdfBlobUrl(pdfPreviewUrl);
    };
  }, [pdfPreviewUrl]);

  useEffect(() => {
    return () => {
      if (materialPreview?.blobUrl) {
        URL.revokeObjectURL(materialPreview.blobUrl);
      }
    };
  }, [materialPreview]);

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

  useEffect(() => {
    if (!materialPreview) {
      return;
    }

    requestAnimationFrame(() => {
      materialPreviewRef.current?.focus();
    });
  }, [materialPreview]);

  useEffect(() => {
    if (!contextMenu || contextMenu.target.kind !== "node") {
      return;
    }

    const { nodeId } = contextMenu.target;
    const node = nodes.find((item) => item.id === nodeId);
    if (!node || getMaterialMetaFromNode(node)) {
      return;
    }

    const nodeBackground = normalizeHexColor(node.style?.background, "#2d2d2d");
    setCustomNodeColor(nodeBackground);
  }, [contextMenu, nodes]);

  const onNodesChange = useCallback(
    (changes: NodeChange<Node>[]) => {
      if (changes.some((change) => change.type === "remove")) {
        pushHistory();
      }
      setNodes((nds) => applyNodeChanges(changes, nds));
    },
    [pushHistory],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      if (changes.some((change) => change.type === "remove")) {
        pushHistory();
      }
      setEdges((eds) => applyEdgeChanges(changes, eds));
    },
    [pushHistory],
  );
  const onConnect = useCallback((params: Connection) => {
    if (!params.source || !params.target) {
      return;
    }

    if (params.source === params.target) {
      return;
    }

    pushHistory();
    setEdges((existing) => {
      const duplicate = existing.some(
        (edge) => edge.source === params.source && edge.target === params.target,
      );

      if (duplicate) {
        return existing;
      }

      return addEdge(
        {
          ...params,
          type: "smoothstep",
          style: { stroke: "#666", strokeWidth: 1.5 },
        },
        existing,
      );
    });
  }, [pushHistory]);

  const handleSave = () => {
    if (!activeFilePath) {
      return;
    }
    const snapshot = JSON.stringify({ nodes, edges });
    const revisionAtStart = mindmapRevisionRef.current;
    lastSavedNodesRef.current = nodes;
    lastSavedEdgesRef.current = edges;
    setDocumentSaveState("saving");
    void saveMindmapAtPath(activeFilePath, nodes, edges).then((ok) => {
      if (!ok) {
        setDocumentSaveState("error");
        return;
      }
      if (mindmapRevisionRef.current === revisionAtStart) {
        mindmapSnapshotRef.current = snapshot;
        mindmapDirtyRef.current = false;
        setDocumentSaveState("saved");
      } else {
        setDocumentSaveState("dirty");
      }
    });
  };

  const addNodeAt = useCallback((preferredPosition?: { x: number; y: number }) => {
    pushHistory();
    setNodes((existing) => {
      const position = findAvailablePosition(preferredPosition, existing);
      const newNode: Node = {
        id: `${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        data: { label: t("mindmap.newIdea") },
        position,
        style: { ...NODE_STYLE },
      };

      return existing.concat(newNode);
    });
  }, [pushHistory, t]);

  const handleAddNode = () => {
    addNodeAt();
  };

  const resolveMaterialAbsolutePath = useCallback(
    async (relativePath: string): Promise<string | null> => {
      if (!vaultPath) {
        return null;
      }

      return join(vaultPath, "Materials", ...relativePath.split("/").filter(Boolean));
    },
    [vaultPath],
  );

  const openMaterialItem = useCallback(
    async (relativePath: string) => {
      const absolutePath = await resolveMaterialAbsolutePath(relativePath);
      if (!absolutePath) {
        return;
      }

      const isPresent = await exists(absolutePath);
      if (!isPresent) {
        alert(t("mindmap.alerts.materialPathNotFound", { path: relativePath }));
        return;
      }

      await invoke("open_file_in_default_app", { path: absolutePath });
    },
    [resolveMaterialAbsolutePath],
  );

  const revealMaterialItem = useCallback(
    async (relativePath: string) => {
      const absolutePath = await resolveMaterialAbsolutePath(relativePath);
      if (!absolutePath) {
        return;
      }

      const isPresent = await exists(absolutePath);
      if (!isPresent) {
        alert(t("mindmap.alerts.materialPathNotFound", { path: relativePath }));
        return;
      }

      await invoke("reveal_item_in_file_manager", { path: absolutePath });
    },
    [resolveMaterialAbsolutePath],
  );

  const previewMaterialItem = useCallback(
    async (relativePath: string, itemType: "file" | "folder") => {
      const fileName = relativePath.split("/").pop() || relativePath;
      if (itemType === "folder") {
        setMaterialPreviewState({
          title: fileName,
          kind: "error",
          message: t("mindmap.alerts.folderPreviewNotAvailable"),
        });
        return;
      }

      const extension = (fileName.split(".").pop() || "").toLowerCase();
      const absolutePath = await resolveMaterialAbsolutePath(relativePath);
      if (!absolutePath) {
        setMaterialPreviewState({
          title: fileName,
          kind: "error",
          message: t("mindmap.alerts.pleaseOpenVault"),
        });
        return;
      }

      const isPresent = await exists(absolutePath);
      if (!isPresent) {
        setMaterialPreviewState({
          title: fileName,
          kind: "error",
          message: t("mindmap.alerts.materialPathNotFound", { path: relativePath }),
        });
        return;
      }

      if (extension === "pdf") {
        const bytes = await readFile(absolutePath);
        const blobUrl = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
        setMaterialPreviewState({
          title: fileName,
          kind: "pdf",
          src: blobUrl,
          blobUrl,
        });
        return;
      }

      if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(extension)) {
        const blobUrl = await createImageBlobUrl(absolutePath);
        setMaterialPreviewState({
          title: fileName,
          kind: "image",
          src: blobUrl,
          blobUrl,
        });
        return;
      }

      if (["txt", "md", "json", "csv", "log", "js", "jsx", "ts", "tsx", "html", "css"].includes(extension)) {
        const text = await readTextFile(absolutePath);
        setMaterialPreviewState({
          title: fileName,
          kind: "text",
          text,
        });
        return;
      }

      setMaterialPreviewState({
        title: fileName,
        kind: "error",
        message: t("mindmap.alerts.previewNotAvailable"),
      });
    },
    [resolveMaterialAbsolutePath, setMaterialPreviewState],
  );

  const addMaterialNodeAt = useCallback(
    (
      payload: MaterialDropPayload,
      preferredPosition?: { x: number; y: number },
      sourceNodeId?: string,
    ) => {
      pushHistory();
      const fileName = payload.relativePath.split("/").pop() || payload.relativePath;
      const nodeId = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      setNodes((existing) => {
        const position = findAvailablePosition(preferredPosition, existing);
        const nodeLabel = payload.itemType === "folder"
          ? t("mindmap.materialNode.folder", { name: fileName })
          : t("mindmap.materialNode.material", { name: fileName });
        const newNode: Node = {
          id: nodeId,
          data: {
            label: nodeLabel,
            materialPath: payload.relativePath,
            materialItemType: payload.itemType,
          },
          position,
          style: { ...MATERIAL_NODE_STYLE },
        };

        return existing.concat(newNode);
      });

      if (sourceNodeId) {
        setEdges((existing) =>
          addEdge(
            {
              id: `e-${sourceNodeId}-${nodeId}`,
              source: sourceNodeId,
              target: nodeId,
              type: "smoothstep",
              style: { stroke: "#666", strokeWidth: 1.5 },
            },
            existing,
          ),
        );
      }
    },
    [pushHistory, t],
  );

  const handleMaterialDragOver = useCallback(
    (event: React.DragEvent) => {
      if (draggedMaterial || hasMaterialDropData(event.dataTransfer)) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }
    },
    [draggedMaterial],
  );

  const handleMaterialDrop = useCallback(
    (event: React.DragEvent) => {
      if (!flowInstance) {
        return;
      }

      const payload =
        getMaterialDropPayload(event.dataTransfer) ||
        (draggedMaterial
          ? {
              relativePath: draggedMaterial.relativePath,
              itemType: draggedMaterial.isDirectory ? "folder" : "file",
            }
          : null);
      if (!payload) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const flowPosition = flowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const targetElement = (event.target as HTMLElement | null)?.closest(".react-flow__node");
      const sourceNodeId = targetElement?.getAttribute("data-id") || undefined;

      const sourceNode = sourceNodeId ? nodes.find((node) => node.id === sourceNodeId) : undefined;
      const preferredPosition = sourceNode
        ? { x: sourceNode.position.x + 240, y: sourceNode.position.y }
        : flowPosition;

      addMaterialNodeAt(payload, preferredPosition, sourceNodeId);
      setDraggedMaterial(null);
      setPendingMaterialDrop(null);
      logDebug(
        "mindmap",
        sourceNodeId ? "material-drop-linked" : "material-drop-node",
        `${payload.relativePath} -> ${sourceNodeId || "new"}`,
      );
    },
    [
      addMaterialNodeAt,
      draggedMaterial,
      flowInstance,
      logDebug,
      nodes,
      setDraggedMaterial,
      setPendingMaterialDrop,
    ],
  );

  // Window-level fallback for drag/drop. WebView2 can swallow the drop before
  // it reaches React Flow's wrapper; the sidebar already records the dragged
  // material in the store, so pointer hit-testing is enough to finish the drop.
  useEffect(() => {
    const onWindowDragOver = (event: DragEvent) => {
      if (!useAppStore.getState().draggedMaterial) {
        return;
      }
      const surface = mindmapSurfaceRef.current;
      if (!surface) {
        return;
      }
      const rect = surface.getBoundingClientRect();
      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      if (inside) {
        event.preventDefault();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = "copy";
        }
      }
    };

    const onWindowDrop = (event: DragEvent) => {
      const active = useAppStore.getState().draggedMaterial;
      if (!active || !flowInstance) {
        return;
      }
      const surface = mindmapSurfaceRef.current;
      if (!surface) {
        return;
      }
      const rect = surface.getBoundingClientRect();
      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      if (!inside) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const flowPosition = flowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      const targetElement = (document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null)
        ?.closest(".react-flow__node") as HTMLElement | null;
      const sourceNodeId = targetElement?.getAttribute("data-id") || undefined;
      const sourceNode = sourceNodeId
        ? nodes.find((node) => node.id === sourceNodeId)
        : undefined;
      const preferredPosition = sourceNode
        ? { x: sourceNode.position.x + 240, y: sourceNode.position.y }
        : flowPosition;

      addMaterialNodeAt(
        {
          relativePath: active.relativePath,
          itemType: active.isDirectory ? "folder" : "file",
        },
        preferredPosition,
        sourceNodeId,
      );
      setDraggedMaterial(null);
      setPendingMaterialDrop(null);
      logDebug(
        "mindmap",
        sourceNodeId ? "material-drop-window-linked" : "material-drop-window",
        active.relativePath,
      );
    };

    window.addEventListener("dragover", onWindowDragOver, true);
    window.addEventListener("drop", onWindowDrop, true);
    return () => {
      window.removeEventListener("dragover", onWindowDragOver, true);
      window.removeEventListener("drop", onWindowDrop, true);
    };
  }, [
    addMaterialNodeAt,
    flowInstance,
    logDebug,
    nodes,
    setDraggedMaterial,
    setPendingMaterialDrop,
  ]);

  useEffect(() => {
    if (!flowInstance || !pendingMaterialDrop) {
      return;
    }

    const { clientX, clientY, relativePath, isDirectory } = pendingMaterialDrop;
    const shouldInsertAtCursor = clientX < 0 || clientY < 0;

    const surface = mindmapSurfaceRef.current;
    if (shouldInsertAtCursor) {
      const payload = {
        relativePath,
        itemType: isDirectory ? ("folder" as const) : ("file" as const),
      };
      const rect = surface?.getBoundingClientRect();
      const center = rect
        ? flowInstance.screenToFlowPosition({
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          })
        : undefined;
      addMaterialNodeAt(payload, center);
      logDebug("mindmap", "double-click-insert-success", relativePath);
      setDraggedMaterial(null);
      setPendingMaterialDrop(null);
      return;
    }

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
      logDebug("mindmap", "drag-end-fallback-outside", `${relativePath} | x=${clientX},y=${clientY}`);
      setPendingMaterialDrop(null);
      return;
    }

    const flowPosition = flowInstance.screenToFlowPosition({
      x: clientX,
      y: clientY,
    });

    addMaterialNodeAt(
      {
        relativePath,
        itemType: isDirectory ? "folder" : "file",
      },
      flowPosition,
    );

    logDebug("mindmap", "drag-end-fallback-success", `${relativePath} | x=${clientX},y=${clientY}`);
    setDraggedMaterial(null);
    setPendingMaterialDrop(null);
  }, [
    addMaterialNodeAt,
    flowInstance,
    logDebug,
    pendingMaterialDrop,
    setDraggedMaterial,
    setPendingMaterialDrop,
  ]);

  const onNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const materialMeta = getMaterialMetaFromNode(node);
      if (materialMeta) {
        void previewMaterialItem(materialMeta.relativePath, materialMeta.itemType);
        return;
      }

      setEditingNodeId(node.id);
      setEditValue(getNodeLabel(node, t("mindmap.newIdea")));
    },
    [previewMaterialItem, t],
  );

  const saveEdit = () => {
    if (editingNodeId && editValue.trim() !== "") {
      pushHistory();
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === editingNodeId) {
            return { ...n, data: { ...n.data, label: editValue } };
          }
          return n;
        }),
      );
    }
    setEditingNodeId(null);
  };

  const handlePaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (!flowInstance) {
        return;
      }

      const flowPosition = flowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const { x, y } = clampContextMenuPosition(event.clientX + 6, event.clientY + 6, {
        estimatedWidth: 220,
        estimatedHeight: 60,
      });

      setContextMenu({
        x,
        y,
        target: { kind: "pane", position: flowPosition },
      });
    },
    [flowInstance],
  );

  const handleNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    event.stopPropagation();

    const isMaterialNode = Boolean(getMaterialMetaFromNode(node));
    const estimatedHeight = isMaterialNode ? 230 : 390;
    const { x, y } = clampContextMenuPosition(event.clientX + 6, event.clientY + 6, {
      estimatedWidth: 280,
      estimatedHeight,
    });

    setContextMenu({
      x,
      y,
      target: { kind: "node", nodeId: node.id, position: node.position },
    });
  }, []);

  const handleAddFromContextMenu = () => {
    if (!contextMenu) {
      return;
    }

    const target = contextMenu.target;

    if (target.kind === "pane") {
      addNodeAt(target.position);
      setContextMenu(null);
      return;
    }

    const sourceNode = nodes.find((node) => node.id === target.nodeId);
    const preferred = sourceNode
      ? { x: sourceNode.position.x + 220, y: sourceNode.position.y }
      : target.position;
    const position = findAvailablePosition(preferred, nodes);
    const newNode: Node = {
      id: `${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      data: { label: t("mindmap.newIdea") },
      position,
      style: { ...NODE_STYLE },
    };

    pushHistory();
    setNodes((existing) => existing.concat(newNode));
    setEdges((existing) =>
      addEdge(
        {
          id: `e-${target.nodeId}-${newNode.id}`,
          source: target.nodeId,
          target: newNode.id,
          type: "smoothstep",
          style: { stroke: "#666", strokeWidth: 1.5 },
        },
        existing,
      ),
    );
    setContextMenu(null);
  };

  const handleRenameFromContextMenu = () => {
    if (!contextMenu || contextMenu.target.kind !== "node") {
      return;
    }

    const target = contextMenu.target;

    const node = nodes.find((n) => n.id === target.nodeId);
    if (!node) {
      return;
    }

    const materialMeta = getMaterialMetaFromNode(node);
    if (materialMeta) {
      setContextMenu(null);
      void previewMaterialItem(materialMeta.relativePath, materialMeta.itemType);
      return;
    }

    setEditingNodeId(node.id);
    setEditValue(getNodeLabel(node, t("mindmap.newIdea")));
    setContextMenu(null);
  };

  const handleDeleteFromContextMenu = () => {
    if (!contextMenu || contextMenu.target.kind !== "node") {
      return;
    }

    const { nodeId } = contextMenu.target;
    pushHistory();
    setNodes((existing) => existing.filter((node) => node.id !== nodeId));
    setEdges((existing) =>
      existing.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
    );
    setContextMenu(null);
  };

  const handleApplyNodeColor = (preset: NodeColorPreset) => {
    if (!contextMenu || contextMenu.target.kind !== "node") {
      return;
    }

    const { nodeId } = contextMenu.target;
    pushHistory();
    setNodes((existing) =>
      existing.map((node) => {
        if (node.id !== nodeId) {
          return node;
        }

        if (getMaterialMetaFromNode(node)) {
          return node;
        }

        return {
          ...node,
          style: {
            ...(node.style || {}),
            ...preset.style,
            borderRadius: "8px",
            padding: "10px 20px",
          },
        };
      }),
    );
    setContextMenu(null);
  };

  const handleApplyCustomNodeColor = () => {
    handleApplyNodeColor({
      id: "custom",
      label: "Custom",
      style: buildNodeColorStyle(customNodeColor),
    });
  };

  let contextNode: Node | undefined;
  if (contextMenu && contextMenu.target.kind === "node") {
    const { nodeId } = contextMenu.target;
    contextNode = nodes.find((node) => node.id === nodeId);
  }
  const contextMaterialMeta = getMaterialMetaFromNode(contextNode);

  const handlePreviewMaterialFromContextMenu = async () => {
    if (!contextMaterialMeta) {
      return;
    }

    setContextMenu(null);
    await previewMaterialItem(contextMaterialMeta.relativePath, contextMaterialMeta.itemType);
  };

  const handleOpenMaterialFromContextMenu = async () => {
    if (!contextMaterialMeta) {
      return;
    }

    setContextMenu(null);
    try {
      await openMaterialItem(contextMaterialMeta.relativePath);
    } catch (error) {
      console.error("Failed to open mindmap material", error);
      alert(t("mindmap.alerts.couldNotOpen"));
    }
  };

  const handleRevealMaterialFromContextMenu = async () => {
    if (!contextMaterialMeta) {
      return;
    }

    setContextMenu(null);
    try {
      await revealMaterialItem(contextMaterialMeta.relativePath);
    } catch (error) {
      console.error("Failed to reveal mindmap material", error);
      alert(t("mindmap.alerts.couldNotReveal"));
    }
  };

  const createMindmapPdf = async (): Promise<{ pdfBytes: Uint8Array; fileName: string }> => {
    setContextMenu(null);
    setEditingNodeId(null);
    setMaterialPreviewState(null);

    const sourceElement = mindmapSurfaceRef.current || document.getElementById("mindmap-export-surface");
    if (!sourceElement) {
      throw new Error(t("mindmap.alerts.noCanvas"));
    }

    const exportHost = document.createElement("div");
    exportHost.style.position = "fixed";
    exportHost.style.left = "-100000px";
    exportHost.style.top = "0";
    exportHost.style.pointerEvents = "none";
    exportHost.style.opacity = "0";
    exportHost.style.zIndex = "-1";

    const clonedElement = sourceElement.cloneNode(true) as HTMLElement;
    clonedElement.classList.add("tp-mindmap-export-clone");

    let exportWidth = 1100;
    let exportHeight = 650;
    
    if (flowInstance && nodes.length > 0) {
      
      const bounds = getNodesBounds(flowInstance.getNodes());
      const minPadding = 100;
      
      exportWidth = Math.max(bounds.width + minPadding * 2, 1100);
      exportHeight = Math.max(bounds.height + minPadding * 2, 650);

      const paddingX = (exportWidth - bounds.width) / 2;
      const paddingY = (exportHeight - bounds.height) / 2;

      const viewportNode = clonedElement.querySelector(".react-flow__viewport") as HTMLElement;
      if (viewportNode) {
        viewportNode.style.transform = `translate(${-bounds.x + paddingX}px, ${-bounds.y + paddingY}px) scale(1)`;
      }
    } else {
      const sourceRect = sourceElement.getBoundingClientRect();
      exportWidth = Math.max(sourceRect.width, sourceElement.scrollWidth, 1100);
      exportHeight = Math.max(sourceRect.height, sourceElement.scrollHeight, 650);
    }

    clonedElement.style.width = `${exportWidth}px`;
    clonedElement.style.height = `${exportHeight}px`;

    clonedElement.querySelectorAll<HTMLElement>(".react-flow__controls, .react-flow__background, .react-flow__attribution, .react-flow__panel").forEach((node) => {
      node.style.display = "none";
    });

    exportHost.appendChild(clonedElement);
    document.body.appendChild(exportHost);

    try {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });

      const baseName = (activeFilePath?.split(/[\/\\]/).pop() || "mindmap")
        .replace(/\.json$/i, "")
        .replace(/[^a-zA-Z0-9\-_\s]/g, "")
        .replace(/\s+/g, "-");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");

      const pdfBytes = await renderElementToPdfBytes(clonedElement, {
        orientation: "landscape",
        marginMm: 5,
        scale: PRINT_PDF_PIXEL_RATIO,
        backgroundColor: "#ffffff",
        multiPage: false,
        autoFormat: true,
      });
      return { pdfBytes, fileName: `${baseName}-${stamp}.pdf` };
    } finally {
      exportHost.remove();
    }
  };

  const handleExportPDF = async () => {
    if (!vaultPath) {
      alert(t("mindmap.alerts.pleaseOpenVault"));
      return;
    }

    setIsPdfBusy(true);

    try {
      const { pdfBytes, fileName } = await createMindmapPdf();

      const savedPath = await savePdfToVault({
        pdfBytes,
        fileName,
        vaultPath,
        dialogTitle: t("mindmap.alerts.exportDialogTitle"),
      });

      if (savedPath) {
        alert(t("mindmap.alerts.exportedSuccessfully"));
      }
    } catch (error) {
      console.error("Mindmap PDF export failed:", error);
      alert(t("mindmap.alerts.exportFailed", { error: error instanceof PdfExportError ? t(error.messageKey) : describePdfRenderError(error) }));
    } finally {
      setIsPdfBusy(false);
    }
  };

  const handlePreviewPDF = async () => {
    setIsPdfBusy(true);

    try {
      const { pdfBytes } = await createMindmapPdf();
      const nextUrl = createPdfBlobUrl(pdfBytes);
      setPdfPreviewUrl((previous) => {
        revokePdfBlobUrl(previous);
        return nextUrl;
      });
    } catch (error) {
      console.error("Mindmap PDF preview failed:", error);
      alert(t("mindmap.alerts.previewFailed", { error: describePdfRenderError(error) }));
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
      alert(t("mindmap.alerts.pleaseOpenVault"));
      return;
    }

    setIsPdfBusy(true);

    try {
      setContextMenu(null);
      setEditingNodeId(null);

      const { pdfBytes, fileName } = await createMindmapPdf();

      if (osType() === "windows") {
        // printPdfBlobUrl owns the blob URL lifecycle (it keeps it alive
        // while the print preview is open and revokes it on cleanup), so no
        // manual revoke here.
        try {
          await printPdfBlobUrl(createPdfBlobUrl(pdfBytes));
          return;
        } catch (printError) {
          console.warn(
            "Mindmap PDF blob print failed on Windows, falling back to webview print dialog.",
            printError,
          );
          await printCurrentWindow();
          return;
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
      console.error("Mindmap PDF print failed:", error);
      alert(t("mindmap.alerts.printFailed", { error: error instanceof PdfExportError ? t(error.messageKey) : describePdfRenderError(error) }));
    } finally {
      setIsPdfBusy(false);
    }
  };

  if (!activeFilePath) {
    return (
      <div className="tp-mindmap h-full flex items-center justify-center" style={{ background: "var(--tp-bg-app)" }}>
        <div className="text-center max-w-md p-8">
          <h2 className="text-3xl font-bold text-gray-100 mb-4">{t("mindmap.readyState")}</h2>
          <p className="text-gray-400 mb-8">
            {t("mindmap.selectMindmap")}
          </p>
          <button
            onClick={() => createNewMindmap()}
            className="tp-accent-btn text-white px-6 py-2.5 rounded-lg shadow-sm transition-colors font-medium flex items-center gap-2 mx-auto"
          >
            <Plus className="w-5 h-5" />
            {t("mindmap.createNewMindmap")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="tp-mindmap h-full w-full bg-[#121212] relative flex flex-col print:bg-white">
      <div className="absolute top-0 left-0 w-full p-3 z-10 pointer-events-none flex justify-between print:hidden">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-100 pointer-events-auto">{t("mindmap.workspaceTitle")}</h1>
            <p className="text-gray-400 text-[12.5px] pointer-events-auto mt-1">
              {t("mindmap.workspaceHint")}
            </p>
          </div>
          <button
            onClick={handleAddNode}
            className="pointer-events-auto bg-[#2d2d2d] hover:bg-[var(--tp-bg-5)] border border-[#444] text-white px-3 py-1.5 rounded-md shadow-sm transition-colors text-[12.5px] font-medium flex items-center gap-2 h-fit mt-1"
          >
            <Plus className="w-4 h-4" /> {t("mindmap.addNode")}
          </button>
        </div>
        <div className="pointer-events-auto flex items-center gap-2 h-fit mt-1">
          <button
            onClick={handlePreviewPDF}
            title={isPdfBusy ? t("mindmap.actions.previewPdf") + " (busy)" : t("mindmap.actions.previewPdf")}
            disabled={isPdfBusy}
            className="bg-[#2f2f2f] hover:bg-[var(--tp-bg-5)] border border-[#444] text-white min-w-9 h-8 px-2.5 py-1.5 rounded-md shadow-sm transition-colors text-[12.5px] font-medium inline-flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={handlePrintPDF}
            title={isPdfBusy ? t("mindmap.actions.printSavePdf") + " (busy)" : t("mindmap.actions.printSavePdf")}
            disabled={isPdfBusy}
            className="bg-[#2f2f2f] hover:bg-[var(--tp-bg-5)] border border-[#444] text-white min-w-9 h-8 px-2.5 py-1.5 rounded-md shadow-sm transition-colors text-[12.5px] font-medium inline-flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Printer className="w-4 h-4" />
          </button>
          <button
            onClick={handleExportPDF}
            title={isPdfBusy ? t("mindmap.actions.exportPdf") + " (busy)" : t("mindmap.actions.exportPdf")}
            disabled={isPdfBusy}
            className="bg-[#333] hover:bg-[var(--tp-bg-6)] text-white min-w-9 h-8 px-2.5 py-1.5 rounded-md shadow-sm transition-colors text-[12.5px] font-medium inline-flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={handleSave}
            title={t("mindmap.actions.saveMindmap")}
            className="tp-accent-btn text-white min-w-9 h-8 px-2.5 py-1.5 rounded-md shadow-sm transition-colors text-[12.5px] font-medium inline-flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Custom Node Edit Modal */}
      {editingNodeId && (
        <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-[#1e1e1e] border border-[#333] p-6 rounded-xl shadow-xl min-w-[300px]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white font-semibold">{t("mindmap.editNode")}</h3>
              <button onClick={() => setEditingNodeId(null)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveEdit()}
              className="w-full bg-[#121212] border border-[#333] rounded-md px-3 py-2 text-white focus:outline-none focus:border-[var(--tp-accent)] mb-4"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditingNodeId(null)} className="px-4 py-2 text-sm text-gray-400 hover:text-white">
                {t("mindmap.cancel")}
              </button>
              <button onClick={saveEdit} className="tp-accent-btn px-4 py-2 text-sm text-white rounded-md">
                {t("mindmap.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {contextMenu && (
        <div
          className={buildContextMenuClassName("z-50 min-w-[180px]")}
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            onClick={handleAddFromContextMenu}
            className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-[var(--tp-bg-4)] rounded"
          >
            {contextMenu.target.kind === "pane" ? t("mindmap.contextMenu.addNodeHere") : t("mindmap.contextMenu.addLinkedNode")}
          </button>

          {contextMenu.target.kind === "node" && (
            <>
              {contextMaterialMeta ? (
                <>
                  <button
                    onClick={() => {
                      void handlePreviewMaterialFromContextMenu();
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-[var(--tp-bg-4)] rounded"
                  >
                    {t("mindmap.contextMenu.previewMaterial")}
                  </button>
                  <button
                    onClick={() => {
                      void handleOpenMaterialFromContextMenu();
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-[var(--tp-bg-4)] rounded flex items-center gap-2"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> {t("mindmap.contextMenu.open")}
                  </button>
                  <button
                    onClick={() => {
                      void handleRevealMaterialFromContextMenu();
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-[var(--tp-bg-4)] rounded flex items-center gap-2"
                  >
                    <FolderOpen className="w-3.5 h-3.5" /> {t("mindmap.contextMenu.revealInFileManager")}
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleRenameFromContextMenu}
                    className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-[var(--tp-bg-4)] rounded"
                  >
                    {t("mindmap.contextMenu.renameNode")}
                  </button>

                  <div className="px-2 py-2">
                    <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">{t("mindmap.contextMenu.nodeColor")}</div>
                    <div className="grid grid-cols-4 gap-2">
                      {NODE_COLOR_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          title={t("mindmap.nodeColors." + preset.id)}
                          onClick={() => handleApplyNodeColor(preset)}
                          className="h-6 rounded border border-[#444] hover:scale-[1.06] transition-transform"
                          style={{ backgroundColor: preset.style.background }}
                        />
                      ))}
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <input
                        type="color"
                        value={customNodeColor}
                        onChange={(event) => setCustomNodeColor(event.target.value)}
                        className="h-7 w-10 rounded border border-[#444] bg-transparent cursor-pointer"
                        title={t("mindmap.contextMenu.customNodeColor")}
                      />
                      <button
                        onClick={handleApplyCustomNodeColor}
                        className="px-2 py-1 text-[12.5px] rounded border border-[#3e3e3e] text-gray-200 hover:bg-[var(--tp-bg-4)]"
                      >
                        {t("mindmap.contextMenu.applyCustom")}
                      </button>
                    </div>
                  </div>
                </>
              )}

              <button
                onClick={handleDeleteFromContextMenu}
                className="w-full text-left px-3 py-2 text-sm text-red-300 hover:bg-[var(--tp-bg-4)] rounded"
              >
                {t("mindmap.contextMenu.deleteNode")}
              </button>
            </>
          )}
        </div>
      )}

      {materialPreview && (
        <div
          className="fixed inset-0 z-[79] bg-black/60 flex items-center justify-center p-6"
          onClick={() => setMaterialPreviewState(null)}
        >
          <div
            ref={materialPreviewRef}
            tabIndex={-1}
            className="tp-preview-surface w-full max-w-5xl max-h-[88vh] bg-[#151515] border border-[#333] rounded-xl shadow-2xl overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="h-11 border-b border-[#333] px-4 flex items-center justify-between">
              <div className="text-sm text-gray-200 font-medium truncate">{materialPreview.title}</div>
              <button
                onClick={() => setMaterialPreviewState(null)}
                className="p-1 text-gray-400 hover:text-gray-200 hover:bg-[var(--tp-bg-4)] rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 h-[calc(88vh-44px)] overflow-auto">
              {materialPreview.kind === "error" && (
                <div className="text-sm text-red-300">{materialPreview.message}</div>
              )}

              {materialPreview.kind === "pdf" && materialPreview.src && (
                <iframe
                  src={materialPreview.src}
                  className="w-full h-full min-h-[70vh] rounded-md bg-white"
                  title={materialPreview.title}
                />
              )}

              {materialPreview.kind === "image" && materialPreview.src && (
                <div className="w-full h-full flex items-center justify-center">
                  <img
                    src={materialPreview.src}
                    alt={materialPreview.title}
                    className="max-w-full max-h-[72vh] object-contain rounded-md"
                  />
                </div>
              )}

              {materialPreview.kind === "text" && (
                <pre className="whitespace-pre-wrap break-words text-sm text-gray-200 leading-relaxed bg-[#101010] border border-[#2d2d2d] rounded-md p-4">
                  {materialPreview.text || t("mindmap.emptyFile")}
                </pre>
              )}
            </div>
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
              <div className="text-sm text-gray-200 font-medium">{t("editor.pdf.mindmapPreview")}</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrintPDF}
                  className="px-3 py-1.5 text-[12.5px] rounded-md border border-[#444] bg-[#252525] text-gray-200 hover:bg-[var(--tp-bg-4)]"
                >
                  {t("editor.pdf.printSavePDF")}
                </button>
                <button
                  onClick={() => setPdfPreviewUrl(null)}
                  className="p-1 rounded text-gray-400 hover:text-gray-200 hover:bg-[var(--tp-bg-4)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <iframe src={pdfPreviewUrl} title={t("editor.pdf.mindmapPreview")} className="w-full h-[calc(88vh-48px)] bg-white" />
          </div>
        </div>
      )}

      <div
        id="mindmap-export-surface"
        ref={mindmapSurfaceRef}
        className="flex-1"
        onDragOver={handleMaterialDragOver}
        onDrop={handleMaterialDrop}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={mindmapNodeTypes}
          onInit={setFlowInstance}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDoubleClick={onNodeDoubleClick}
          onPaneContextMenu={handlePaneContextMenu}
          onNodeContextMenu={handleNodeContextMenu}
          onPaneClick={() => setContextMenu(null)}
          panOnDrag={[0, 1]}
          fitView
          colorMode="dark"
          className="print:!bg-white"
        >
          <Controls
            className="print:hidden"
            style={{
              display: "flex",
              flexDirection: "column",
              backgroundColor: "#222",
              fill: "#ccc",
              border: "1px solid #333",
            }}
          />
          <Background className="print:hidden" color="#333" gap={16} />
        </ReactFlow>
      </div>
    </div>
  );
}
