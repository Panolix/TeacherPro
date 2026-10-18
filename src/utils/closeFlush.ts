type CloseFlusher = () => Promise<unknown> | void;

/**
 * Registry of flush functions that must run before the window is destroyed.
 * The lesson editor and the mindmap editor register theirs while mounted;
 * App.tsx runs them all when Rust reports a close request, then confirms the
 * close (Rust force-closes after a grace period if the webview never does).
 */
const flushers = new Set<CloseFlusher>();

export function registerCloseFlusher(flusher: CloseFlusher): () => void {
  flushers.add(flusher);
  return () => {
    flushers.delete(flusher);
  };
}

export async function runCloseFlushers(): Promise<void> {
  for (const flusher of Array.from(flushers)) {
    try {
      await flusher();
    } catch (error) {
      console.error("Close flush failed:", error);
    }
  }
}
