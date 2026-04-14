import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { Placeholder } from "@tiptap/extension-placeholder";
import { useAppStore } from "../store";
import { useEffect, useState, useCallback } from "react";
import html2pdf from 'html2pdf.js';
import { MaterialLink } from "./extensions/MaterialLink";
import {
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Undo,
  Redo,
  Save,
  Table as TableIcon,
  Printer,
} from "lucide-react";

const MenuBar = ({ editor, onSave }: { editor: any; onSave: () => void }) => {
  // Force a re-render when the editor state changes so active buttons update
  const [, setForceUpdate] = useState(0);

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

  const handleExportPDF = () => {
    // We target the editor wrapper
    const element = document.getElementById('lesson-plan-container');
    if (!element) return;
    
    const opt = {
      margin:       10,
      filename:     'lesson-plan.pdf',
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    // Before printing, add print class to body so index.css print styles apply to html2pdf canvas
    document.body.classList.add('printing');
    
    html2pdf().set(opt).from(element).save().then(() => {
      document.body.classList.remove('printing');
    });
  };

  if (!editor) {
    return null;
  }

  return (
    <div className="flex items-center justify-between border-b border-[#333333] bg-[#1e1e1e] p-2 rounded-t-xl mb-4 print:hidden">
      <div className="flex items-center gap-1 flex-wrap">
        <button
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={!editor.can().chain().focus().toggleBold().run()}
          className={`p-2 rounded-md transition-colors ${
            editor.isActive("bold") ? "bg-[#333] text-white" : "text-gray-400 hover:bg-[#2d2d2d] hover:text-gray-200"
          }`}
        >
          <Bold className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={!editor.can().chain().focus().toggleItalic().run()}
          className={`p-2 rounded-md transition-colors ${
            editor.isActive("italic") ? "bg-[#333] text-white" : "text-gray-400 hover:bg-[#2d2d2d] hover:text-gray-200"
          }`}
        >
          <Italic className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleStrike().run()}
          disabled={!editor.can().chain().focus().toggleStrike().run()}
          className={`p-2 rounded-md transition-colors ${
            editor.isActive("strike") ? "bg-[#333] text-white" : "text-gray-400 hover:bg-[#2d2d2d] hover:text-gray-200"
          }`}
        >
          <Strikethrough className="w-4 h-4" />
        </button>

        <div className="w-px h-6 bg-[#333333] mx-1"></div>

        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          className={`p-2 rounded-md transition-colors ${
            editor.isActive("heading", { level: 1 }) ? "bg-[#333] text-white" : "text-gray-400 hover:bg-[#2d2d2d] hover:text-gray-200"
          }`}
        >
          <Heading1 className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={`p-2 rounded-md transition-colors ${
            editor.isActive("heading", { level: 2 }) ? "bg-[#333] text-white" : "text-gray-400 hover:bg-[#2d2d2d] hover:text-gray-200"
          }`}
        >
          <Heading2 className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={`p-2 rounded-md transition-colors ${
            editor.isActive("heading", { level: 3 }) ? "bg-[#333] text-white" : "text-gray-400 hover:bg-[#2d2d2d] hover:text-gray-200"
          }`}
        >
          <Heading3 className="w-4 h-4" />
        </button>

        <div className="w-px h-6 bg-[#333333] mx-1"></div>

        <button
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={`p-2 rounded-md transition-colors ${
            editor.isActive("bulletList") ? "bg-[#333] text-white" : "text-gray-400 hover:bg-[#2d2d2d] hover:text-gray-200"
          }`}
        >
          <List className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={`p-2 rounded-md transition-colors ${
            editor.isActive("orderedList") ? "bg-[#333] text-white" : "text-gray-400 hover:bg-[#2d2d2d] hover:text-gray-200"
          }`}
        >
          <ListOrdered className="w-4 h-4" />
        </button>

        <div className="w-px h-6 bg-[#333333] mx-1"></div>

        <button
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().chain().focus().undo().run()}
          className="p-2 rounded-md text-gray-400 hover:bg-[#2d2d2d] hover:text-gray-200 transition-colors disabled:opacity-50"
        >
          <Undo className="w-4 h-4" />
        </button>
        <button
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().chain().focus().redo().run()}
          className="p-2 rounded-md text-gray-400 hover:bg-[#2d2d2d] hover:text-gray-200 transition-colors disabled:opacity-50"
        >
          <Redo className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleExportPDF}
          className="flex items-center gap-2 px-4 py-1.5 text-sm bg-[#333] hover:bg-[#444] border-none rounded-md text-white font-medium shadow-sm transition-colors"
        >
          <Printer className="w-4 h-4" /> Export PDF
        </button>
        <button
          onClick={onSave}
          className="flex items-center gap-2 px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 border-none rounded-md text-white font-medium shadow-sm transition-colors"
        >
          <Save className="w-4 h-4" /> Save Lesson Plan
        </button>
      </div>
    </div>
  );
};

export function Editor() {
  const { activeFileContent, saveActiveLesson } = useAppStore();
  const [subject, setSubject] = useState(activeFileContent?.metadata?.subject || "");

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "Start typing or add a lesson plan table...",
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: activeFileContent?.content || `<h2>New Lesson Plan</h2>`,
  });

  const insertLessonTable = () => {
    if (!editor) return;

    // We define the column widths: Time (80px), Phase (120px), LTA (350px), Social (100px), Media (150px)
    const colWidths = [80, 120, 350, 100, 150];

    editor
      .chain()
      .focus()
      .insertContent({
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              { type: "tableHeader", attrs: { colwidth: [colWidths[0]] }, content: [{ type: "paragraph", content: [{ type: "text", text: "Time" }] }] },
              { type: "tableHeader", attrs: { colwidth: [colWidths[1]] }, content: [{ type: "paragraph", content: [{ type: "text", text: "Phase" }] }] },
              { type: "tableHeader", attrs: { colwidth: [colWidths[2]] }, content: [{ type: "paragraph", content: [{ type: "text", text: "Learning- / Teaching Arrangement" }] }] },
              { type: "tableHeader", attrs: { colwidth: [colWidths[3]] }, content: [{ type: "paragraph", content: [{ type: "text", text: "Social Form" }] }] },
              { type: "tableHeader", attrs: { colwidth: [colWidths[4]] }, content: [{ type: "paragraph", content: [{ type: "text", text: "Media" }] }] },
            ],
          },
          {
            type: "tableRow",
            content: [
              { type: "tableCell", attrs: { colwidth: [colWidths[0]] }, content: [{ type: "paragraph" }] },
              { type: "tableCell", attrs: { colwidth: [colWidths[1]] }, content: [{ type: "paragraph" }] },
              { type: "tableCell", attrs: { colwidth: [colWidths[2]] }, content: [{ type: "paragraph" }] },
              { type: "tableCell", attrs: { colwidth: [colWidths[3]] }, content: [{ type: "paragraph" }] },
              { type: "tableCell", attrs: { colwidth: [colWidths[4]] }, content: [{ type: "paragraph" }] },
            ],
          },
          {
            type: "tableRow",
            content: [
              { type: "tableCell", attrs: { colwidth: [colWidths[0]] }, content: [{ type: "paragraph" }] },
              { type: "tableCell", attrs: { colwidth: [colWidths[1]] }, content: [{ type: "paragraph" }] },
              { type: "tableCell", attrs: { colwidth: [colWidths[2]] }, content: [{ type: "paragraph" }] },
              { type: "tableCell", attrs: { colwidth: [colWidths[3]] }, content: [{ type: "paragraph" }] },
              { type: "tableCell", attrs: { colwidth: [colWidths[4]] }, content: [{ type: "paragraph" }] },
            ],
          },
        ],
      })
      .run();
  };

  const handleSave = async () => {
    if (!editor) return;
    const json = editor.getJSON();
    await saveActiveLesson(json, { subject });
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return "Not set";
    return new Date(isoString).toLocaleDateString(undefined, {
      weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
    });
  };

  return (
    <div className="max-w-5xl mx-auto w-full print:max-w-none print:w-full">
      <div className="mb-4 flex gap-2 print:hidden">
        <button
          onClick={insertLessonTable}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-[#222] hover:bg-[#2d2d2d] border border-[#333] rounded-md text-white font-medium shadow-sm transition-colors"
        >
          <TableIcon className="w-4 h-4" /> Insert Lesson Table
        </button>
      </div>
      
      <div id="lesson-plan-container" className="bg-[#181818] rounded-xl shadow-sm border border-[#2a2a2a] min-h-[70vh] flex flex-col print:bg-white print:border-none print:shadow-none print:min-h-0">
        <MenuBar editor={editor} onSave={handleSave} />
        
        {activeFileContent?.metadata && (
          <div className="px-8 pb-6 border-b border-[#2a2a2a] print:border-b-2 print:border-gray-300 mb-6">
            <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm text-gray-400 print:text-black">
               <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-300 print:text-black min-w-[90px]">Teacher:</span> 
                  <span className="print:text-black">{activeFileContent.metadata.teacher}</span>
               </div>
               <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-300 print:text-black min-w-[90px]">Created:</span> 
                  <span className="print:text-black">{formatDate(activeFileContent.metadata.createdAt)}</span>
               </div>
               <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-300 print:text-black min-w-[90px]">Planned For:</span> 
                  <span className="print:text-black">{formatDate(activeFileContent.metadata.plannedFor)}</span>
               </div>
               <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-300 print:text-black min-w-[90px]">Subject:</span>
                  <input 
                    type="text" 
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g. Mathematics"
                    className="flex-1 bg-[#222] border border-[#333] rounded px-2 py-1.5 text-white text-sm outline-none focus:border-blue-500 print:bg-transparent print:border-none print:p-0 print:text-black"
                  />
               </div>
            </div>
          </div>
        )}

        <div className="px-8 pb-8 flex-1 print:p-0">
          <EditorContent editor={editor} className="h-full" />
        </div>
      </div>
    </div>
  );
}
