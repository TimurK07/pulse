"use client";
import { forwardRef } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "quiet";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-hover active:bg-accent-press font-semibold disabled:bg-subtle disabled:text-ink-4",
  secondary: "bg-raised text-ink border border-line-strong hover:bg-subtle active:bg-subtle-2 disabled:text-ink-4 disabled:hover:bg-raised",
  ghost: "text-ink-2 hover:bg-subtle hover:text-ink active:bg-subtle-2 disabled:text-ink-4 disabled:hover:bg-transparent",
  danger: "bg-raised text-danger border border-line-strong hover:bg-danger-soft disabled:text-ink-4",
  quiet: "text-accent-text hover:underline underline-offset-2 px-0! h-auto!",
};
const sizes: Record<Size, string> = {
  sm: "h-7 px-2.5 text-label gap-1.5",
  md: "h-8 px-3 text-ui gap-2",
  lg: "h-9 px-4 text-ui gap-2",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-ctl font-medium transition-colors-fast",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading && <Spinner className="absolute" />}
      <span className={cn("inline-flex items-center gap-[inherit]", loading && "invisible")}>{children}</span>
    </button>
  );
});

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("size-3.5 animate-spin", className)} viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity=".25" strokeWidth="2" />
      <path d="M14.5 8A6.5 6.5 0 0 0 8 1.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
