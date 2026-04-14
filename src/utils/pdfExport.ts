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
  } = options;

  const canvas = await toCanvas(element, {
    pixelRatio: scale,
    cacheBust: true,
    backgroundColor,
  });

  const pdf = new jsPDF({
    orientation,
    unit: "mm",
    format: "a4",
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
  return URL.createObjectURL(new Blob([pdfBytes], { type: "application/pdf" }));
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
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.src = blobUrl;

    const cleanup = () => {
      iframe.remove();
    };

    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => {
          cleanup();
          resolve();
        }, 600);
      } catch (error) {
        cleanup();
        reject(error);
      }
    };

    iframe.onerror = () => {
      cleanup();
      reject(new Error("Could not load PDF for printing."));
    };

    document.body.appendChild(iframe);
  });
}