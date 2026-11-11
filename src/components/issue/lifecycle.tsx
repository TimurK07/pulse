"use client";
import { cn } from "@/lib/cn";
import { authorStepIndex, isOpen, transitionLabel, type IssueStatus } from "@/lib/domain";
import type { IssueDetail } from "@/lib/services/issues";
import { fmtDateTime, fmtShort } from "@/lib/client/format";
import { formatDuration } from "@/lib/sla";
import { Button } from "@/components/ui/button";
import { STATUS_VAR, SlaTimer, useMinuteTick } from "@/components/ui/status";

const STEPS = ["Принято", "Рассмотрение", "В работе", "Решение"] as const;

/** Даты прохождения этапов — из полей обращения и истории */
function stepDates(i: IssueDetail): (string | null)[] {
  const inWork = i.timeline.find((e) => e.kind === "event" && e.type === "STATUS_CHANGED" && e.toValue === "IN_PROGRESS");
  return [i.createdAt, i.firstResponseAt, inWork?.createdAt ?? null, i.resolvedAt];
}

/**
 * Лента жизненного цикла: где обращение сейчас, когда пройдены этапы и что со сроком.
 * Одинакова для автора, коллег и обработчиков — общий язык процесса.
 */
export function LifecycleStrip({ issue: i }: { issue: IssueDetail }) {
  const current = authorStepIndex(i.status);
  const dates = stepDates(i);
  const done = !isOpen(i.status);
  const color = `var(--st-${STATUS_VAR[i.status]})`;
  const finalLabel = i.status === "REJECTED" ? "Отклонено" : i.status === "CLOSED" ? "Закрыто" : i.status === "IMPLEMENTED" ? "Реализовано" : "Решение";

  return (
    <section aria-label="Ход рассмотрения" className="mt-6">
      <ol className="grid grid-cols-4 gap-1.5">
        {STEPS.map((label, n) => {
          const passed = n < current || (done && n === current);
          const active = n === current && !done;
          const skipped = n === 2 && done && !dates[2] && n < 3; // решение без этапа «в работе» (отказ, закрытие)
          return (
            <li key={label} className="min-w-0" aria-current={active ? "step" : undefined}>
              <div
                className={cn("h-1 rounded-full", !passed && !active && "bg-subtle-2", skipped && "bg-subtle-2")}
                style={passed && !skipped ? { background: n === 3 ? color : "var(--ink)" } : active ? { background: color } : undefined}
              />
              <div className={cn("mt-2 truncate text-label", passed || active ? "font-medium text-ink" : "text-ink-3")}>
                {n === 3 ? finalLabel : label}
                {active && i.status === "NEEDS_INFO" && <span className="font-normal" style={{ color }}> · ждём автора</span>}
              </div>
              <div className="truncate text-micro text-ink-3">{dates[n] && !skipped ? fmtShort(dates[n]!) : active ? "сейчас" : skipped ? "—" : ""}</div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

const CONTEXT: Record<IssueStatus, string> = {
  NEW: "Автор ждёт первого ответа. Возьмите обращение на рассмотрение или сразу в работу.",
  IN_REVIEW: "Примите решение: в работу, уточнение у автора или мотивированный отказ.",
  NEEDS_INFO: "Вопрос автору отправлен. Срок решения на паузе, пока он не ответит.",
  IN_PROGRESS: "Решение внедряется. Когда результат будет, зафиксируйте его — автор увидит итог.",
  IMPLEMENTED: "Результат зафиксирован и виден автору.",
  REJECTED: "Отказ с объяснением зафиксирован и виден автору.",
  CLOSED: "Обращение закрыто с итогом.",
};

/**
 * «Следующий шаг» для обработчика: одно основное действие, остальные — вторичные,
 * деструктивное — последним. Объяснение, почему этот шаг, — рядом с кнопкой.
 */
export function NextStep({ issue: i, onPick }: { issue: IssueDetail; onPick: (s: IssueStatus) => void }) {
  const now = useMinuteTick();
  const t = i.viewer.transitions;
  if (!t.length) return null;
  const waiting = i.status === "NEEDS_INFO";
  const primary = waiting ? null : t[0];
  const rest = t.filter((s) => s !== primary);
  const ordered = [...rest.filter((s) => s !== "REJECTED" && s !== "CLOSED"), ...rest.filter((s) => s === "CLOSED"), ...rest.filter((s) => s === "REJECTED")];

  let urgency: string | null = null;
  if (isOpen(i.status) && !i.firstResponseAt) {
    const left = new Date(i.firstResponseDueAt).getTime() - now;
    urgency = left < 0 ? `Срок первой реакции истёк ${formatDuration(left)} назад` : `Первая реакция — в течение ${formatDuration(left)}`;
  }

  return (
    <section aria-label="Следующий шаг" className="mt-5 rounded-pop border border-line bg-raised px-4 py-3.5 sm:px-5">
      <h2 className="text-micro font-medium uppercase tracking-[0.08em] text-ink-3">Следующий шаг</h2>
      <p className="mt-1 text-ui text-ink">{CONTEXT[i.status]}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
        <SlaTimer status={i.status} createdAt={i.createdAt} firstResponseAt={i.firstResponseAt} firstResponseDueAt={i.firstResponseDueAt} dueAt={i.dueAt} pausedAt={i.pausedAt} variant="panel" />
        {urgency && <span className={cn("text-meta", urgency.startsWith("Срок") ? "text-danger" : "text-ink-3")}>{urgency}</span>}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {primary && (
          <Button variant="primary" onClick={() => onPick(primary)}>
            {transitionLabel(i.status, primary)}
          </Button>
        )}
        {ordered
          .filter((s) => s !== "REJECTED")
          .map((s) => (
            <Button key={s} variant="secondary" onClick={() => onPick(s)}>
              {transitionLabel(i.status, s)}
            </Button>
          ))}
        {ordered.includes("REJECTED") && (
          // деструктивное действие — отдельно и тише, но всегда видно
          <Button variant="ghost" className="text-danger hover:bg-danger-soft hover:text-danger" onClick={() => onPick("REJECTED")}>
            {transitionLabel(i.status, "REJECTED")}
          </Button>
        )}
      </div>
      {i.decisionAt && !isOpen(i.status) && <p className="mt-2 text-micro text-ink-3">Решение от {fmtDateTime(i.decisionAt)}</p>}
    </section>
  );
}
