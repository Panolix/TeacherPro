import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { File, ExternalLink, Trash2, Eye } from 'lucide-react';
import React from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import { open } from '@tauri-apps/plugin-opener';
import { join } from '@tauri-apps/api/path';
import { useAppStore } from '../../store';

const MaterialLinkComponent = (props: any) => {
  const { vaultPath } = useAppStore();
  const fileName = props.node.attrs.fileName;

  const handleOpen = async () => {
    if (!vaultPath) return;
    try {
      const fullPath = await join(vaultPath, "Materials", fileName);
      await open(fullPath);
    } catch (e) {
      console.error("Failed to open file", e);
    }
  };

  const handleDelete = () => {
    props.deleteNode();
  };

  return (
    <NodeViewWrapper className="inline-block my-2 mx-1">
      <div className="flex items-center gap-3 px-3 py-2 bg-[#222] border border-[#333] rounded-lg group hover:border-blue-500/50 transition-all shadow-sm">
        <File className="w-4 h-4 text-blue-400" />
        <span className="text-sm text-gray-200 font-medium truncate max-w-[200px]">{fileName}</span>
        
        <div className="flex items-center gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            onClick={handleOpen}
            className="p-1 hover:bg-[#333] rounded text-gray-400 hover:text-blue-400 transition-colors"
            title="Open in default app"
          >
            <ExternalLink className="w-3.5 h-3.5" />
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
    </NodeViewWrapper>
  );
};

export const MaterialLink = Node.create({
  name: 'materialLink',
  group: 'inline',
  inline: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      fileName: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'material-link',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['material-link', mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MaterialLinkComponent);
  },
});
