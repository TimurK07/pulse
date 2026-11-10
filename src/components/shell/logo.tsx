export function PulseMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <rect width="24" height="24" rx="6" fill="var(--ink)" />
      <path d="M4 13h3.5l2-5 3 9 2.2-6 1.3 2H20" fill="none" stroke="var(--surface)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="20" cy="13" r="1.9" fill="var(--accent)" />
    </svg>
  );
}

export function PulseWordmark() {
  return (
    <span className="inline-flex items-center gap-2">
      <PulseMark className="size-6" />
      <span className="text-[15px] font-semibold tracking-[0.12em] text-ink">PULSE</span>
    </span>
  );
}
