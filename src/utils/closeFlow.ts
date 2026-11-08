import type { FlushResult } from "./closeFlush";

/** A responsive renderer must stop the watchdog before awaiting disk or a user decision. */
export async function finishDocumentClose(actions: {
  acknowledge: () => Promise<unknown>;
  flush: () => Promise<FlushResult>;
  askDiscard: () => Promise<boolean>;
  confirm: () => Promise<unknown>;
}): Promise<boolean> {
  await actions.acknowledge();
  const result = await actions.flush();
  if (!result.ok && !(await actions.askDiscard())) return false;
  await actions.confirm();
  return true;
}
