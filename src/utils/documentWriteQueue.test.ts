import { describe, expect, it } from "vitest";
import { enqueueDocumentWrite, waitForDocumentWrites } from "./documentWriteQueue";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("document write queue", () => {
  it("serializes writes and continues after a failure", async () => {
    const order: string[] = [];

    const first = enqueueDocumentWrite(async () => {
      await delay(20);
      order.push("first");
      return "first-result";
    });
    const second = enqueueDocumentWrite(async () => {
      order.push("second");
      throw new Error("expected failure");
    });
    const third = enqueueDocumentWrite(async () => {
      order.push("third");
      return "third-result";
    });

    await expect(second).rejects.toThrow("expected failure");
    await expect(first).resolves.toBe("first-result");
    await expect(third).resolves.toBe("third-result");
    await waitForDocumentWrites();

    expect(order).toEqual(["first", "second", "third"]);
  });
});
