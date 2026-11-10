"use client";
import Link from "next/link";
import { EyeOff, MessageSquare, Paperclip, ThumbsUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { authorStepIndex, isOpen } from "@/lib/domain";
import type { IssueListItem } from "@/lib/services/issues";
import { fmtShort } from "@/lib/client/format";
import { Avatar, CategoryTag, PriorityIcon, SlaTimer, StatusGlyph, StatusPill } from "@/components/ui/status";
import { Tip } from "@/components/ui/tooltip";

/** Строка очереди обработчика — плотная, 40px */
export function QueueRow({ issue, compact = false }: { issue: IssueListItem; compact?: boolean }) {
  return (
    <Link
      href={`/issues/${issue.code}`}
      data-row
      className={
        compact
          ? "group grid h-10 grid-cols-[16px_52px_16px_minmax(0,1fr)_auto] items-center gap-3 px-4 transition-colors-fast hairline-b hover:bg-subtle focus-visible:bg-accent-soft focus-visible:outline-none focus-visible:shadow-[inset_2px_0_0_var(--accent)] sm:px-6 md:grid-cols-[16px_52px_16px_minmax(0,1fr)_120px_20px]"
          : "group grid h-10 grid-cols-[16px_52px_16px_minmax(0,1fr)_auto] items-center gap-3 px-4 transition-colors-fast hairline-b hover:bg-subtle focus-visible:bg-accent-soft focus-visible:outline-none focus-visible:shadow-[inset_2px_0_0_var(--accent)] sm:px-6 md:grid-cols-[16px_52px_16px_minmax(0,1fr)_auto_auto_120px_20px_52px]"
      }
    >
      <PriorityIcon priority={issue.priority} />
      <span className="mono-id text-ink-3">{issue.code}</span>
      <StatusGlyph status={issue.status} />
      <span className="min-w-0 truncate text-ui font-medium text-ink">{issue.title}</span>
      <span className="flex items-center gap-2 md:hidden">
        <SlaTimer {...issue} />
      </span>
      <span className={compact ? "hidden" : "hidden items-center gap-2.5 text-micro text-ink-3 md:flex"}>
        {issue.supportersCount > 0 && (
          <Tip content={`Поддержали: ${issue.supportersCount}`}>
            <span className="inline-flex items-center gap-1 mono-num">
              <ThumbsUp className="size-3" />
              {issue.supportersCount}
            </span>
          </Tip>
        )}
        {issue.commentsCount > 0 && (
          <span className="inline-flex items-center gap-1 mono-num" aria-label={`Комментариев: ${issue.commentsCount}`}>
            <MessageSquare className="size-3" />
            {issue.commentsCount}
          </span>
        )}
        {issue.attachmentsCount > 0 && <Paperclip className="size-3" aria-label="Есть вложения" />}
      </span>
      <span className={compact ? "hidden" : "hidden min-w-0 items-center gap-2 md:flex"}>
        <CategoryTag name={issue.category.name} className="hidden xl:inline-flex" />
        <span className="max-w-40 truncate text-meta text-ink-3">
          {issue.isAnonymous && !issue.isOwn ? (
            <span className="inline-flex items-center gap-1">
              <EyeOff className="size-3" />
              Анонимно
            </span>
          ) : (
            (issue.department?.name ?? "—")
          )}
        </span>
      </span>
      <span className="hidden justify-end md:flex">
        <SlaTimer {...issue} />
      </span>
      <span className="hidden md:inline-flex">
        <Tip content={issue.assignee ? `${issue.assignee.name} · ${issue.assignee.title}` : "Не назначено"}>
          <span>
            <Avatar name={issue.assignee?.name} />
          </span>
        </Tip>
      </span>
      {!compact && <span className="hidden text-right text-micro text-ink-3 md:block">{fmtShort(issue.updatedAt)}</span>}
    </Link>
  );
}

/** Строка «моего» обращения — для сотрудника важны статус, ответственный и ожидание ответа */
export function MyIssueRow({ issue }: { issue: IssueListItem }) {
  const waiting = issue.status === "NEEDS_INFO";
  return (
    <Link
      href={`/issues/${issue.code}`}
      data-row
      className={cn(
        "group flex flex-col gap-1.5 px-4 py-3.5 transition-colors-fast hairline-b hover:bg-subtle focus-visible:bg-accent-soft focus-visible:outline-none sm:grid sm:grid-cols-[52px_minmax(0,1fr)_168px_150px] sm:items-center sm:gap-4 sm:px-6",
        waiting && "shadow-[inset_2px_0_0_var(--st-info)]",
      )}
    >
      <span className="mono-id text-ink-3">{issue.code}</span>
      <span className="min-w-0">
        <span className="block truncate text-ui font-medium text-ink">{issue.title}</span>
        <span className="mt-0.5 block truncate text-meta text-ink-3">
          {issue.category.name}
          {issue.assignee && <> · отвечает {issue.assignee.name}</>}
          {waiting && <span className="text-[var(--st-info)]"> · нужен ваш ответ</span>}
        </span>
      </span>
      <span className="flex flex-col items-start gap-1.5">
        <StatusPill status={issue.status} />
        <MiniProgress status={issue.status} />
      </span>
      <span className="text-meta text-ink-3 sm:text-right">
        {issue.resolvedAt ? `решено ${fmtShort(issue.resolvedAt)}` : `подано ${fmtShort(issue.createdAt)}`}
      </span>
    </Link>
  );
}

/** Четыре шага «Принято → Рассмотрение → В работе → Результат» в миниатюре */
function MiniProgress({ status }: { status: IssueListItem["status"] }) {
  const step = authorStepIndex(status);
  const final = !isOpen(status);
  return (
    <span className="flex gap-0.5" role="img" aria-label={`Этап ${step + 1} из 4`}>
      {[0, 1, 2, 3].map((n) => (
        <span key={n} className={cn("h-1 w-5 rounded-full", n < step || (final && n === step) ? "bg-ink-2" : n === step ? "bg-ink-4" : "bg-subtle-2")} />
      ))}
    </span>
  );
}

/** Навигация по строкам клавишами J/K (как в почтовых клиентах и трекерах) */
export function attachRowNav(container: HTMLElement | null) {
  if (!container) return () => {};
  const onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k !== "j" && k !== "k" && k !== "arrowdown" && k !== "arrowup") return;
    const rows = Array.from(container.querySelectorAll<HTMLElement>("[data-row]"));
    if (!rows.length) return;
    const idx = rows.indexOf(document.activeElement as HTMLElement);
    const next = k === "j" || k === "arrowdown" ? Math.min(rows.length - 1, idx + 1) : Math.max(0, idx - 1);
    if (idx === -1 && (k === "arrowdown" || k === "arrowup")) return; // стрелки не перехватываем, пока фокус не в списке
    e.preventDefault();
    rows[idx === -1 ? 0 : next].focus();
    rows[idx === -1 ? 0 : next].scrollIntoView({ block: "nearest" });
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}
