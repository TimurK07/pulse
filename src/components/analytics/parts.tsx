"use client";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { STATUS_LABEL, STATUS_ORDER, type IssueStatus } from "@/lib/domain";
import type { Analytics } from "@/lib/services/analytics";
import { fmtHours } from "@/lib/client/format";
import { STATUS_VAR, StatusIcon } from "@/components/ui/status";
import { Tip } from "@/components/ui/tooltip";

export function MetricStrip({ items }: { items: { label: string; value: string; hint: string; tone?: "danger" | "ok" }[] }) {
  return (
    <dl className="grid grid-cols-2 border-y border-line sm:grid-cols-3 xl:grid-cols-6">
      {items.map((m) => (
        <Tip key={m.label} content={m.hint}>
          <div className="border-b border-r border-line px-4 py-3.5 last:border-r-0 xl:border-b-0 [&:nth-child(2n)]:border-r-0 sm:[&:nth-child(2n)]:border-r sm:[&:nth-child(3n)]:border-r-0 xl:[&:nth-child(3n)]:border-r xl:[&:nth-child(6n)]:border-r-0">
            <dt className="text-label text-ink-3 underline decoration-dotted decoration-ink-4 underline-offset-[3px]">{m.label}</dt>
            <dd className={cn("mono-num mt-1 text-[22px] leading-7 text-ink", m.tone === "danger" && "text-danger", m.tone === "ok" && "text-ok")}>{m.value}</dd>
          </div>
        </Tip>
      ))}
    </dl>
  );
}

export function StatusBar({ byStatus, total }: { byStatus: Analytics["byStatus"]; total: number }) {
  const parts = byStatus.filter((s) => s.count > 0);
  return (
    <div>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-[4px]" role="img" aria-label={parts.map((p) => `${STATUS_LABEL[p.status]}: ${p.count}`).join(", ")}>
        {parts.map((p) => (
          <Tip key={p.status} content={`${STATUS_LABEL[p.status]}: ${p.count}`}>
            <div style={{ width: `${(p.count / Math.max(total, 1)) * 100}%`, background: `var(--st-${STATUS_VAR[p.status]})` }} className="h-full" />
          </Tip>
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
        {STATUS_ORDER.map((s: IssueStatus) => {
          const c = byStatus.find((b) => b.status === s)?.count ?? 0;
          return (
            <li key={s} className="flex items-center gap-1.5 text-meta text-ink-2">
              <StatusIcon status={s} size={12} />
              <span className="truncate">{STATUS_LABEL[s]}</span>
              <span className="mono-num ml-auto text-ink">{c}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function CategoryBars({ rows, max = 10 }: { rows: Analytics["byCategory"]; max?: number }) {
  const top = rows.slice(0, max);
  const peak = Math.max(1, ...top.map((r) => r.total));
  return (
    <ul className="space-y-2.5">
      {top.map((r) => (
        <li key={r.id}>
          <Link href={`/queue?view=all&categoryId=${r.id}`} className="group block">
            <div className="flex items-baseline justify-between gap-3 text-meta">
              <span className="truncate text-ink group-hover:underline">{r.name}</span>
              <span className="shrink-0 text-ink-3">
                <span className="mono-num text-ink">{r.total}</span>
                {r.open > 0 && <> · открыто {r.open}</>}
                {r.overdue > 0 && <span className="text-danger"> · просрочено {r.overdue}</span>}
              </span>
            </div>
            <div className="mt-1 flex h-1.5 gap-[2px]">
              <div className="h-full rounded-l-[2px]" style={{ width: `${((r.total - r.open) / peak) * 100}%`, background: "var(--chart-2)" }} />
              <div className="h-full rounded-r-[2px]" style={{ width: `${(r.open / peak) * 100}%`, background: "var(--chart-1)" }} />
            </div>
          </Link>
        </li>
      ))}
      {rows.length > max && <li className="text-micro text-ink-3">и ещё {rows.length - max} категорий</li>}
    </ul>
  );
}

export function ThemesList({ themes, compact }: { themes: Analytics["themes"]; compact?: boolean }) {
  if (!themes.length) return <p className="text-meta text-ink-3">Повторяющихся тем пока не найдено.</p>;
  return (
    <ol className="divide-y divide-line border-y border-line">
      {themes.map((t) => (
        <li key={t.key} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0">
            <div className="text-ui font-medium text-ink">{t.title}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {t.codes.map((c, n) => (
                <Link key={c} href={`/issues/${c}`} className="inline-flex items-center gap-1 rounded-chip border border-line px-1 hover:border-ink-3">
                  {t.statuses[n] && <StatusIcon status={t.statuses[n] as IssueStatus} size={10} />}
                  <span className="mono-id text-ink-2">{c}</span>
                </Link>
              ))}
              {!compact && t.departments.length > 0 && <span className="ml-1 text-micro text-ink-3">{t.departments.join(", ")}</span>}
            </div>
          </div>
          <div className="flex gap-4 text-meta text-ink-3 sm:justify-end">
            <span>
              <span className="mono-num text-ink">{t.codes.length}</span> обращ.
            </span>
            <span>
              открыто <span className="mono-num text-ink">{t.openCount}</span>
            </span>
            <span>
              поддержали <span className="mono-num text-ink">{t.supporters}</span>
            </span>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function WorkloadTable({ rows }: { rows: Analytics["byAssignee"] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-meta">
        <thead>
          <tr className="text-micro uppercase tracking-[0.06em] text-ink-3">
            <th className="py-2 font-medium">Ответственный</th>
            <th className="py-2 text-right font-medium">Открыто</th>
            <th className="py-2 text-right font-medium">Просрочено</th>
            <th className="py-2 text-right font-medium">Решено</th>
            <th className="py-2 text-right font-medium">Ср. реакция</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-line">
              <td className="py-2">
                <Link href={`/queue?view=open&assignee=${r.id}`} className="text-ink hover:underline">
                  {r.name}
                </Link>
                <span className="block text-micro text-ink-3">{r.title}</span>
              </td>
              <td className="mono-num py-2 text-right text-ink">{r.open}</td>
              <td className={cn("mono-num py-2 text-right", r.overdue ? "text-danger" : "text-ink-3")}>{r.overdue}</td>
              <td className="mono-num py-2 text-right text-ink-2">{r.resolved}</td>
              <td className="mono-num py-2 text-right text-ink-2">{fmtHours(r.avgResponseHours)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
