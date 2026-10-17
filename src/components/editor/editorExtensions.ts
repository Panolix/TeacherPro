import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";

/**
 * TextAlign with Word-compatible keyboard shortcuts:
 * Mod+E centre, Mod+L left, Mod+R right, Mod+J justify.
 */
export const WordStyleTextAlign = TextAlign.extend({
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      "Mod-e": () => this.editor.commands.setTextAlign("center"),
      "Mod-l": () => this.editor.commands.setTextAlign("left"),
      "Mod-r": () => this.editor.commands.setTextAlign("right"),
      "Mod-j": () => this.editor.commands.setTextAlign("justify"),
    };
  },
});

/**
 * Link mark whose Mod+K shortcut opens the app's link popover.
 * (Default Link behaviour must never let the webview navigate away.)
 */
export const AppLink = Link.extend({
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),
      "Mod-k": () => {
        window.dispatchEvent(new CustomEvent("tp:open-link-popover"));
        return true;
      },
    };
  },
});
