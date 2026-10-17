/** Platform-specific display labels for keyboard shortcuts in tooltips. */

export const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.platform);

export const MOD_LABEL = IS_MAC ? "⌘" : "Ctrl";

export const UNDO_LABEL = `${MOD_LABEL}+Z`;

export const REDO_LABEL = IS_MAC ? `${MOD_LABEL}+Shift+Z` : `${MOD_LABEL}+Y`;
