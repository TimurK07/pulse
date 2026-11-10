"use client";
import { forwardRef } from "react";
import { cn } from "@/lib/cn";

const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%236b675f' stroke-width='1.5'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E\")";

const base =
  "w-full rounded-ctl border border-line-strong bg-raised text-ui text-ink placeholder:text-ink-4 transition-colors-fast hover:border-ink-4 focus:border-focus focus:outline-none focus-visible:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--focus)_22%,transparent)] disabled:bg-subtle disabled:text-ink-3 aria-[invalid=true]:border-danger";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cn(base, "h-9 px-3", className)} {...p} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cn(base, "min-h-24 resize-y px-3 py-2 text-body", className)} {...p} />;
});

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...p }, ref) {
  return (
    <select
      ref={ref}
      className={cn(
        base,
        "h-9 appearance-none bg-no-repeat pl-3 pr-8",
        className,
      )}
      style={{ backgroundImage: CHEVRON, backgroundSize: "16px", backgroundPosition: "right 8px center", ...p.style }}
      {...p}
    >
      {children}
    </select>
  );
});

export function Label({ children, htmlFor, hint, required }: { children: React.ReactNode; htmlFor?: string; hint?: React.ReactNode; required?: boolean }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-3">
      <label htmlFor={htmlFor} className="text-label font-medium text-ink-2">
        {children}
        {required && <span className="ml-0.5 text-ink-4">*</span>}
      </label>
      {hint && <span className="text-micro text-ink-3">{hint}</span>}
    </div>
  );
}

export function FieldError({ children, id }: { children?: React.ReactNode; id?: string }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 text-label text-danger">
      {children}
    </p>
  );
}

export function Checkbox({ checked, onChange, label, description, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; id: string }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer gap-3 rounded-ctl py-1.5">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden
        className="mt-0.5 grid size-4 shrink-0 place-items-center rounded-[4px] border border-line-strong bg-raised transition-colors-fast peer-checked:border-ink peer-checked:bg-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus"
      >
        <svg viewBox="0 0 12 12" className={cn("size-3 text-surface", !checked && "opacity-0")} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M2.5 6.2l2.3 2.3 4.7-5" />
        </svg>
      </span>
      <span>
        <span className="block text-ui text-ink">{label}</span>
        {description && <span className="block text-meta text-ink-3">{description}</span>}
      </span>
    </label>
  );
}
