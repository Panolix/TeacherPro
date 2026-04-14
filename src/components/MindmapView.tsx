import { useState, useCallback, useEffect } from 'react';
import { ReactFlow, Controls, Background, addEdge, applyNodeChanges, applyEdgeChanges, Node, Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useAppStore } from '../store';
import { Plus, Save, Printer, X } from 'lucide-react';
import html2pdf from 'html2pdf.js';

export function MindmapView() {
  const { activeMindmapContent, saveActiveMindmap, activeFilePath, createNewMindmap } = useAppStore();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  // Editing state for Tauri (since window.prompt is blocked)
  const [editingNode, setEditingNode] = useState<Node | null>(null);
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

  const onNodesChange = useCallback(
    (changes: any) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: any) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );
  const onConnect = useCallback(
    (params: any) => setEdges((eds) => addEdge({ ...params, style: { stroke: '#666' } }, eds)),
    [],
  );

  const handleSave = () => {
    saveActiveMindmap(nodes, edges);
  };

  const handleAddNode = () => {
    const newNode: Node = {
      id: Date.now().toString(),
      data: { label: 'New Idea' },
      position: { x: window.innerWidth / 2 - 100, y: window.innerHeight / 2 - 100 },
      style: { background: '#2d2d2d', color: '#e5e5e5', border: '1px solid #444', borderRadius: '8px', padding: '10px 20px' }
    };
    setNodes((nds) => nds.concat(newNode));
  };

  const onNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setEditingNode(node);
      setEditValue(node.data.label as string);
    },
    []
  );

  const saveEdit = () => {
    if (editingNode && editValue.trim() !== "") {
      setNodes((nds) => 
        nds.map((n) => {
          if (n.id === editingNode.id) {
            return { ...n, data: { ...n.data, label: editValue } };
          }
          return n;
        })
      );
    }
    setEditingNode(null);
  };

  const handleExportPDF = () => {
    const element = document.querySelector('.react-flow') as HTMLElement;
    if (!element) return;
    
    // Hide controls during capture
    const controls = document.querySelector('.react-flow__controls') as HTMLElement;
    if (controls) controls.style.display = 'none';

    const opt = {
      margin:       10,
      filename:     'mindmap.pdf',
      image:        { type: 'jpeg' as const, quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true, backgroundColor: '#121212' },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'landscape' as const }
    };

    html2pdf().set(opt).from(element).save().then(() => {
      // Restore controls
      if (controls) controls.style.display = 'flex';
    });
  };

  if (!activeFilePath) {
    return (
      <div className="h-full flex items-center justify-center bg-[#121212]">
        <div className="text-center max-w-md p-8">
          <h2 className="text-3xl font-bold text-gray-100 mb-4">Mindmaps Ready</h2>
          <p className="text-gray-400 mb-8">
            Select a mindmap from the sidebar or create a new one to start brainstorming.
          </p>
          <button
            onClick={() => createNewMindmap()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg shadow-sm transition-colors font-medium flex items-center gap-2 mx-auto"
          >
            <Plus className="w-5 h-5" />
            Create New Mindmap
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-[#121212] relative flex flex-col print:bg-white">
       <div className="absolute top-0 left-0 w-full p-4 z-10 pointer-events-none flex justify-between print:hidden">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-100 pointer-events-auto">Mindmap Workspace</h1>
              <p className="text-gray-400 text-sm pointer-events-auto mt-1">Double-click a node to edit text.</p>
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
               className="bg-[#333] hover:bg-[#444] text-white px-4 py-1.5 rounded-md shadow-sm transition-colors text-sm font-medium flex items-center gap-2"
             >
               <Printer className="w-4 h-4" /> Export PDF
             </button>
             <button 
               onClick={handleSave}
               className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-md shadow-sm transition-colors text-sm font-medium flex items-center gap-2"
             >
               <Save className="w-4 h-4" /> Save Mindmap
             </button>
          </div>
       </div>

       {/* Custom Node Edit Modal */}
       {editingNode && (
         <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center">
           <div className="bg-[#1e1e1e] border border-[#333] p-6 rounded-xl shadow-xl min-w-[300px]">
             <div className="flex justify-between items-center mb-4">
               <h3 className="text-white font-semibold">Edit Node</h3>
               <button onClick={() => setEditingNode(null)} className="text-gray-400 hover:text-white">
                 <X className="w-5 h-5" />
               </button>
             </div>
             <input 
               type="text"
               value={editValue}
               onChange={(e) => setEditValue(e.target.value)}
               onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
               className="w-full bg-[#121212] border border-[#333] rounded-md px-3 py-2 text-white focus:outline-none focus:border-blue-500 mb-4"
               autoFocus
             />
             <div className="flex justify-end gap-2">
               <button onClick={() => setEditingNode(null)} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
               <button onClick={saveEdit} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-md">Save</button>
             </div>
           </div>
         </div>
       )}
       
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDoubleClick={onNodeDoubleClick}
        fitView
        colorMode="dark"
        className="print:!bg-white"
      >
        <Controls className="print:hidden" style={{ display: 'flex', flexDirection: 'column', backgroundColor: '#222', fill: '#ccc', border: '1px solid #333' }} />
        <Background className="print:hidden" color="#333" gap={16} />
      </ReactFlow>
    </div>
  );
}
