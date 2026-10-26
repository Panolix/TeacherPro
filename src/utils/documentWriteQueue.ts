/**
 * Serializes document writes (lesson/mindmap saves and renames/deletes that
 * touch the same files). Promise chaining gives us a simple per-process FIFO
 * without any extra dependency: a save that was requested later can never
 * finish before an earlier one, so an older snapshot cannot overwrite a newer
 * one.
 *
 * The chain always resolves; callers still receive the task's real result.
 */
let writeChain: Promise<void> = Promise.resolve();

export function enqueueDocumentWrite<T>(task: () => Promise<T>): Promise<T> {
  const run = writeChain.then(task);
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Wait for every queued document write to finish (or fail). */
export async function waitForDocumentWrites(): Promise<void> {
  // A flush can enqueue another write while we are waiting. Keep observing
  // the chain until no new task has replaced it.
  let observed: Promise<void> | null = null;
  while (observed !== writeChain) {
    observed = writeChain;
    await observed.catch(() => undefined);
  }
}
