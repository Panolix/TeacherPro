import { useAppStore } from "../store";

/**
 * StatusBar — bottom rail, visible across all views.
 * Shows vault status and view-specific info.
 */
export function StatusBar() {
  const { vaultPath, currentView, activeFilePath, lessonPlans, mindmaps } = useAppStore();

  const count =
    currentView === "editor"
      ? `${lessonPlans?.length ?? 0} lesson${(lessonPlans?.length ?? 0) === 1 ? "" : "s"}`
      : currentView === "mindmap"
        ? `${mindmaps?.length ?? 0} mindmap${(mindmaps?.length ?? 0) === 1 ? "" : "s"}`
        : null;

  return (
    <div
      className="tp-statusbar flex items-center gap-3 px-3 print:hidden shrink-0"
      style={{
        height: "var(--tp-statusbar-h)",
        background: "var(--tp-bg-1)",
        borderTop: "1px solid var(--tp-b-1)",
        color: "var(--tp-t-4)",
        fontSize: "11px",
      }}
    >
      {vaultPath ? (
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-[5px] w-[5px] rounded-full"
            style={{ background: "var(--tp-green)" }}
          />
          Vault synced
        </span>
      ) : (
        <span>No vault</span>
      )}

      {count && <span>{count}</span>}

      {activeFilePath && currentView === "editor" && (
        <span className="truncate">Editing</span>
      )}

      <div className="flex-1" />
    </div>
  );
}
