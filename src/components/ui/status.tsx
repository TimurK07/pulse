"use client";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { PRIORITY_LABEL, STATUS_LABEL, TYPE_LABEL, type IssueStatus, type IssueType, type Priority } from "@/lib/domain";
import { formatDuration, slaInfo } from "@/lib/sla";
import { fmtDateTime, initials } from "@/lib/client/format";
import { Tip } from "./tooltip";

export const STATUS_VAR: Record<IssueStatus, string> = {
  NEW: "new",
  IN_REVIEW: "review",
  NEEDS_INFO: "info",
  IN_PROGRESS: "work",
  IMPLEMENTED: "done",
  REJECTED: "rejected",
  CLOSED: "closed",
};

const STATUS_HINT: Record<IssueStatus, string> = {
  NEW: "Новое — ждёт первой реакции ответственного",
  IN_REVIEW: "На рассмотрении — ответственный изучает обращение",
  NEEDS_INFO: "Ожидает уточнения — нужен ответ автора",
  IN_PROGRESS: "В работе — решение внедряется",
  IMPLEMENTED: "Реализовано — результат зафиксирован",
  REJECTED: "Отклонено с мотивированным объяснением",
  CLOSED: "Закрыто с итогом",
};

export function StatusIcon({ status, size = 14, className }: { status: IssueStatus; size?: number; className?: string }) {
  const c = `var(--st-${STATUS_VAR[status]})`;
  const common = { width: size, height: size, viewBox: "0 0 14 14", fill: "none", className: cn("shrink-0", className), "aria-hidden": true } as const;
  switch (status) {
    case "NEW":
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="5.25" stroke={c} strokeWidth="1.5" />
        </svg>
      );
    case "IN_REVIEW":
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="5.25" stroke={c} strokeWidth="1.5" />
          <path d="M7 3.5A3.5 3.5 0 0 1 10.5 7H7z" fill={c} />
        </svg>
      );
    case "NEEDS_INFO":
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="5.25" stroke={c} strokeWidth="1.5" strokeDasharray="2.2 1.8" />
          <circle cx="7" cy="7" r="1.4" fill={c} />
        </svg>
      );
    case "IN_PROGRESS":
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="5.25" stroke={c} strokeWidth="1.5" />
          <path d="M7 3.5a3.5 3.5 0 0 1 0 7z" fill={c} />
        </svg>
      );
    case "IMPLEMENTED":
    case "CLOSED":
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="6" fill={c} />
          <path d="M4.4 7.2l1.8 1.8 3.4-3.6" stroke="var(--surface)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "REJECTED":
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="5.25" stroke={c} strokeWidth="1.5" />
          <path d="M3.4 10.6l7.2-7.2" stroke={c} strokeWidth="1.5" />
        </svg>
      );
  }
}

export function StatusPill({ status, className, withHint = false }: { status: IssueStatus; className?: string; withHint?: boolean }) {
  const v = STATUS_VAR[status];
  const pill = (
    <span
      className={cn("inline-flex h-5 shrink-0 items-center gap-1 rounded-full pl-1.5 pr-2 text-label font-medium", className)}
      style={{ color: `var(--st-${v})`, background: `var(--st-${v}-bg)` }}
    >
      <StatusIcon status={status} size={12} />
      {STATUS_LABEL[status]}
    </span>
  );
  return withHint ? <Tip content={STATUS_HINT[status]}>{pill}</Tip> : pill;
}

export function StatusGlyph({ status }: { status: IssueStatus }) {
  return (
    <Tip content={STATUS_HINT[status]}>
      <span className="inline-flex" aria-label={STATUS_LABEL[status]} role="img">
        <StatusIcon status={status} />
      </span>
    </Tip>
  );
}

export function PriorityIcon({ priority, className }: { priority: Priority; className?: string }) {
  const level = priority === "HIGH" ? 3 : priority === "MEDIUM" ? 2 : 1;
  const color = priority === "HIGH" ? "var(--ink)" : priority === "MEDIUM" ? "var(--ink-2)" : "var(--ink-3)";
  return (
    <Tip content={`Приоритет: ${PRIORITY_LABEL[priority].toLowerCase()}`}>
      <svg width="14" height="14" viewBox="0 0 14 14" className={cn("shrink-0", className)} role="img" aria-label={`Приоритет: ${PRIORITY_LABEL[priority]}`}>
        {[0, 1, 2].map((i) => (
          <rect key={i} x={1.5 + i * 4} y={9 - i * 3} width="3" height={3.5 + i * 3} rx="0.75" fill={i < level ? color : "var(--border-strong)"} />
        ))}
      </svg>
    </Tip>
  );
}

export function PriorityLabel({ priority }: { priority: Priority }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-ui text-ink">
      <PriorityIcon priority={priority} />
      {PRIORITY_LABEL[priority]}
    </span>
  );
}

export function TypeTag({ type, className }: { type: IssueType; className?: string }) {
  return <span className={cn("inline-flex h-5 items-center rounded-ctl border border-line px-1.5 text-label text-ink-2", className)}>{TYPE_LABEL[type]}</span>;
}

export function CategoryTag({ name, className }: { name: string; className?: string }) {
  return <span className={cn("inline-flex h-5 max-w-48 items-center truncate rounded-ctl border border-line px-1.5 text-label text-ink-2", className)}>{name}</span>;
}

/** Обновление «живых» таймеров раз в минуту без анимации */
export function useMinuteTick() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

interface SlaProps {
  status: IssueStatus;
  createdAt: string;
  firstResponseAt: string | null;
  firstResponseDueAt: string;
  dueAt: string;
  pausedAt?: string | null;
  variant?: "row" | "panel";
}

export function SlaTimer({ status, createdAt, firstResponseAt, firstResponseDueAt, dueAt, pausedAt, variant = "row" }: SlaProps) {
  const now = useMinuteTick();
  const info = slaInfo(
    { status, firstResponseAt: firstResponseAt ? new Date(firstResponseAt) : null, firstResponseDueAt: new Date(firstResponseDueAt), dueAt: new Date(dueAt), pausedAt: pausedAt ? new Date(pausedAt) : null },
    new Date(now),
    new Date(createdAt),
  );
  if (info.state === "done" || info.msLeft == null) return variant === "row" ? <span className="text-meta text-ink-4">—</span> : null;
  const phase = info.phase === "first_response" ? "Первая реакция" : "Решение";
  const tip = `${phase}: срок ${fmtDateTime(info.deadline!.toISOString())}`;
  const text = info.msLeft < 0 && variant === "row" ? `−${formatDuration(info.msLeft)}` : formatDuration(info.msLeft);

  if (info.state === "paused") {
    return (
      <Tip content={`${tip}. Ждём ответа автора`}>
        <span className="inline-flex h-5 items-center gap-1.5 whitespace-nowrap text-meta text-ink-3">
          <span className="rounded-chip bg-subtle px-1 font-sans text-micro font-medium uppercase tracking-[0.06em] text-ink-2">пауза</span>
          <span className="mono-num">{info.msLeft < 0 ? `−${formatDuration(info.msLeft)}` : text}</span>
        </span>
      </Tip>
    );
  }
  const cls =
    info.state === "overdue"
      ? "bg-danger-soft text-danger rounded-full px-1.5"
      : info.state === "soon"
        ? "text-warn"
        : "text-ink-2";
  return (
    <Tip content={tip}>
      <span className={cn("inline-flex h-5 items-center whitespace-nowrap text-meta mono-num", cls)}>
        {variant === "panel" && <span className="mr-1.5 font-sans font-normal">{info.msLeft < 0 ? "просрочено" : "осталось"}</span>}
        {text}
      </span>
    </Tip>
  );
}

export function SlaBar({ createdAt, deadline, status }: { createdAt: string; deadline: string; status: IssueStatus }) {
  const now = useMinuteTick();
  const start = new Date(createdAt).getTime();
  const end = new Date(deadline).getTime();
  const used = Math.min(1, Math.max(0, (now - start) / Math.max(1, end - start)));
  const color = used >= 1 ? "var(--danger)" : used > 0.75 ? "var(--warn)" : status === "NEEDS_INFO" ? "var(--ink-4)" : "var(--ink-3)";
  return (
    <div className="h-0.5 w-full overflow-hidden rounded-full bg-subtle" role="progressbar" aria-valuenow={Math.round(used * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Израсходовано срока">
      <div className="h-full" style={{ width: `${used * 100}%`, background: color }} />
    </div>
  );
}

export function Avatar({ name, size = 20, className }: { name: string | null | undefined; size?: number; className?: string }) {
  if (!name)
    return (
      <Tip content="Не назначено">
        <span className={cn("inline-block shrink-0 rounded-full border border-dashed border-ink-4", className)} style={{ width: size, height: size }} />
      </Tip>
    );
  return (
    <span
      className={cn("inline-grid shrink-0 place-items-center rounded-full bg-subtle-2 font-semibold text-ink-2", className)}
      style={{ width: size, height: size, fontSize: size <= 20 ? 9 : 11 }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return <kbd className={cn("inline-grid h-[18px] min-w-[18px] place-items-center rounded-chip border border-line bg-surface px-1 font-mono text-micro text-ink-3", className)}>{children}</kbd>;
}

export function SourceBadge({ source, model, notice }: { source: "ai" | "cache" | "fallback"; model?: string | null; notice?: string }) {
  const isAi = source !== "fallback";
  const tip = isAi
    ? `Сформировано моделью ${model ?? "Claude"}${source === "cache" ? " (из кэша, без нового запроса)" : ""}`
    : (notice ?? "Сформировано локальным алгоритмом PULSE");
  return (
    <Tip content={tip}>
      <span className="inline-flex h-[18px] items-center gap-1 rounded-chip bg-subtle px-1.5 font-mono text-micro font-medium tracking-wide text-ink-2">
        {isAi ? (
          <svg viewBox="0 0 12 12" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
            <path d="M6 1v2.2M6 8.8V11M1 6h2.2M8.8 6H11M2.6 2.6l1.5 1.5M7.9 7.9l1.5 1.5M9.4 2.6L7.9 4.1M4.1 7.9L2.6 9.4" />
          </svg>
        ) : (
          <svg viewBox="0 0 12 12" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
            <rect x="1.5" y="1.5" width="9" height="9" rx="1.5" />
            <path d="M4 4.5h4M4 7.5h2.5" />
          </svg>
        )}
        {isAi ? "ИИ" : "ПРАВИЛО"}
      </span>
    </Tip>
  );
}
