import { save } from "@tauri-apps/plugin-dialog";
import { exists, mkdir, writeFile } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { toCanvas } from "html-to-image";
import { jsPDF } from "jspdf";

type PdfOrientation = "portrait" | "landscape";

/**
 * Error carrying an i18n key so callers can show a localized message
 * (they interpolate `String(error)` into already-translated alert texts).
 */
export class PdfExportError extends Error {
  messageKey: string;
  constructor(messageKey: string) {
    super(messageKey);
    this.name = "PdfExportError";
    this.messageKey = messageKey;
  }
}

interface RenderPdfOptions {
  orientation?: PdfOrientation;
  marginMm?: number;
  scale?: number;
  backgroundColor?: string;
  multiPage?: boolean;
  autoFormat?: boolean;
}

/**
 * Pixel ratio used when rasterizing lesson/mindmap exports.
 *
 * The export layouts are sized so CSS pixels map 1:1 to print millimetres at
 * 96 DPI, which means the effective print resolution is `ratio × 96` DPI.
 * 3.125 therefore yields the ~300 DPI expected of print-quality documents
 * (the previous value of 2 only produced ~192 DPI and looked soft when
 * printed).
 */
export const PRINT_PDF_PIXEL_RATIO = 3.125;

interface SavePdfOptions {
  pdfBytes: Uint8Array;
  fileName: string;
  vaultPath: string;
  dialogTitle: string;
}

/**
 * html-to-image rejects with a raw DOM `Event` (not an Error) when a resource
 * inside the snapshot fails to load, which stringifies to the useless
 * "[object Event]". Turn it into something actionable for alerts/logs.
 */
export function describePdfRenderError(error: unknown): string {
  if (typeof Event !== "undefined" && error instanceof Event) {
    const target = error.target as HTMLImageElement | null;
    const tag = target?.tagName ? `<${target.tagName.toLowerCase()}>` : "";
    const src = target?.src ? ` src=${target.src.slice(0, 120)}` : "";
    return `snapshot resource failed to load (${error.type} ${tag}${src})`;
  }
  return String(error);
}

function collectSnapshotResources(root: HTMLElement): string {
  const found: string[] = [];
  root.querySelectorAll("img").forEach((node) => {
    found.push(`img:${node.currentSrc || node.src || "(empty src)"}`);
  });
  root.querySelectorAll("image").forEach((node) => {
    const href = (node as SVGImageElement).href?.baseVal ?? "(no href)";
    found.push(`svg-image:${href}`);
  });
  root.querySelectorAll("canvas").forEach(() => found.push("canvas"));
  root.querySelectorAll("video").forEach((node) => {
    const video = node as HTMLVideoElement;
    found.push(`video:${video.currentSrc || video.poster || "(no source)"}`);
  });
  root.querySelectorAll("iframe").forEach((node) => {
    found.push(`iframe:${(node as HTMLIFrameElement).src || "(empty src)"}`);
  });
  return found.length > 0 ? found.join(" | ") : "none";
}

export async function renderElementToPdfBytes(
  element: HTMLElement,
  options: RenderPdfOptions = {},
): Promise<Uint8Array> {
  const {
    orientation = "portrait",
    marginMm = 10,
    scale = 2,
    backgroundColor = "#ffffff",
    multiPage = true,
    autoFormat = false,

  } = options;

  // Rendering races pending webfont loads: a font applied just before
  // exporting could otherwise rasterize with a fallback font.
  if (typeof document !== "undefined" && document.fonts?.ready) {
    await document.fonts.ready;
  }

  const renderOptions = {
    pixelRatio: scale,
    cacheBust: true,
    backgroundColor,
    // A broken image must never abort a preview/print/export.
    onImageErrorHandler: () => undefined,
    filter: (node: HTMLElement) => {
      // Empty-src <img> elements (stale editor artifacts) make html-to-image
      // fetch the document URL itself, which returns text/html and aborts
      // the whole snapshot. They cannot render anyway, so drop them.
      if (node instanceof HTMLImageElement && !(node.currentSrc || node.getAttribute("src"))) {
        return false;
      }
      // Do not include the preview modal or other print-hidden UI elements
      if (node.classList && typeof node.classList.contains === "function") {
        if (node.classList.contains("print:hidden") || node.classList.contains("pdf-preview-modal")) {
          return false;
        }
      }
      return true;
    },
  };

  let canvas: HTMLCanvasElement;
  try {
    canvas = await toCanvas(element, renderOptions);
  } catch (error) {
    if (typeof Event !== "undefined" && error instanceof Event) {
      console.warn("PDF snapshot failed while loading a resource, retrying without embedded webfonts", {
        event: error.type,
        source: describePdfRenderError(error),
      });
      try {
        // Retry without inlining @font-face rules: a failing font resource
        // should not take the whole export down.
        canvas = await toCanvas(element, { ...renderOptions, skipFonts: true });
      } catch (retryError) {
        throw new Error(
          `${describePdfRenderError(retryError)}; snapshot resources in element: ${collectSnapshotResources(element)}`,
        );
      }
    } else {
      throw error;
    }
  }

  const pxToMm = 0.2645833333;
  const pdfOptFormat: string | [number, number] = autoFormat
    ? [
        (canvas.width / scale) * pxToMm + marginMm * 2,
        (canvas.height / scale) * pxToMm + marginMm * 2,
      ]
    : "a4";

  const pdf = new jsPDF({
    orientation,
    unit: "mm",
    format: pdfOptFormat as any,
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const printableWidth = pageWidth - marginMm * 2;
  const printableHeight = pageHeight - marginMm * 2;

  // Draw at the element's true physical size (CSS px → mm at 96 DPI) rather
  // than stretching to the printable width: the export layouts are locked to
  // fixed mm dimensions, so 1:1 keeps 12pt print = 12pt CSS. A narrower
  // printable area simply gets centered (e.g. A4 landscape with 5mm page
  // margins still prints the 281mm-wide lesson content at real size).
  const naturalWidthMm = (canvas.width / scale) * pxToMm;
  const imageWidth = Math.min(naturalWidthMm, printableWidth);
  const imageHeight = (canvas.height * imageWidth) / canvas.width;
  const imageX = marginMm + Math.max(0, (printableWidth - imageWidth) / 2);
  const imageData = canvas.toDataURL("image/png", 1.0);

  pdf.addImage(imageData, "PNG", imageX, marginMm, imageWidth, imageHeight);

  if (multiPage && imageHeight > printableHeight) {
    let remainingHeight = imageHeight - printableHeight;

    while (remainingHeight > 0) {
      pdf.addPage();
      const yOffset = marginMm - (imageHeight - remainingHeight);
      pdf.addImage(imageData, "PNG", imageX, yOffset, imageWidth, imageHeight);
      remainingHeight -= printableHeight;
    }
  }

  const arrayBuffer = pdf.output("arraybuffer");
  return new Uint8Array(arrayBuffer);
}

export async function savePdfToVault({
  pdfBytes,
  fileName,
  vaultPath,
  dialogTitle,
}: SavePdfOptions): Promise<string | null> {
  const exportsDir = await join(vaultPath, "Exports");
  const exportsDirExists = await exists(exportsDir);

  if (!exportsDirExists) {
    await mkdir(exportsDir, { recursive: true });
  }

  const defaultPath = await join(exportsDir, fileName);
  const selectedPath = await save({
    title: dialogTitle,
    defaultPath,
    filters: [
      {
        name: "PDF",
        extensions: ["pdf"],
      },
    ],
  });

  if (!selectedPath) {
    return null;
  }

  // Register the chosen destination in the runtime fs scope (canonicalized on
  // the Rust side) so symlinked locations keep working.
  try {
    await invoke("allow_fs_scopes", { paths: [selectedPath] });
  } catch (error) {
    console.warn("Could not register export path", error);
  }

  await writeFile(selectedPath, pdfBytes);
  return selectedPath;
}

export function createPdfBlobUrl(pdfBytes: Uint8Array): string {
  const normalizedBytes = new Uint8Array(Array.from(pdfBytes));
  return URL.createObjectURL(new Blob([normalizedBytes], { type: "application/pdf" }));
}

export function revokePdfBlobUrl(url: string | null): void {
  if (!url) {
    return;
  }

  URL.revokeObjectURL(url);
}

const PRINT_PDF_LOAD_TIMEOUT_MS = 15000;
// The print preview can stay open as long as the user likes; the hidden
// iframe and the blob URL must survive until it is gone. After this safety
// window they are dropped even if `afterprint` never fired at all.
const PRINT_PDF_CLEANUP_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Opens the platform print dialog for a PDF served from a blob URL.
 *
 * Takes ownership of `blobUrl`: it is revoked when the hidden iframe is
 * cleaned up, so callers must not revoke it themselves.
 *
 * On Windows (WebView2) the PDF print preview does not reliably dispatch
 * `afterprint` when the user closes it (long-standing Chromium regression),
 * so the returned promise settles as soon as the preview has been handed
 * off to the platform. Waiting for `afterprint` previously left the UI in a
 * permanent "busy" state and, after an artificial timeout, opened a bogus
 * second print of the whole app. Cleanup is deferred: the iframe and blob
 * URL are removed on `afterprint` (best effort) or after a generous safety
 * timeout.
 */
export async function printPdfBlobUrl(blobUrl: string): Promise<void> {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.left = "-10000px";
  iframe.style.top = "0";
  iframe.style.width = "1px";
  iframe.style.height = "1px";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.src = blobUrl;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let removed = false;
    let loadTimer = 0;

    const cleanup = () => {
      if (removed) {
        return;
      }
      removed = true;
      window.clearTimeout(loadTimer);
      window.removeEventListener("afterprint", cleanup);
      iframe.contentWindow?.removeEventListener("afterprint", cleanup);
      iframe.remove();
      revokePdfBlobUrl(blobUrl);
    };

    const settle = (error?: Error) => {
      if (settled) {
        return;
      }
      settled = true;

      if (error) {
        cleanup();
        reject(error);
        return;
      }

      resolve();
    };

    loadTimer = window.setTimeout(
      () => settle(new PdfExportError("pdfExport.printDialogTimeout")),
      PRINT_PDF_LOAD_TIMEOUT_MS,
    );

    iframe.onload = () => {
      if (settled) {
        return;
      }
      window.clearTimeout(loadTimer);

      try {
        const frameWindow = iframe.contentWindow;
        if (!frameWindow) {
          settle(new PdfExportError("pdfExport.printWindowAccess"));
          return;
        }

        // Register cleanup hooks before printing: some environments fire
        // `afterprint` on the main window instead of inside the iframe.
        frameWindow.addEventListener("afterprint", cleanup, { once: true });
        window.addEventListener("afterprint", cleanup, { once: true });
        window.setTimeout(cleanup, PRINT_PDF_CLEANUP_TIMEOUT_MS);

        frameWindow.focus();
        frameWindow.print();
        settle();
      } catch (error) {
        settle(error instanceof Error ? error : new Error(String(error)));
      }
    };

    iframe.onerror = () => {
      settle(new PdfExportError("pdfExport.printLoad"));
    };

    document.body.appendChild(iframe);
  });
}

export async function printCurrentWindow(additionalBodyClassNames: string[] = []): Promise<void> {
  const { body } = document;
  additionalBodyClassNames.forEach((className) => body.classList.add(className));

  await new Promise<void>((resolve) => {
    let finished = false;

    const complete = () => {
      if (finished) {
        return;
      }
      finished = true;
      window.removeEventListener("afterprint", onAfterPrint);
      resolve();
    };

    const onAfterPrint = () => complete();
    window.addEventListener("afterprint", onAfterPrint, { once: true });

    try {
      // Keep print call in the same click call stack as much as possible.
      window.print();
    } finally {
      // Fallback for environments that don't emit afterprint reliably.
      setTimeout(() => complete(), 1800);
    }
  });

  additionalBodyClassNames.forEach((className) => body.classList.remove(className));
}