import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useTranslation } from "../../i18n/useTranslation";

interface Props {
  url: string | null;
  onClose: () => void;
  onPrint: () => void;
}

/** Full-screen PDF preview for the lesson plan export. */
export function LessonPdfPreviewModal({ url, onClose, onPrint }: Props) {
  const { t } = useTranslation();
  const modalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!url) {
      return;
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    // The PDF iframe steals focus on load and after every click inside it,
    // which prevents the parent window from receiving keydown (so Escape dies).
    // We work around this by reclaiming focus to the modal whenever the
    // window blurs (i.e. focus moved to the iframe) - keyboard scrolling
    // inside the PDF is sacrificed but Esc / standard shortcuts work.
    const reclaimFocus = () => {
      // Only reclaim if focus actually went to the iframe, not to another
      // app/window.
      requestAnimationFrame(() => {
        const active = document.activeElement;
        if (active && active.tagName === "IFRAME") {
          (active as HTMLIFrameElement).blur();
          modalRef.current?.focus();
        }
      });
    };

    window.addEventListener("keydown", closeOnEscape, true);
    window.addEventListener("blur", reclaimFocus, true);
    requestAnimationFrame(() => {
      modalRef.current?.focus();
    });

    return () => {
      window.removeEventListener("keydown", closeOnEscape, true);
      window.removeEventListener("blur", reclaimFocus, true);
    };
  }, [url, onClose]);

  if (!url) {
    return null;
  }

  const handleBackdropMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[78] bg-black/65 p-6 flex items-center justify-center print:hidden pdf-preview-modal"
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={t("editor.pdf.lessonPlanPreview")}
        className="tp-preview-surface w-full max-w-6xl h-[88vh] bg-[#161616] border border-[#333] rounded-xl shadow-2xl overflow-hidden"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="h-12 border-b border-[#333] px-4 flex items-center justify-between">
          <div className="text-sm text-gray-200 font-medium">{t("editor.pdf.lessonPlanPreview")}</div>
          <div className="flex items-center gap-2">
            <button
              onClick={onPrint}
              className="px-3 py-1.5 text-[12.5px] rounded-md border border-[#444] bg-[#252525] text-gray-200 hover:bg-[var(--tp-bg-4)] hover:text-[var(--tp-t-1)]"
            >
              {t("editor.pdf.printSavePDF")}
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded text-gray-400 hover:text-[var(--tp-t-1)] hover:bg-[var(--tp-bg-4)]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <iframe src={url} title={t("editor.pdf.lessonPlanPreview")} className="w-full h-[calc(88vh-48px)] bg-white" />
      </div>
    </div>
  );
}
