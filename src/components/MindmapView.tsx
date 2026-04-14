import { useState, useCallback, useEffect } from "react";
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
import { Plus, Save, Printer, X } from "lucide-react";
import { renderElementToPdfBytes, savePdfToVault } from "../utils/pdfExport";

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

const NODE_STYLE = {
  background: "#2d2d2d",
  color: "#e5e5e5",
  border: "1px solid #444",
  borderRadius: "8px",
  padding: "10px 20px",
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
    style: { background: "#2563eb", color: "#ffffff", border: "1px solid #1d4ed8" },
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
  const { activeMindmapContent, saveActiveMindmap, activeFilePath, createNewMindmap, vaultPath, themeMode } = useAppStore();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance<Node, Edge> | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

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
      }
    };

    window.addEventListener("click", closeContextMenu);
    window.addEventListener("keydown", onEscape);

    return () => {
      window.removeEventListener("click", closeContextMenu);
      window.removeEventListener("keydown", onEscape);
    };
  }, []);

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

  const onNodeDoubleClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setEditingNodeId(node.id);
    setEditValue(getNodeLabel(node));
  }, []);

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

  const handleExportPDF = async () => {
    if (!vaultPath) {
      alert("Please open a vault before exporting.");
      return;
    }

    setContextMenu(null);
    setEditingNodeId(null);

    const element = document.getElementById("mindmap-export-surface");
    if (!element) {
      alert("Could not find mindmap canvas to export.");
      return;
    }

    const controls = element.querySelector(".react-flow__controls") as HTMLElement | null;
    const background = element.querySelector(".react-flow__background") as HTMLElement | null;
    const previousControlsDisplay = controls?.style.display ?? "";
    const previousBackgroundDisplay = background?.style.display ?? "";

    setIsExporting(true);

    try {
      if (controls) controls.style.display = "none";
      if (background) background.style.display = "none";

      const baseName = (activeFilePath?.split(/[\/\\]/).pop() || "mindmap")
        .replace(/\.json$/i, "")
        .replace(/[^a-zA-Z0-9\-_\s]/g, "")
        .replace(/\s+/g, "-");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");

      const pdfBytes = await renderElementToPdfBytes(element, {
        orientation: "landscape",
        marginMm: 8,
        scale: 2,
        backgroundColor: themeMode === "light" ? "#f8fafc" : "#121212",
        multiPage: false,
      });

      const savedPath = await savePdfToVault({
        pdfBytes,
        fileName: `${baseName}-${stamp}.pdf`,
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
      if (controls) controls.style.display = previousControlsDisplay;
      if (background) background.style.display = previousBackgroundDisplay;
      setIsExporting(false);
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
            <h1 className="text-2xl font-bold text-gray-100 pointer-events-auto">Mindmap Workspace</h1>
            <p className="text-gray-400 text-sm pointer-events-auto mt-1">
              Right-click to add, rename, and delete nodes.
            </p>
          </div>
          <button
            onClick={handleAddNode}
            className="pointer-events-auto bg-[#2d2d2d] hover:bg-[#3d3d3d] border border-[#444] text-white px-3 py-1.5 rounded-md shadow-sm transition-colors text-sm font-medium flex items-center gap-2 h-fit mt-1"
          >
            <Plus className="w-4 h-4" /> Add Node
          </button>
        </div>
        <div className="pointer-events-auto flex items-center gap-2 h-fit mt-1">
          <button
            onClick={handleExportPDF}
            disabled={isExporting}
            className="bg-[#333] hover:bg-[#444] text-white px-4 py-1.5 rounded-md shadow-sm transition-colors text-sm font-medium flex items-center gap-2"
          >
            <Printer className="w-4 h-4" /> {isExporting ? "Exporting..." : "Export PDF"}
          </button>
          <button
            onClick={handleSave}
            className="tp-accent-btn text-white px-4 py-1.5 rounded-md shadow-sm transition-colors text-sm font-medium flex items-center gap-2"
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

      <div id="mindmap-export-surface" className="flex-1">
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
