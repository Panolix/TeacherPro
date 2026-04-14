import { useState, useCallback, useEffect, useRef } from "react";
import {
  ReactFlow,
  Controls,
  Background,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  Node,
  Edge,
  Connection,
  ReactFlowInstance,
  NodeChange,
  EdgeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useAppStore } from "../store";
import { Eye, Plus, Save, Printer, Download, X, FolderOpen, ExternalLink } from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { join } from "@tauri-apps/api/path";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { exists, readFile, readTextFile } from "@tauri-apps/plugin-fs";
import {
  createPdfBlobUrl,
  renderElementToPdfBytes,
  revokePdfBlobUrl,
  savePdfToVault,
} from "../utils/pdfExport";

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
  padding: "10px 20px",
  fontSize: "13px",
};

const NODE_COLOR_PRESETS: NodeColorPreset[] = [
  {
    id: "slate",
    label: "Slate",
    style: { background: "#2d2d2d", color: "#e5e5e5", border: "1px solid #444" },
  },
  {
    id: "blue",
    label: "Blue",
    style: { background: "#9fd2e4", color: "#ffffff", border: "1px solid #7cb1c4" },
  },
  {
    id: "emerald",
    label: "Emerald",
    style: { background: "#059669", color: "#ffffff", border: "1px solid #047857" },
  },
  {
    id: "amber",
    label: "Amber",
    style: { background: "#d97706", color: "#ffffff", border: "1px solid #b45309" },
  },
  {
    id: "rose",
    label: "Rose",
    style: { background: "#e11d48", color: "#ffffff", border: "1px solid #be123c" },
  },
  {
    id: "violet",
    label: "Violet",
    style: { background: "#7c3aed", color: "#ffffff", border: "1px solid #6d28d9" },
  },
  {
    id: "teal",
    label: "Teal",
    style: { background: "#0f766e", color: "#ffffff", border: "1px solid #0f766e" },
  },
  {
    id: "light",
    label: "Light",
    style: { background: "#f8fafc", color: "#111827", border: "1px solid #cbd5e1" },
  },
];

function getNodeLabel(node: Node): string {
  const label = node.data?.label;
  return typeof label === "string" ? label : "New Idea";
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
    saveActiveMindmap,
    activeFilePath,
    createNewMindmap,
    vaultPath,
    themeMode,
    draggedMaterial,
    setDraggedMaterial,
    pendingMaterialDrop,
    setPendingMaterialDrop,
    logDebug,
  } = useAppStore();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<Node, Edge> | null>(null);
  const [isPdfBusy, setIsPdfBusy] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
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

  // Sync state when active file changes
  useEffect(() => {
    if (activeMindmapContent) {
      setNodes(activeMindmapContent.nodes || []);
      setEdges(activeMindmapContent.edges || []);
    } else {
      setNodes([]);
      setEdges([]);
    }
  }, [activeMindmapContent]);

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

  const onNodesChange = useCallback(
    (changes: NodeChange<Node>[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );
  const onConnect = useCallback((params: Connection) => {
    if (!params.source || !params.target) {
      return;
    }

    if (params.source === params.target) {
      return;
    }

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
  }, []);

  const handleSave = () => {
    saveActiveMindmap(nodes, edges);
  };

  const addNodeAt = useCallback((preferredPosition?: { x: number; y: number }) => {
    setNodes((existing) => {
      const position = findAvailablePosition(preferredPosition, existing);
      const newNode: Node = {
        id: `${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        data: { label: "New Idea" },
        position,
        style: { ...NODE_STYLE },
      };

      return existing.concat(newNode);
    });
  }, []);

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
        alert(`Material path not found: ${relativePath}`);
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
        alert(`Material path not found: ${relativePath}`);
        return;
      }

      await revealItemInDir(absolutePath);
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
          message: "Folder preview is not available. Use Open or Reveal In File Manager.",
        });
        return;
      }

      const extension = (fileName.split(".").pop() || "").toLowerCase();
      const absolutePath = await resolveMaterialAbsolutePath(relativePath);
      if (!absolutePath) {
        setMaterialPreviewState({
          title: fileName,
          kind: "error",
          message: "Please open a vault first.",
        });
        return;
      }

      const isPresent = await exists(absolutePath);
      if (!isPresent) {
        setMaterialPreviewState({
          title: fileName,
          kind: "error",
          message: `Material path not found: ${relativePath}`,
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
        setMaterialPreviewState({
          title: fileName,
          kind: "image",
          src: convertFileSrc(absolutePath),
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
        message: "Preview is not available for this file type.",
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
      const fileName = payload.relativePath.split("/").pop() || payload.relativePath;
      const nodeId = `${Date.now()}-${Math.floor(Math.random() * 1000)}`;

      setNodes((existing) => {
        const position = findAvailablePosition(preferredPosition, existing);
        const nodeLabel = payload.itemType === "folder" ? `[Folder] ${fileName}` : `[Material] ${fileName}`;
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
    [],
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

  useEffect(() => {
    if (!flowInstance || !pendingMaterialDrop) {
      return;
    }

    const { clientX, clientY, relativePath, isDirectory } = pendingMaterialDrop;
    const shouldInsertAtCursor = clientX < 0 || clientY < 0;

    if (shouldInsertAtCursor) {
      logDebug("mindmap", "drag-end-fallback-ignored-cursor", relativePath);
      setPendingMaterialDrop(null);
      return;
    }

    const surface = mindmapSurfaceRef.current;
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
      setEditValue(getNodeLabel(node));
    },
    [previewMaterialItem],
  );

  const saveEdit = () => {
    if (editingNodeId && editValue.trim() !== "") {
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

      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        target: { kind: "pane", position: flowPosition },
      });
    },
    [flowInstance],
  );

  const handleNodeContextMenu = useCallback((event: React.MouseEvent, node: Node) => {
    event.preventDefault();
    event.stopPropagation();

    setContextMenu({
      x: event.clientX,
      y: event.clientY,
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
      data: { label: "New Idea" },
      position,
      style: { ...NODE_STYLE },
    };

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
    setEditValue(getNodeLabel(node));
    setContextMenu(null);
  };

  const handleDeleteFromContextMenu = () => {
    if (!contextMenu || contextMenu.target.kind !== "node") {
      return;
    }

    const { nodeId } = contextMenu.target;
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
      alert("Could not open this material item in the default app.");
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
      alert("Could not reveal this item in your file manager.");
    }
  };

  const createMindmapPdf = async (): Promise<{ pdfBytes: Uint8Array; fileName: string }> => {
    setContextMenu(null);
    setEditingNodeId(null);
    setMaterialPreviewState(null);

    const sourceElement = mindmapSurfaceRef.current || document.getElementById("mindmap-export-surface");
    if (!sourceElement) {
      throw new Error("Could not find mindmap canvas to export.");
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

    const sourceRect = sourceElement.getBoundingClientRect();
    const exportWidth = Math.max(sourceRect.width, sourceElement.scrollWidth, 1100);
    const exportHeight = Math.max(sourceRect.height, sourceElement.scrollHeight, 650);
    clonedElement.style.width = `${exportWidth}px`;
    clonedElement.style.height = `${exportHeight}px`;

    clonedElement.querySelectorAll<HTMLElement>(".react-flow__controls, .react-flow__background").forEach((node) => {
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
        marginMm: 8,
        scale: 2,
        backgroundColor: "#ffffff",
        multiPage: false,
      });
      return { pdfBytes, fileName: `${baseName}-${stamp}.pdf` };
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
      const { pdfBytes, fileName } = await createMindmapPdf();

      const savedPath = await savePdfToVault({
        pdfBytes,
        fileName,
        vaultPath,
        dialogTitle: "Export Mindmap as PDF",
      });

      if (savedPath) {
        alert("Mindmap exported successfully.");
      }
    } catch (error) {
      console.error("Mindmap PDF export failed:", error);
      alert(`Export failed: ${String(error)}`);
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
      alert(`Preview failed: ${String(error)}`);
    } finally {
      setIsPdfBusy(false);
    }
  };

  const handlePrintPDF = async () => {
    if (!vaultPath) {
      alert("Please open a vault before printing.");
      return;
    }

    setIsPdfBusy(true);

    try {
      setContextMenu(null);
      setEditingNodeId(null);

      const { pdfBytes, fileName } = await createMindmapPdf();
      
      const { tempDir, join } = await import("@tauri-apps/api/path");
      const { writeFile } = await import("@tauri-apps/plugin-fs");
      const { invoke } = await import("@tauri-apps/api/core");

      const sysTempDir = await tempDir();
      const tempPdfPath = await join(sysTempDir, fileName);

      await writeFile(tempPdfPath, pdfBytes);
      await invoke("print_pdf_file", { path: tempPdfPath });
    } catch (error) {
      console.error("Mindmap PDF print failed:", error);
      alert(`Print failed: ${String(error)}`);
    } finally {
      setIsPdfBusy(false);
    }
  };

  const isLightMode = themeMode === "light";

  if (!activeFilePath) {
    return (
      <div className="tp-mindmap h-full flex items-center justify-center bg-[#121212]">
        <div className="text-center max-w-md p-8">
          <h2 className="text-3xl font-bold text-gray-100 mb-4">Mindmaps Ready</h2>
          <p className="text-gray-400 mb-8">
            Select a mindmap from the sidebar or create a new one to start brainstorming.
          </p>
          <button
            onClick={() => createNewMindmap()}
            className="tp-accent-btn text-white px-6 py-2.5 rounded-lg shadow-sm transition-colors font-medium flex items-center gap-2 mx-auto"
          >
            <Plus className="w-5 h-5" />
            Create New Mindmap
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="tp-mindmap h-full w-full bg-[#121212] relative flex flex-col print:bg-white">
      <div className="absolute top-0 left-0 w-full p-4 z-10 pointer-events-none flex justify-between print:hidden">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-100 pointer-events-auto">Mindmap Workspace</h1>
            <p className="text-gray-400 text-xs pointer-events-auto mt-1">
              Right-click nodes for actions. Drop materials to create linked file nodes.
            </p>
          </div>
          <button
            onClick={handleAddNode}
            className="pointer-events-auto bg-[#2d2d2d] hover:bg-[#3d3d3d] border border-[#444] text-white px-3 py-1.5 rounded-md shadow-sm transition-colors text-xs font-medium flex items-center gap-2 h-fit mt-1"
          >
            <Plus className="w-4 h-4" /> Add Node
          </button>
        </div>
        <div className="pointer-events-auto flex items-center gap-2 h-fit mt-1">
          <button
            onClick={handlePreviewPDF}
            disabled={isPdfBusy}
            className="bg-[#2f2f2f] hover:bg-[#3a3a3a] border border-[#444] text-white px-3 py-1.5 rounded-md shadow-sm transition-colors text-xs font-medium flex items-center gap-2"
          >
            <Eye className="w-4 h-4" /> {isPdfBusy ? "Working..." : "Preview PDF"}
          </button>
          <button
            onClick={handlePrintPDF}
            disabled={isPdfBusy}
            className="bg-[#2f2f2f] hover:bg-[#3a3a3a] border border-[#444] text-white px-3 py-1.5 rounded-md shadow-sm transition-colors text-xs font-medium flex items-center gap-2"
          >
            <Printer className="w-4 h-4" /> {isPdfBusy ? "Working..." : "Print / Save PDF"}
          </button>
          <button
            onClick={handleExportPDF}
            disabled={isPdfBusy}
            className="bg-[#333] hover:bg-[#444] text-white px-3 py-1.5 rounded-md shadow-sm transition-colors text-xs font-medium flex items-center gap-2"
          >
            <Download className="w-4 h-4" /> {isPdfBusy ? "Working..." : "Export PDF"}
          </button>
          <button
            onClick={handleSave}
            className="tp-accent-btn text-white px-3 py-1.5 rounded-md shadow-sm transition-colors text-xs font-medium flex items-center gap-2"
          >
            <Save className="w-4 h-4" /> Save Mindmap
          </button>
        </div>
      </div>

      {/* Custom Node Edit Modal */}
      {editingNodeId && (
        <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-[#1e1e1e] border border-[#333] p-6 rounded-xl shadow-xl min-w-[300px]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-white font-semibold">Edit Node</h3>
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
                Cancel
              </button>
              <button onClick={saveEdit} className="tp-accent-btn px-4 py-2 text-sm text-white rounded-md">
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {contextMenu && (
        <div
          className="fixed z-50 min-w-[180px] rounded-md border border-[#3a3a3a] bg-[#1f1f1f] p-1 shadow-xl"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            onClick={handleAddFromContextMenu}
            className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-[#2d2d2d] rounded"
          >
            {contextMenu.target.kind === "pane" ? "Add Node Here" : "Add Linked Node"}
          </button>

          {contextMenu.target.kind === "node" && (
            <>
              {contextMaterialMeta ? (
                <>
                  <button
                    onClick={() => {
                      void handlePreviewMaterialFromContextMenu();
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-[#2d2d2d] rounded"
                  >
                    Preview Material
                  </button>
                  <button
                    onClick={() => {
                      void handleOpenMaterialFromContextMenu();
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-[#2d2d2d] rounded flex items-center gap-2"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Open
                  </button>
                  <button
                    onClick={() => {
                      void handleRevealMaterialFromContextMenu();
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-[#2d2d2d] rounded flex items-center gap-2"
                  >
                    <FolderOpen className="w-3.5 h-3.5" /> Reveal In File Manager
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleRenameFromContextMenu}
                    className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-[#2d2d2d] rounded"
                  >
                    Rename Node
                  </button>

                  <div className="px-2 py-2">
                    <div className="text-[11px] uppercase tracking-wider text-gray-500 mb-2">Node Color</div>
                    <div className="grid grid-cols-4 gap-2">
                      {NODE_COLOR_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          title={preset.label}
                          onClick={() => handleApplyNodeColor(preset)}
                          className="h-6 rounded border border-[#444] hover:scale-[1.06] transition-transform"
                          style={{ backgroundColor: preset.style.background }}
                        />
                      ))}
                    </div>
                  </div>
                </>
              )}

              <button
                onClick={handleDeleteFromContextMenu}
                className="w-full text-left px-3 py-2 text-sm text-red-300 hover:bg-[#2d2d2d] rounded"
              >
                Delete Node
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
            className="w-full max-w-5xl max-h-[88vh] bg-[#151515] border border-[#333] rounded-xl shadow-2xl overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="h-11 border-b border-[#333] px-4 flex items-center justify-between">
              <div className="text-sm text-gray-200 font-medium truncate">{materialPreview.title}</div>
              <button
                onClick={() => setMaterialPreviewState(null)}
                className="p-1 text-gray-400 hover:text-gray-200 hover:bg-[#232323] rounded"
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
                  {materialPreview.text || "(Empty file)"}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      {pdfPreviewUrl && (
        <div
          className="fixed inset-0 z-[78] bg-black/65 p-6 flex items-center justify-center print:hidden"
          onClick={() => setPdfPreviewUrl(null)}
        >
          <div
            ref={pdfPreviewRef}
            tabIndex={-1}
            className="w-full max-w-6xl h-[88vh] bg-[#161616] border border-[#333] rounded-xl shadow-2xl overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="h-12 border-b border-[#333] px-4 flex items-center justify-between">
              <div className="text-sm text-gray-200 font-medium">Mindmap PDF Preview</div>
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
            <iframe src={pdfPreviewUrl} title="Mindmap PDF Preview" className="w-full h-[calc(88vh-48px)] bg-white" />
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
          colorMode={isLightMode ? "light" : "dark"}
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
