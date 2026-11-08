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
  Plus,
  Loader2,
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
    mindmapActions,
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
      className="tp-topbar @container flex items-center gap-2 px-2 print:hidden min-w-0 overflow-hidden"
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
            className="tp-chrome-btn h-7 w-7 inline-flex items-center justify-center rounded-md"
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
          className={`tp-topbar-tab inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-[12px] font-medium${
            currentView === "calendar" ? " tp-topbar-tab--active" : ""
          }`}
          title={t('topbar.openWeeklyPlanner')}
        >
          <CalendarDays className="w-4 h-4" />
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

      {/* RIGHT — one action slot for the active view */}
      <div className="flex items-center gap-1.5">
        {currentView === "editor" && editorActions && (
          <>
            <TopAct
              label={t('topbar.insertLessonTable')}
              icon={<Table className="w-4 h-4" />}
              onClick={editorActions.insertTable}
            />
            {editorActions.aiEnabled && (
              <TopAct
                label={t('topbar.aiChat')}
                icon={<MessageSquare className="w-4 h-4" />}
                onClick={editorActions.toggleChat}
                active={editorActions.chatOpen}
              />
            )}
            <TopAct
              label={t('topbar.notes')}
              icon={<FileText className="w-4 h-4" />}
              onClick={editorActions.toggleNotes}
              active={editorActions.notesOpen}
            />
            <TopAct
              label={t('topbar.methods')}
              icon={<BookOpen className="w-4 h-4" />}
              onClick={editorActions.toggleMethodBank}
              active={editorActions.methodBankOpen}
            />
            <div
              className="mx-1 h-5 w-px"
              style={{ background: "var(--tp-b-1)" }}
              aria-hidden="true"
            />
            {editorActions.isPdfBusy && (
              <BusyPill label={t('topbar.renderingPdf')} />
            )}
            <TopAct
              iconOnly
              title={t('topbar.previewPdf')}
              icon={<Eye className="w-4 h-4" />}
              onClick={editorActions.preview}
              disabled={editorActions.isPdfBusy}
            />
            <TopAct
              iconOnly
              title={t('topbar.printSavePdf')}
              icon={<Printer className="w-4 h-4" />}
              onClick={editorActions.print}
              disabled={editorActions.isPdfBusy}
            />
            <TopAct
              iconOnly
              title={t('topbar.exportPdf')}
              icon={<Download className="w-4 h-4" />}
              onClick={editorActions.export}
              disabled={editorActions.isPdfBusy}
            />
            <TopAct
              label={t('topbar.save')}
              icon={<Save className="w-4 h-4" />}
              onClick={editorActions.save}
              primary
            />
          </>
        )}

        {currentView === "mindmap" && mindmapActions && (
          <>
            <TopAct
              label={t('topbar.addNode')}
              icon={<Plus className="w-4 h-4" />}
              onClick={mindmapActions.addNode}
            />
            <div
              className="mx-1 h-5 w-px"
              style={{ background: "var(--tp-b-1)" }}
              aria-hidden="true"
            />
            {mindmapActions.isPdfBusy && (
              <BusyPill label={t('topbar.renderingPdf')} />
            )}
            <TopAct
              iconOnly
              title={t('topbar.previewPdf')}
              icon={<Eye className="w-4 h-4" />}
              onClick={mindmapActions.preview}
              disabled={mindmapActions.isPdfBusy}
            />
            <TopAct
              iconOnly
              title={t('topbar.printSavePdf')}
              icon={<Printer className="w-4 h-4" />}
              onClick={mindmapActions.print}
              disabled={mindmapActions.isPdfBusy}
            />
            <TopAct
              iconOnly
              title={t('topbar.exportPdf')}
              icon={<Download className="w-4 h-4" />}
              onClick={mindmapActions.export}
              disabled={mindmapActions.isPdfBusy}
            />
            <TopAct
              label={t('topbar.save')}
              icon={<Save className="w-4 h-4" />}
              onClick={mindmapActions.save}
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
  const showActionButtonLabels = useAppStore((s) => s.showActionButtonLabels);
  const toneClass = primary
    ? "border border-transparent bg-[var(--tp-accent)] text-white hover:brightness-110"
    : active
      ? "border border-[var(--tp-accent)] bg-[var(--tp-accent-tint)] text-[var(--tp-accent)]"
      : "border border-[var(--tp-b-1)] text-[var(--tp-t-2)] hover:bg-[var(--tp-bg-4)] hover:text-[var(--tp-t-1)]";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      aria-label={title ?? label}
      aria-pressed={active}
      className={`inline-flex h-[var(--tp-control-md)] select-none items-center gap-1.5 rounded-[var(--tp-radius-control)] text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${toneClass}`}
      style={{
        padding: iconOnly ? "0 6px" : "0 10px",
      }}
    >
      {icon}
      {!iconOnly && label && showActionButtonLabels && (
        <span className="hidden @min-[1000px]:inline">{label}</span>
      )}
    </button>
  );
}

/** Compact, non-blocking progress hint for multi-second PDF work. */
function BusyPill({ label }: { label: string }) {
  return (
    <span
      className="hidden items-center gap-1.5 text-[var(--tp-font-body-sm)] @min-[900px]:inline-flex"
      style={{ color: "var(--tp-t-3)" }}
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      {label}
    </span>
  );
}

