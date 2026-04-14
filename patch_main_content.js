const fs = require('fs');

let fileStr = fs.readFileSync('src/components/MainContent.tsx', 'utf8');

const regexToReplaceEditor = /\{\s*currentView === "editor" && activeFilePath && \(\s*<>\s*<ChevronRight className="w-4 h-4 mx-1" \/>\s*<span className="text-gray-300 font-medium">\{getFileName\(\)\}<\/span>\s*<\/>\s*\)\s*\}/s;

const newEditorBlock = `{(currentView === "editor" || currentView === "mindmap") && activeFilePath && (
            <>
              {(() => {
                let parts = [getFileName()];
                if (vaultPath && activeFilePath.startsWith(vaultPath)) {
                  let rel = activeFilePath.substring(vaultPath.length);
                  if (rel.startsWith("/") || rel.startsWith("\\\\")) {
                    rel = rel.substring(1);
                  }
                  parts = rel.split(/[\\/\\\\]/);
                }
                return parts.map((part, index) => (
                  <span key={index} className="flex items-center">
                    <ChevronRight className="w-4 h-4 mx-1" />
                    <span className={index === parts.length - 1 ? "text-gray-300 font-medium" : ""}>
                      {part}
                    </span>
                  </span>
                ));
              })()}
            </>
          )}`;

fileStr = fileStr.replace(regexToReplaceEditor, newEditorBlock);

const regexToReplaceMindmap = /\{\s*currentView === "mindmap" && \(\s*<>\s*<ChevronRight className="w-4 h-4 mx-1" \/>\s*<span className="text-gray-300 font-medium">Mindmaps<\/span>\s*<\/>\s*\)\s*\}/s;

const newMindmapBlock = `{currentView === "mindmap" && !activeFilePath && (
            <>
              <ChevronRight className="w-4 h-4 mx-1" />
              <span className="text-gray-300 font-medium">Mindmaps</span>
            </>
          )}`;

fileStr = fileStr.replace(regexToReplaceMindmap, newMindmapBlock);

fs.writeFileSync('src/components/MainContent.tsx', fileStr);
