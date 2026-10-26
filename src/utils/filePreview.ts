import { readFile } from "@tauri-apps/plugin-fs";

const IMAGE_MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  ico: "image/x-icon",
  avif: "image/avif",
};

/**
 * The Tauri asset protocol is not enabled in this app's configuration, so
 * `convertFileSrc` URLs cannot be loaded by the webview. Reading the file and
 * handing it to the webview as a blob URL works under the existing CSP and
 * does not require widening the asset protocol scope.
 */
export async function createImageBlobUrl(path: string): Promise<string> {
  const extension = (path.split(".").pop() || "").toLowerCase();
  const bytes = await readFile(path);
  const type = IMAGE_MIME_TYPES[extension] ?? "application/octet-stream";
  return URL.createObjectURL(new Blob([bytes], { type }));
}
