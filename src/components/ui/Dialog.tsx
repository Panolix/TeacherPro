import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { IconButton } from "./IconButton";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Max width in px. */
  width?: number;
  /** Accessible label for the close control. */
  closeLabel?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * One modal primitive: animated entry, Escape/backdrop close, focus trap and
 * focus restoration. Every hand-rolled dialog in the app should use this so
 * keyboard behaviour is never accidental.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 420,
  closeLabel = "Close",
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  // Keep the latest callback without re-running the focus effect whenever the
  // parent passes a fresh inline function.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const preferred = panel.querySelector<HTMLElement>("[data-autofocus]");
      const first = panel.querySelector<HTMLElement>(FOCUSABLE);
      (preferred ?? first ?? panel).focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((item) => item.offsetParent !== null);
      if (items.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown, true);
      previousFocusRef.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[var(--tp-z-modal)] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
        onMouseDown={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="tp-modal-card relative flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden rounded-[var(--tp-radius-modal)] shadow-2xl"
        style={{
          maxWidth: `${width}px`,
          background: "var(--tp-bg-1)",
          border: "1px solid var(--tp-b-2)",
        }}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div
          className="flex shrink-0 items-start justify-between gap-4 px-5 py-4"
          style={{ borderBottom: "1px solid var(--tp-b-1)" }}
        >
          <div className="min-w-0">
            <h3
              className="text-[var(--tp-font-title)] font-semibold leading-tight"
              style={{ color: "var(--tp-t-1)" }}
            >
              {title}
            </h3>
            {description && (
              <p
                className="mt-1 text-[var(--tp-font-body-sm)] leading-relaxed"
                style={{ color: "var(--tp-t-3)" }}
              >
                {description}
              </p>
            )}
          </div>
          <IconButton
            label={closeLabel}
            onClick={onClose}
            size="sm"
            icon={<X className="h-4 w-4" />}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>

        {footer && (
          <div
            className="flex shrink-0 items-center justify-end gap-2 px-5 py-3"
            style={{ borderTop: "1px solid var(--tp-b-1)" }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
