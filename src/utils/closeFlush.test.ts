import { describe, expect, it } from "vitest";
import { registerCloseFlusher, runCloseFlushers } from "./closeFlush";
import { enqueueDocumentWrite } from "./documentWriteQueue";

describe("close flush registry", () => {
  it("reports a failing flusher instead of silently closing", async () => {
    const unregister = registerCloseFlusher(async () => false);
    try {
      const result = await runCloseFlushers();
      expect(result.ok).toBe(false);
      expect(result.failures).toBe(1);
    } finally {
      unregister();
    }
  });

  it("waits for in-flight document writes", async () => {
    const order: string[] = [];
    void enqueueDocumentWrite(async () => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      order.push("write");
    });

    const result = await runCloseFlushers();
    order.push("after-flush");

    expect(result.ok).toBe(true);
    expect(order).toEqual(["write", "after-flush"]);
  });
});
