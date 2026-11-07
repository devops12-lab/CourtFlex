import { forwardRef, type ButtonHTMLAttributes } from "react";
import { LoaderCircle } from "lucide-react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  // Ball gold is reserved for the one action that matters on a screen.
  primary:
    "bg-ball text-ball-ink hover:bg-ball-bright hover:shadow-[0_10px_30px_-10px_rgb(252_191_14/0.55)] disabled:bg-line-faint disabled:text-line-dim",
  secondary:
    "border border-line/70 text-line hover:bg-court-raised disabled:border-line-faint disabled:text-line-dim",
  ghost: "text-line-dim hover:text-line hover:bg-court-raised disabled:text-line-faint",
  danger: "border border-signal-red/70 text-signal-red hover:bg-signal-red/10 disabled:opacity-50",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-sm",
  lg: "h-12 px-5 text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, disabled, className, children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out enabled:active:scale-[0.97] disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});
