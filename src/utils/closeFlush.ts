import { waitForDocumentWrites } from "./documentWriteQueue";

type CloseFlusher = () => Promise<unknown> | void;

export interface FlushResult {
  ok: boolean;
  failures: number;
}

/**
 * Registry of flush functions that must run before the window is destroyed
 * or before switching to another document. The lesson editor and the mindmap
 * editor register theirs while mounted; App.tsx runs them all when Rust
 * reports a close request, then confirms the close.
 */
const flushers = new Set<CloseFlusher>();

export function registerCloseFlusher(flusher: CloseFlusher): () => void {
  flushers.add(flusher);
  return () => {
    flushers.delete(flusher);
  };
}

export async function runCloseFlushers(): Promise<FlushResult> {
  let failures = 0;

  for (const flusher of Array.from(flushers)) {
    try {
      const result = await flusher();
      if (result === false) {
        failures += 1;
      }
    } catch (error) {
      console.error("Close flush failed:", error);
      failures += 1;
    }
  }

  // Even a component that already unmounted may have left an in-flight write
  // behind. Never let the window close before that write has finished.
  await waitForDocumentWrites();

  return { ok: failures === 0, failures };
}

/**
 * Semantic alias used when switching documents or mutating the active path.
 * It is the same registry as the close flow, so there is only one flush
 * implementation to keep correct.
 */
export const flushOpenDocuments = runCloseFlushers;
