"use client";
import { cn } from "@/lib/cn";
import { Tip } from "@/components/ui/tooltip";

export function Segmented({ value, onChange, options, label, hints }: { value: string; onChange: (v: string) => void; options: [string, string][]; label: string; hints?: Record<string, string> }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex max-w-full overflow-x-auto rounded-ctl bg-subtle p-0.5 scrollbar-thin">
      {options.map(([v, l]) => (
        <Tip key={v} content={hints?.[v]}>
          <button
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v)}
            className={cn(
              "h-7 shrink-0 whitespace-nowrap rounded-[5px] px-2.5 text-label text-ink-2 transition-colors-fast hover:text-ink",
              value === v && "bg-raised font-medium text-ink shadow-[0_1px_2px_rgba(28,27,24,.08)]",
            )}
          >
            {l}
          </button>
        </Tip>
      ))}
    </div>
  );
}
