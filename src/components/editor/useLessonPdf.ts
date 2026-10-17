import { useCallback, useEffect, useState } from "react";
import { type as osType } from "@tauri-apps/plugin-os";
import { useTranslation } from "../../i18n/useTranslation";
import {
  createPdfBlobUrl,
  describePdfRenderError,
  PdfExportError,
  PRINT_PDF_PIXEL_RATIO,
  printCurrentWindow,
  printPdfBlobUrl,
  renderElementToPdfBytes,
  revokePdfBlobUrl,
  savePdfToVault,
} from "../../utils/pdfExport";

interface UseLessonPdfOptions {
  vaultPath: string | null;
  subject: string;
  teacher: string;
  plannedForInput: string;
  selectedSubjectColor: string | null;
  /** Closes transient UI (context menus, popovers) before printing. */
  closeTransientUi: () => void;
}

/**
 * Lesson PDF pipeline: builds the snapshot PDF and exposes the
 * preview / print / export actions plus their busy + blob-URL state.
 */
export function useLessonPdf({
  vaultPath,
  subject,
  teacher,
  plannedForInput,
  selectedSubjectColor,
  closeTransientUi,
}: UseLessonPdfOptions) {
  const { t } = useTranslation();
  const [isPdfBusy, setIsPdfBusy] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);

  // Release the preview blob whenever it is replaced or the editor unmounts.
  useEffect(() => {
    return () => {
      revokePdfBlobUrl(pdfPreviewUrl);
    };
  }, [pdfPreviewUrl]);

  const closePdfPreview = useCallback(() => setPdfPreviewUrl(null), []);

  const createLessonPdf = async (): Promise<{ pdfBytes: Uint8Array; fileName: string }> => {
    const sourceElement = document.getElementById("lesson-plan-export-content");
    if (!sourceElement) {
      throw new Error(t("editor.pdf.noContent"));
    }

    const exportHost = document.createElement("div");
    exportHost.style.position = "fixed";
    exportHost.style.left = "-100000px";
    exportHost.style.top = "0";
    exportHost.style.pointerEvents = "none";
    exportHost.style.opacity = "0";
    exportHost.style.zIndex = "-1";

    const clonedElement = sourceElement.cloneNode(true) as HTMLElement;
    clonedElement.classList.add("tp-export-light-clone");

    // Force A4 Landscape exact printable inner-width (~1062px at 96 DPI for 281mm printable area).
    // This physically guarantees 12pt web font equals 12pt print font without responsive container stretching/shrinking.
    // Read from the same CSS var that drives the on-screen paper — single source of truth.
    const exportWidth =
      parseInt(
        getComputedStyle(document.documentElement)
          .getPropertyValue("--tp-export-content-w")
          .trim(),
        10,
      ) || 1062;
    clonedElement.style.width = `${exportWidth}px`;
    clonedElement.style.maxWidth = `${exportWidth}px`;
    clonedElement.style.minWidth = `${exportWidth}px`;

    clonedElement
      .querySelectorAll<HTMLElement>(".lesson-export-input, .lesson-export-planned-input, .lesson-export-calendar-trigger, .lesson-export-calendar-popover")
      .forEach((node) => {
        node.style.display = "none";
      });

    const subjectPicker = clonedElement.querySelector<HTMLElement>(".lesson-export-subject-picker");
    if (subjectPicker) {
      subjectPicker.style.display = "none";
    }

    const subjectText = clonedElement.querySelector<HTMLElement>(".lesson-export-subject-text");
    if (subjectText) {
      subjectText.style.display = "inline-flex";
      subjectText.style.alignItems = "center";
      subjectText.style.gap = "6px";
    }

    const subjectName = clonedElement.querySelector<HTMLElement>(".lesson-export-subject-name-print");
    if (subjectName) {
      subjectName.textContent = subject.trim() || t("editor.meta.notSet");
    } else if (subjectText) {
      subjectText.textContent = subject.trim() || t("editor.meta.notSet");
    }

    const exportSubjectDot = clonedElement.querySelector<HTMLElement>(".lesson-export-subject-dot-print");
    if (exportSubjectDot) {
      if (selectedSubjectColor) {
        exportSubjectDot.style.display = "inline-block";
        exportSubjectDot.style.backgroundColor = selectedSubjectColor;
      } else {
        exportSubjectDot.style.display = "none";
      }
    }

    const teacherText = clonedElement.querySelector<HTMLElement>(".lesson-export-teacher-text");
    if (teacherText) {
      teacherText.textContent = teacher.trim() || t("editor.meta.notSet");
      teacherText.style.display = "inline";
    }

    const plannedText = clonedElement.querySelector<HTMLElement>(".lesson-export-planned-text");
    if (plannedText) {
      plannedText.textContent = plannedForInput.trim() || t("editor.meta.notSet");
      plannedText.style.display = "inline";
    }

    exportHost.appendChild(clonedElement);
    document.body.appendChild(exportHost);

    try {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });

      const normalizedSubject =
        subject.trim().replace(/[^a-zA-Z0-9\-\s_]/g, "").replace(/\s+/g, "-") || "lesson-plan";
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const fileName = `${normalizedSubject}-${stamp}.pdf`;

      const pdfBytes = await renderElementToPdfBytes(clonedElement, {
        orientation: "landscape",
        marginMm: 5,
        scale: PRINT_PDF_PIXEL_RATIO,
        backgroundColor: "#ffffff",
        multiPage: true,
      });

      return { pdfBytes, fileName };
    } finally {
      exportHost.remove();
    }
  };

  const handleExportPDF = async () => {
    if (!vaultPath) {
      alert(t("editor.pdf.pleaseOpenVault"));
      return;
    }

    setIsPdfBusy(true);

    try {
      const { pdfBytes, fileName } = await createLessonPdf();

      const savedPath = await savePdfToVault({
        pdfBytes,
        fileName,
        vaultPath,
        dialogTitle: t("editor.pdf.exportDialogTitle"),
      });

      if (savedPath) {
        alert(t("editor.pdf.exportedSuccessfully"));
      }
    } catch (error) {
      console.error("Lesson PDF export failed:", error);
      alert(t("editor.pdf.exportFailed", { error: error instanceof PdfExportError ? t(error.messageKey) : describePdfRenderError(error) }));
    } finally {
      setIsPdfBusy(false);
    }
  };

  const handlePreviewPDF = async () => {
    setIsPdfBusy(true);

    try {
      const { pdfBytes } = await createLessonPdf();
      const nextUrl = createPdfBlobUrl(pdfBytes);
      setPdfPreviewUrl((previous) => {
        revokePdfBlobUrl(previous);
        return nextUrl;
      });
    } catch (error) {
      console.error("Lesson PDF preview failed:", error);
      alert(t("editor.pdf.previewFailed", { error: describePdfRenderError(error) }));
    } finally {
      setIsPdfBusy(false);
    }
  };

  const handlePrintPDF = async () => {
    if (!vaultPath) {
      alert(t("editor.pdf.pleaseOpenVault"));
      return;
    }

    setIsPdfBusy(true);

    try {
      closeTransientUi();

      const { pdfBytes, fileName } = await createLessonPdf();

      if (osType() === "windows") {
        // printPdfBlobUrl owns the blob URL lifecycle (it keeps it alive
        // while the print preview is open and revokes it on cleanup), so no
        // manual revoke here.
        try {
          await printPdfBlobUrl(createPdfBlobUrl(pdfBytes));
          return;
        } catch (printError) {
          console.warn(
            "Lesson PDF blob print failed on Windows, falling back to webview print dialog.",
            printError,
          );
          await printCurrentWindow(["tp-exporting"]);
          return;
        }
      }

      const { tempDir, join } = await import("@tauri-apps/api/path");
      const { writeFile } = await import("@tauri-apps/plugin-fs");
      const { invoke } = await import("@tauri-apps/api/core");

      const sysTempDir = await tempDir();
      const tempPdfPath = await join(sysTempDir, fileName);

      await writeFile(tempPdfPath, pdfBytes);
      await invoke("print_pdf_file", { path: tempPdfPath });
    } catch (error) {
      console.error("Lesson PDF print failed:", error);
      alert(t("editor.pdf.printFailed", { error: error instanceof PdfExportError ? t(error.messageKey) : describePdfRenderError(error) }));
    } finally {
      setIsPdfBusy(false);
    }
  };

  return {
    isPdfBusy,
    pdfPreviewUrl,
    closePdfPreview,
    previewPdf: handlePreviewPDF,
    printPdf: handlePrintPDF,
    exportPdf: handleExportPDF,
  };
}
