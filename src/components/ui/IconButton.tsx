import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

export type IconButtonSize = "sm" | "md" | "lg";
export type IconButtonTone = "default" | "active" | "danger";

const SIZE_CLASS: Record<IconButtonSize, string> = {
  sm: "h-[var(--tp-control-sm)] w-[var(--tp-control-sm)]",
  md: "h-[var(--tp-control-md)] w-[var(--tp-control-md)]",
  lg: "h-[var(--tp-control-lg)] w-[var(--tp-control-lg)]",
};

const TONE_CLASS: Record<IconButtonTone, string> = {
  default:
    "text-[var(--tp-t-3)] hover:bg-[var(--tp-bg-4)] hover:text-[var(--tp-t-1)]",
  active:
    "bg-[var(--tp-accent-tint)] text-[var(--tp-accent)] hover:bg-[var(--tp-accent-tint)]",
  danger:
    "text-[var(--tp-t-3)] hover:bg-[rgba(239,68,68,0.12)] hover:text-[#f87171]",
};

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  /** Required: icon-only controls need an accessible name. */
  label: string;
  icon: ReactNode;
  size?: IconButtonSize;
  tone?: IconButtonTone;
  busy?: boolean;
  showTooltip?: boolean;
}

/**
 * Square icon control with a guaranteed accessible name. Use `label` for the
 * aria-label and hover title; keep the visible UI icon-only.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      label,
      icon,
      size = "md",
      tone = "default",
      busy = false,
      showTooltip = true,
      className = "",
      disabled,
      type = "button",
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || busy}
        aria-label={label}
        aria-busy={busy || undefined}
        title={showTooltip ? label : undefined}
        className={[
          "inline-flex shrink-0 select-none items-center justify-center rounded-[var(--tp-radius-control)] transition-colors disabled:cursor-not-allowed disabled:opacity-40",
          SIZE_CLASS[size],
          TONE_CLASS[tone],
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        {...rest}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          icon
        )}
      </button>
    );
  },
);
