import { save } from "@tauri-apps/plugin-dialog";
import { exists, mkdir, writeFile } from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { toCanvas } from "html-to-image";
import { jsPDF } from "jspdf";

type PdfOrientation = "portrait" | "landscape";

interface RenderPdfOptions {
  orientation?: PdfOrientation;
  marginMm?: number;
  scale?: number;
  backgroundColor?: string;
  multiPage?: boolean;
  autoFormat?: boolean;
}

interface SavePdfOptions {
  pdfBytes: Uint8Array;
  fileName: string;
  vaultPath: string;
  dialogTitle: string;
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

  const canvas = await toCanvas(element, {
    pixelRatio: scale,
    cacheBust: true,
    backgroundColor,
    filter: (node: HTMLElement) => {
      // Do not include the preview modal or other print-hidden UI elements
      if (node.classList && typeof node.classList.contains === "function") {
        if (node.classList.contains("print:hidden") || node.classList.contains("pdf-preview-modal")) {
          return false;
        }
      }
      return true;
    },
  });

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

  const imageWidth = printableWidth;
  const imageHeight = (canvas.height * imageWidth) / canvas.width;
  const imageData = canvas.toDataURL("image/png", 1.0);

  pdf.addImage(imageData, "PNG", marginMm, marginMm, imageWidth, imageHeight);

  if (multiPage && imageHeight > printableHeight) {
    let remainingHeight = imageHeight - printableHeight;

    while (remainingHeight > 0) {
      pdf.addPage();
      const yOffset = marginMm - (imageHeight - remainingHeight);
      pdf.addImage(imageData, "PNG", marginMm, yOffset, imageWidth, imageHeight);
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

export async function printPdfBlobUrl(blobUrl: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.left = "-10000px";
    iframe.style.top = "0";
    iframe.style.width = "1px";
    iframe.style.height = "1px";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.src = blobUrl;

    let finished = false;

    const complete = (error?: Error) => {
      if (finished) {
        return;
      }

      finished = true;
      iframe.remove();

      if (error) {
        reject(error);
        return;
      }

      resolve();
    };

    const timeoutTimer = window.setTimeout(
      () => complete(new Error("Timed out while opening the print dialog.")),
      30000,
    );

    const finishWithoutError = () => {
      window.clearTimeout(timeoutTimer);
      complete();
    };

    const finishWithError = (error: unknown) => {
      window.clearTimeout(timeoutTimer);
      if (error instanceof Error) {
        complete(error);
        return;
      }
      complete(new Error(String(error)));
    };

    iframe.onload = () => {
      try {
        const frameWindow = iframe.contentWindow;
        if (!frameWindow) {
          finishWithError(new Error("Could not access PDF print window."));
          return;
        }

        frameWindow.addEventListener("afterprint", finishWithoutError, { once: true });
        frameWindow.focus();
        frameWindow.print();
      } catch (error) {
        finishWithError(error);
      }
    };

    iframe.onerror = () => {
      finishWithError(new Error("Could not load PDF for printing."));
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