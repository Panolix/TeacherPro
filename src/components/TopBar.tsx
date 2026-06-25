import { useRef } from "react";
import {
  ChevronRight,
  PanelLeft,
  FileText,
  CalendarDays,
  MessageSquare,
  BookOpen,
  Eye,
  Printer,
  Download,
  Save,
  Table,
} from "lucide-react";
import { useAppStore } from "../store";
import { useTranslation } from "../i18n/useTranslation";

/**
 * TopBar — shared management bar across all views.
 * Left:   sidebar toggle + view tabs
 * Center: breadcrumb
 * Right:  view-specific actions (editor actions when a lesson is active)
 */
export function TopBar() {
  const {
    vaultPath,
    activeFilePath,
    currentView,
    sidebarOpen,
    setSidebarOpen,
    setCurrentView,
    editorActions,
  } = useAppStore();
  const { t } = useTranslation();

  const lessonName = activeFilePath
    ? (activeFilePath.split(/[\/\\]/).pop() || "").replace(/\.json$/i, "")
    : null;

  const previousViewRef = useRef<typeof currentView>("editor");

  const toggleWeeklyView = () => {
    if (currentView === "calendar") {
      // Restore previous view
      setCurrentView(previousViewRef.current === "calendar" ? "editor" : previousViewRef.current);
    } else {
      previousViewRef.current = currentView;
      setCurrentView("calendar");
    }
  };

  return (
    <div
      className="tp-topbar flex items-center gap-2 px-2 print:hidden"
      style={{
        height: "var(--tp-topbar-h)",
        background: "var(--tp-bg-1)",
        borderBottom: "1px solid var(--tp-b-1)",
      }}
    >
      {/* LEFT */}
      <div className="flex items-center gap-1">
        {!sidebarOpen && (
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            title={t('topbar.expandSidebar')}
            className="tp-chrome-btn h-8 w-8 inline-flex items-center justify-center rounded-md transition-colors"
            style={{ color: "var(--tp-t-2)" }}
          >
            <PanelLeft className="w-4 h-4" />
          </button>
        )}

        {!sidebarOpen && (
          <div
            className="mx-1 h-5 w-px"
            style={{ background: "var(--tp-b-1)" }}
            aria-hidden="true"
          />
        )}

        {/* Weekly Calendar Mini View */}
        <button
          onClick={toggleWeeklyView}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-[12px] font-medium transition-colors hover:bg-[var(--tp-bg-3)]"
          style={{
            background: currentView === "calendar" ? "var(--tp-bg-3)" : "transparent",
            borderColor: currentView === "calendar" ? "var(--tp-accent)" : "var(--tp-b-1)",
            color: currentView === "calendar" ? "var(--tp-t-1)" : "var(--tp-t-2)",
          }}
          title={t('topbar.openWeeklyPlanner')}
        >
          <CalendarDays className="w-3.5 h-3.5" />
          <span>{t('topbar.weeklyView')}</span>
        </button>
      </div>

      {/* CENTER — breadcrumb */}
      <div
        className="flex-1 min-w-0 flex items-center gap-1.5 px-2 text-[13px]"
        style={{ color: "var(--tp-t-3)" }}
      >
        {vaultPath && (
          <span className="truncate">
            {vaultPath.split(/[\/\\]/).pop()}
          </span>
        )}
        {currentView === "editor" && lessonName && (
          <>
            <ChevronRight className="w-3 h-3 shrink-0 opacity-50" />
            <span
              className="truncate font-medium"
              style={{ color: "var(--tp-t-1)" }}
            >
              {lessonName}
            </span>
          </>
        )}
        {currentView === "mindmap" && (
          <>
            <ChevronRight className="w-3 h-3 shrink-0 opacity-50" />
            <span
              className="truncate font-medium"
              style={{ color: "var(--tp-t-1)" }}
            >
              {lessonName || t('topbar.mindmaps')}
            </span>
          </>
        )}
        {currentView === "calendar" && (
          <>
            <ChevronRight className="w-3 h-3 shrink-0 opacity-50" />
            <span
              className="truncate font-medium"
              style={{ color: "var(--tp-t-1)" }}
            >
              {t('topbar.weeklyPlanner')}
            </span>
          </>
        )}
      </div>

      {/* RIGHT — editor action buttons (shown only when editor is active) */}
      <div className="flex items-center gap-1.5">
        {currentView === "editor" && editorActions && (
          <>
            <TopAct
              label={t('topbar.insertLessonTable')}
              icon={<Table className="w-3.5 h-3.5" />}
              onClick={editorActions.insertTable}
            />
            {editorActions.aiEnabled && (
              <TopAct
                label={t('topbar.aiChat')}
                icon={<MessageSquare className="w-3.5 h-3.5" />}
                onClick={editorActions.toggleChat}
                active={editorActions.chatOpen}
              />
            )}
            <TopAct
              label={t('topbar.notes')}
              icon={<FileText className="w-3.5 h-3.5" />}
              onClick={editorActions.toggleNotes}
              active={editorActions.notesOpen}
            />
            <TopAct
              label={t('topbar.methods')}
              icon={<BookOpen className="w-3.5 h-3.5" />}
              onClick={editorActions.toggleMethodBank}
              active={editorActions.methodBankOpen}
            />
            <div
              className="mx-1 h-5 w-px"
              style={{ background: "var(--tp-b-1)" }}
              aria-hidden="true"
            />
            <TopAct
              iconOnly
              title={t('topbar.previewPdf')}
              icon={<Eye className="w-3.5 h-3.5" />}
              onClick={editorActions.preview}
              disabled={editorActions.isPdfBusy}
            />
            <TopAct
              iconOnly
              title={t('topbar.printSavePdf')}
              icon={<Printer className="w-3.5 h-3.5" />}
              onClick={editorActions.print}
              disabled={editorActions.isPdfBusy}
            />
            <TopAct
              iconOnly
              title={t('topbar.exportPdf')}
              icon={<Download className="w-3.5 h-3.5" />}
              onClick={editorActions.export}
              disabled={editorActions.isPdfBusy}
            />
            <TopAct
              label={t('topbar.save')}
              icon={<Save className="w-3.5 h-3.5" />}
              onClick={editorActions.save}
              primary
            />
          </>
        )}
      </div>
    </div>
  );
}

function TopAct({
  label,
  title,
  icon,
  onClick,
  active,
  primary,
  iconOnly,
  disabled,
}: {
  label?: string;
  title?: string;
  icon: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  primary?: boolean;
  iconOnly?: boolean;
  disabled?: boolean;
}) {
  const bg = primary
    ? "var(--tp-accent)"
    : active
      ? "var(--tp-accent)"
      : "var(--tp-bg-3)";
  const color = primary || active ? "#fff" : "var(--tp-t-1)";
  const border = primary
    ? "var(--tp-accent)"
    : active
      ? "var(--tp-accent)"
      : "var(--tp-b-2)";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      aria-pressed={active}
      className="h-[30px] inline-flex items-center gap-1.5 rounded-md text-[12px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        padding: iconOnly ? "0 8px" : "0 10px",
        background: bg,
        border: `1px solid ${border}`,
        color,
      }}
    >
      {icon}
      {!iconOnly && label && <span>{label}</span>}
    </button>
  );
}

