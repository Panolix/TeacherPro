import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "h-[var(--tp-control-md)] px-2.5 text-[12px]",
  md: "h-[var(--tp-control-lg)] px-3.5 text-[12px]",
};

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--tp-accent)] text-white hover:brightness-110 border border-transparent",
  secondary:
    "bg-[var(--tp-bg-3)] text-[var(--tp-t-1)] border border-[var(--tp-b-2)] hover:bg-[var(--tp-bg-4)] hover:border-[var(--tp-b-3)]",
  ghost:
    "bg-transparent text-[var(--tp-t-2)] border border-transparent hover:bg-[var(--tp-bg-4)] hover:text-[var(--tp-t-1)]",
  danger:
    "bg-[rgba(239,68,68,0.10)] text-[#f87171] border border-[rgba(239,68,68,0.28)] hover:bg-[rgba(239,68,68,0.16)]",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  fullWidth?: boolean;
}

/**
 * The single button primitive for app chrome. Sizes and radii come from the
 * v4 scale so the top bar, sidebar, calendar and dialogs share one language.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    loading = false,
    leadingIcon,
    trailingIcon,
    fullWidth = false,
    className = "",
    children,
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
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={[
        "inline-flex select-none items-center justify-center gap-1.5 rounded-[var(--tp-radius-control)] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        SIZE_CLASS[size],
        VARIANT_CLASS[variant],
        fullWidth ? "w-full" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
      ) : (
        leadingIcon
      )}
      {children}
      {!loading && trailingIcon}
    </button>
  );
});
