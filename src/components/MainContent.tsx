import { FolderOpen } from "lucide-react";
import { useAppStore } from "../store";
import { useTranslation } from "../i18n/useTranslation";
import { Editor } from "./Editor";
import { CalendarView } from "./CalendarView";
import { MindmapView } from "./MindmapView";
import { TopBar } from "./TopBar";
import { StatusBar } from "./StatusBar";
import { Button } from "./ui/Button";

export function MainContent() {
  const { t } = useTranslation();
  const {
    isInitialized,
    vaultPath,
    openVault,
    activeFilePath,
    activeFileContent,
    currentView,
  } = useAppStore();
  const editorDocumentOpen = currentView === "editor" && !!activeFilePath;
  // Remount the editor when the document identity changes. This gives each
  // lesson a fresh TipTap history, so Ctrl+Z can never restore content from
  // the previously open lesson. A save-driven rename keeps the same identity.
  const editorDocumentKey =
    activeFileContent?.metadata?.createdAt
      ? `lesson:${activeFileContent.metadata.createdAt}`
      : activeFilePath ?? "lesson";

  return (
    <div
      className="tp-main flex-1 flex flex-col h-full print:bg-white relative min-w-0"
      style={{ background: "var(--tp-bg-app)" }}
    >
      {/* Top management bar (sidebar toggle, view tabs, breadcrumb, actions slot) */}
      <TopBar />

      {/* Main Container */}
      <main
        className={`tp-main-scroll flex-1 relative print:overflow-visible ${
          editorDocumentOpen
            ? "overflow-hidden"
            : "overflow-y-auto [scrollbar-width:thin] [scrollbar-color:#3a3a3a_#161616] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-[#161616] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#3a3a3a]"
        }`}
      >
        {!isInitialized ? (
          <LaunchSkeleton />
        ) : !vaultPath ? (
          <div className="mx-auto mt-24 max-w-xl p-8 text-center">
            <div
              className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-[var(--tp-radius-card)]"
              style={{
                background: "var(--tp-accent-tint)",
                color: "var(--tp-accent)",
              }}
            >
              <FolderOpen className="h-7 w-7" />
            </div>
            <h1
              className="mb-4 text-[var(--tp-font-display)] font-bold tracking-[-0.02em]"
              style={{ color: "var(--tp-t-1)" }}
            >
              {t("main.welcome")}
            </h1>
            <p
              className="mx-auto mb-8 max-w-md text-[var(--tp-font-body)] leading-relaxed"
              style={{ color: "var(--tp-t-3)" }}
            >
              {t("main.description")}
            </p>

            <Button
              variant="primary"
              onClick={openVault}
              leadingIcon={<FolderOpen className="h-4 w-4" />}
              className="mx-auto"
            >
              {t("main.selectVault")}
            </Button>
          </div>
        ) : (
          <>
            {/* Weekly Calendar: default when no file, or when explicitly selected */}
            {(currentView === "calendar" || (!activeFilePath && currentView !== "mindmap")) && (
              <CalendarView />
            )}

            {/* Editor when file is open and editor view */}
            {activeFilePath && currentView === "editor" && (
              <div className="print:p-0 h-full min-h-0">
                <Editor key={editorDocumentKey} />
              </div>
            )}

            {/* Mindmap view */}
            {currentView === "mindmap" && <MindmapView />}
          </>
        )}
      </main>

      {/* Bottom status bar */}
      <StatusBar />
    </div>
  );
}

/** Neutral first paint while the vault settings load — prevents the welcome
 *  screen from flashing on every launch. */
function LaunchSkeleton() {
  return (
    <div
      className="mx-auto flex h-full max-w-5xl flex-col gap-4 p-8"
      aria-hidden="true"
    >
      <div
        className="h-8 w-48 animate-pulse rounded-[var(--tp-radius-control)]"
        style={{ background: "var(--tp-bg-3)" }}
      />
      <div
        className="h-4 w-72 max-w-full animate-pulse rounded"
        style={{ background: "var(--tp-bg-2)" }}
      />
      <div className="mt-4 grid flex-1 grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="min-h-[160px] animate-pulse rounded-[var(--tp-radius-card)]"
            style={{
              background: "var(--tp-bg-1)",
              border: "1px solid var(--tp-b-1)",
              animationDelay: `${index * 80}ms`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
