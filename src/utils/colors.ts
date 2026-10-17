/**
 * Normalizes arbitrary CSS color values (hex, short hex, rgb/rgba) into a
 * 6-digit lowercase hex string suitable for `<input type="color">`.
 */
export function normalizeColorForPicker(colorValue: unknown, fallback: string): string {
  if (typeof colorValue !== "string") {
    return fallback;
  }

  const trimmed = colorValue.trim();
  const shortHex = trimmed.match(/^#([0-9a-fA-F]{3})$/);
  if (shortHex) {
    const [r, g, b] = shortHex[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }

  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  const rgbMatch = trimmed.match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[0-9.]+)?\s*\)$/i,
  );
  if (rgbMatch) {
    const rgb = rgbMatch
      .slice(1, 4)
      .map((chunk) => Math.max(0, Math.min(255, Number(chunk))));
    return `#${rgb.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
  }

  return fallback;
}
