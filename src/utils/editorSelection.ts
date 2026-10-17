/**
 * Clicks in the whitespace above/below the text resolve to a position
 * *between* blocks. Inserting at such a position implicitly wraps inline
 * content in a fresh paragraph (appearing one line away from the click), so
 * snap the selection into the nearest text block first.
 */
export const snapSelectionInsideTextblock = (instance: any) => {
  const { selection } = instance.state;
  if (selection.$from.parent.isTextblock) {
    return;
  }
  const doc = instance.state.doc;
  const isTextblockAt = (p: number) =>
    p >= 0 && p <= doc.content.size && doc.resolve(p).parent.isTextblock;
  let target: number | null = null;
  if (isTextblockAt(selection.from - 1)) {
    target = selection.from - 1;
  } else if (isTextblockAt(selection.from + 1)) {
    target = selection.from + 1;
  }
  if (target !== null) {
    instance.commands.setTextSelection(target);
  }
};
