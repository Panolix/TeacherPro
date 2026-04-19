export interface ContextMenuPositionOptions {
  estimatedWidth: number;
  estimatedHeight: number;
  padding?: number;
}

export function clampContextMenuPosition(
  x: number,
  y: number,
  { estimatedWidth, estimatedHeight, padding = 8 }: ContextMenuPositionOptions,
): { x: number; y: number } {
  return {
    x: Math.max(padding, Math.min(x, window.innerWidth - estimatedWidth - padding)),
    y: Math.max(padding, Math.min(y, window.innerHeight - estimatedHeight - padding)),
  };
}

const CONTEXT_MENU_BASE_CLASS =
  "tp-context-menu tp-context-menu--legacy fixed max-w-[calc(100vw-16px)] max-h-[calc(100vh-16px)] overflow-y-auto";

export function buildContextMenuClassName(extraClasses = ""): string {
  return extraClasses ? `${CONTEXT_MENU_BASE_CLASS} ${extraClasses}` : CONTEXT_MENU_BASE_CLASS;
}
