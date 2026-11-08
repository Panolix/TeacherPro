import { describe, expect, it, vi } from "vitest";
import { finishDocumentClose } from "./closeFlow";

describe("close coordination", () => {
  it("stops the watchdog before disk writes or a pending discard dialog", async () => {
    const order: string[] = [];
    let answer!: (discard: boolean) => void;
    const confirm = vi.fn(async () => {});
    const pending = finishDocumentClose({
      acknowledge: async () => { order.push("acknowledge"); },
      flush: async () => { order.push("flush"); return { ok: false, failures: 1 }; },
      askDiscard: () => { order.push("ask"); return new Promise(resolve => { answer = resolve; }); },
      confirm,
    });
    await vi.waitFor(() => expect(order).toEqual(["acknowledge", "flush", "ask"]));
    expect(confirm).not.toHaveBeenCalled();
    answer(false);
    await expect(pending).resolves.toBe(false);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("confirms only after a successful flush or explicit discard", async () => {
    for (const ok of [true, false]) {
      const askDiscard = vi.fn(async () => true);
      const confirm = vi.fn(async () => {});
      await expect(finishDocumentClose({
        acknowledge: async () => {}, flush: async () => ({ ok, failures: ok ? 0 : 1 }),
        askDiscard, confirm,
      })).resolves.toBe(true);
      expect(confirm).toHaveBeenCalledOnce();
      expect(askDiscard).toHaveBeenCalledTimes(ok ? 0 : 1);
    }
  });

  it("does not close when acknowledgement or the dialog fails", async () => {
    const confirm = vi.fn(async () => {});
    await expect(finishDocumentClose({
      acknowledge: async () => { throw new Error("IPC unavailable"); },
      flush: async () => ({ ok: true, failures: 0 }), askDiscard: async () => true, confirm,
    })).rejects.toThrow("IPC unavailable");
    expect(confirm).not.toHaveBeenCalled();
  });
});
