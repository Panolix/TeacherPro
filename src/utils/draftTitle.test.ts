import { describe, expect, it } from "vitest";
import { resolveDraftTitle } from "./draftTitle";

describe("resolveDraftTitle", () => {
  it("prefers a topic the user typed in the draft dialog", () => {
    expect(
      resolveDraftTitle("Bruchrechnung", "Mathematik", "Bruchrechnung - Einstieg"),
    ).toBe("Bruchrechnung");
  });

  it("uses the generated title when the seeded topic was left untouched", () => {
    expect(
      resolveDraftTitle("Mathematik", "Mathematik", "Bruchrechnung - Einstieg"),
    ).toBe("Bruchrechnung - Einstieg");
  });

  it("falls back to the seeded topic when the model returns no title", () => {
    expect(resolveDraftTitle("Mathematik", "Mathematik", "   ")).toBe(
      "Mathematik",
    );
  });

  it("returns an empty string when nothing is available", () => {
    expect(resolveDraftTitle("   ", "", " ")).toBe("");
  });
});
