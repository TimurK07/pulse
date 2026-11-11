"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, errorMessage, qs } from "@/lib/client/api";
import { useMeta } from "@/lib/client/queries";
import type { Analytics } from "@/lib/services/analytics";
import { TYPE_LABEL } from "@/lib/domain";
import { fmtDate, fmtHours, fmtPct } from "@/lib/client/format";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { cn } from "@/lib/cn";
import { FlowChart } from "@/components/analytics/flow-chart";
import { CategoryBars, MetricStrip, StatusBar, ThemesList, WorkloadTable } from "@/components/analytics/parts";
import { DigestPanel } from "@/components/analytics/digest-panel";
import { ThemeDecisionDialog, type ThemeRef } from "@/components/issue/theme-decision-dialog";
import { useViewer, isManagerRole } from "@/components/shell/viewer";
import { Select } from "@/components/ui/field";

const PERIODS = [
  ["", "За всё время"],
  ["30", "30 дней"],
  ["90", "90 дней"],
] as const;

export function AnalyticsView() {
  const viewer = useViewer();
  const [theme, setTheme] = useState<ThemeRef | null>(null);
  const meta = useMeta();
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const f = { period: sp.get("period") ?? "", departmentId: sp.get("departmentId") ?? "", categoryId: sp.get("categoryId") ?? "" };
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(sp.toString());
    if (v) n.set(k, v);
    else n.delete(k);
    router.replace(`${pathname}?${n}`, { scroll: false });
  };
  const q = useQuery({ queryKey: ["analytics", f], queryFn: () => api.get<Analytics>(`/api/analytics${qs(f)}`) });
  const a = q.data;

  return (
    <div className="pb-16">
      <header className="flex flex-wrap items-end justify-between gap-4 px-4 pb-6 pt-7 sm:px-8">
        <div className="max-w-[760px]">
          <h1 className="text-title-xl font-semibold">Аналитика</h1>
          <p className="text-meta text-ink-3">
            {viewer.role === "HANDLER" ? "Показатели по обращениям, доступным вам: назначенным и вашим категориям." : "Все показатели считаются по обращениям в базе PULSE."} Наведите на показатель, чтобы увидеть определение.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select aria-label="Период" value={f.period} onChange={(e) => set("period", e.target.value)} className="h-8 w-auto text-label">
            {PERIODS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
          <Select aria-label="Подразделение" value={f.departmentId} onChange={(e) => set("departmentId", e.target.value)} className="h-8 w-auto max-w-52 text-label">
            <option value="">Все подразделения</option>
            {meta.data?.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <Select aria-label="Категория" value={f.categoryId} onChange={(e) => set("categoryId", e.target.value)} className="h-8 w-auto max-w-52 text-label">
            <option value="">Все категории</option>
            {meta.data?.categories.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </div>
      </header>

      {q.isLoading && (
        <div className="space-y-3 px-8">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-60 w-full" />
        </div>
      )}
      {q.isError && <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
      {a && (
        <>
          <MetricStrip
            items={[
              { label: "Обращений", value: String(a.totals.total), hint: `Проблемы: ${a.byType[0].count}, предложения: ${a.byType[1].count}, отзывы: ${a.byType[2].count}` },
              { label: "Рассмотрено", value: fmtPct(a.totals.respondedShare), hint: "Доля обращений, на которые ответственный отреагировал (взял в работу, ответил или запросил уточнение)" },
              { label: "Первая реакция", value: fmtHours(a.totals.avgFirstResponseHours), hint: `Среднее время от подачи до первой реакции, календарные часы. Медиана: ${fmtHours(a.totals.medianFirstResponseHours)}` },
              { label: "Реакция в срок", value: fmtPct(a.totals.firstResponseOnTimeShare), hint: "Доля первых реакций, уложившихся в норматив по приоритету", tone: (a.totals.firstResponseOnTimeShare ?? 1) >= 0.9 ? "ok" : undefined },
              { label: "С результатом", value: fmtPct(a.totals.resolvedWithDecisionShare), hint: "Доля обращений с финальным статусом и зафиксированным текстом решения или мотивированного отказа" },
              { label: "Просрочено сейчас", value: String(a.totals.overdue), hint: `Открытые обращения с истёкшим сроком реакции (${a.totals.reactionOverdue}) или решения`, tone: a.totals.overdue ? "danger" : undefined },
            ]}
          />

          <div className="space-y-10 px-4 pt-8 sm:px-8">
            {isManagerRole(viewer.role) && <DigestPanel canGenerate />}

            <div className="grid gap-10 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <section aria-label="Поток обращений" className="min-w-0">
                <h2 className="text-title-md font-semibold">Поток по неделям</h2>
                <p className="mb-3 text-meta text-ink-3">Если решённых стабильно меньше поступивших — очередь растёт.</p>
                <FlowChart weeks={a.weeks} />
              </section>
              <section aria-label="Статусы" className="min-w-0">
                <h2 className="text-title-md font-semibold">Статусы</h2>
                <p className="mb-4 text-meta text-ink-3">
                  Решено {a.totals.resolved} из {a.totals.total}; реализовано улучшений — {a.totals.implemented}, отклонено с объяснением — {a.totals.rejected}.
                </p>
                <StatusBar byStatus={a.byStatus} total={a.totals.total} />
                <div className="mt-6 grid grid-cols-3 border-y border-line">
                  {a.byType.map((t) => (
                    <div key={t.type} className="border-r border-line px-3 py-2.5 last:border-r-0">
                      <div className="text-micro text-ink-3">{TYPE_LABEL[t.type]}</div>
                      <div className="mono-num text-title-md text-ink">{t.count}</div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <SlaSection t={a.totals} />

            <section aria-label="Повторяющиеся проблемы">
              <h2 className="text-title-md font-semibold">Повторяющиеся проблемы</h2>
              <p className="mb-3 text-meta text-ink-3">
                Темы выявлены локальным алгоритмом: доменный словарь понятий + сходство текстов (TF-IDF). Уточнённые формулировки — в сводке для руководства.
              </p>
              <ThemesList themes={a.themes} onResolve={isManagerRole(viewer.role) ? (t) => setTheme({ title: t.title, codes: t.codes }) : undefined} />
            </section>

            <div className="grid gap-10 xl:grid-cols-2">
              <section aria-label="Категории" className="min-w-0">
                <h2 className="text-title-md font-semibold">Категории</h2>
                <p className="mb-4 flex items-center gap-3 text-meta text-ink-3">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-[2px]" style={{ background: "var(--chart-2)" }} /> решено
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-[2px]" style={{ background: "var(--chart-1)" }} /> открыто
                  </span>
                </p>
                <CategoryBars rows={a.byCategory} max={12} />
              </section>
              <section aria-label="Нагрузка ответственных" className="min-w-0">
                <h2 className="text-title-md font-semibold">Нагрузка ответственных</h2>
                <p className="mb-2 text-meta text-ink-3">Кому нужна помощь или перераспределение.</p>
                <WorkloadTable rows={a.byAssignee} />
              </section>
            </div>

            <div className="grid gap-10 xl:grid-cols-2">
              <section aria-label="Подразделения" className="min-w-0">
                <h2 className="text-title-md font-semibold">Подразделения авторов</h2>
                <p className="mb-4 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-ink-3">
                  <Legend color="var(--chart-2)">решено</Legend>
                  <Legend color="var(--chart-1)">в работе</Legend>
                  <Legend color="var(--danger)">просрочено</Legend>
                </p>
                <DepartmentBars rows={a.byDepartment} />
              </section>
              <section aria-label="Реализованные улучшения" className="min-w-0">
                <h2 className="text-title-md font-semibold">Результаты внедрённых улучшений</h2>
                {a.implemented.length ? (
                  <ul className="mt-3 divide-y divide-line border-y border-line">
                    {a.implemented.map((i) => (
                      <li key={i.code} className="py-3">
                        <Link href={`/issues/${i.code}`} className="text-ui font-medium text-ink hover:underline">
                          <span className="mono-id mr-2 text-ink-3">{i.code}</span>
                          {i.title}
                        </Link>
                        <p className="mt-0.5 text-meta text-ink-2">{i.decision}</p>
                        <p className="mt-0.5 text-micro text-ink-3">
                          {i.category} · {i.decisionAt && fmtDate(i.decisionAt)}
                          {i.daysToResult != null && <> · от подачи до результата {i.daysToResult} дн.</>}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-meta text-ink-3">За период реализованных улучшений нет.</p>
                )}
              </section>
            </div>
            <p className="text-micro text-ink-3">Данные демо-стенда: 20 синтетических обращений из датасета хакатона, даты распределены относительно момента загрузки.</p>
          </div>
        </>
      )}
      <ThemeDecisionDialog theme={theme} onClose={() => setTheme(null)} />
    </div>
  );
}

function Legend({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2 rounded-[2px]" style={{ background: color }} />
      {children}
    </span>
  );
}

function DepartmentBars({ rows }: { rows: Analytics["byDepartment"] }) {
  const peak = Math.max(1, ...rows.map((r) => r.total));
  return (
    <ul className="space-y-3">
      {rows.map((d) => {
        const inWork = Math.max(0, d.open - d.overdue);
        return (
          <li key={d.id}>
            <div className="flex items-baseline justify-between gap-3 text-meta">
              <span className="truncate text-ink">{d.name}</span>
              <span className="shrink-0 text-ink-3">
                <span className="mono-num text-ink">{d.total}</span>
                {d.overdue > 0 && <span className="text-danger"> · {d.overdue} просроч.</span>}
              </span>
            </div>
            <div className="mt-1 flex h-1.5 gap-[2px]" role="img" aria-label={`${d.name}: решено ${d.resolved}, в работе ${inWork}, просрочено ${d.overdue}`}>
              {d.resolved > 0 && <div className="h-full rounded-[2px]" style={{ width: `${(d.resolved / peak) * 100}%`, background: "var(--chart-2)" }} />}
              {inWork > 0 && <div className="h-full rounded-[2px]" style={{ width: `${(inWork / peak) * 100}%`, background: "var(--chart-1)" }} />}
              {d.overdue > 0 && <div className="h-full rounded-[2px] bg-danger" style={{ width: `${(d.overdue / peak) * 100}%` }} />}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Сроки: выполнение норматива первой реакции и где копятся просрочки */
function SlaSection({ t }: { t: Analytics["totals"] }) {
  const onTime = t.firstResponseOnTimeShare ?? 0;
  const resolutionOverdue = Math.max(0, t.overdue - t.reactionOverdue);
  return (
    <section aria-label="Сроки и реакция" className="grid gap-6 rounded-pop border border-line bg-raised p-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0">
        <h2 className="text-title-md font-semibold">Сроки и реакция</h2>
        <p className="mt-1 text-meta text-ink-3">Первая реакция в пределах норматива по приоритету</p>
        <div className="mt-4 flex items-baseline gap-2">
          <span className={cn("mono-num text-[28px] leading-8", onTime >= 0.9 ? "text-ok" : onTime >= 0.75 ? "text-warn" : "text-danger")}>{fmtPct(t.firstResponseOnTimeShare)}</span>
          <span className="text-meta text-ink-3">реакций в срок · {t.responded} из {t.total} получили ответ</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-subtle-2" role="progressbar" aria-valuenow={Math.round(onTime * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Доля реакций в срок">
          <div className="h-full rounded-full" style={{ width: `${onTime * 100}%`, background: onTime >= 0.9 ? "var(--ok)" : onTime >= 0.75 ? "var(--warn)" : "var(--danger)" }} />
        </div>
      </div>
      <dl className="grid grid-cols-2 content-start gap-x-4 gap-y-3 text-meta">
        <div>
          <dt className="text-ink-3">Первая реакция, среднее</dt>
          <dd className="mono-num mt-0.5 text-title-md text-ink">{fmtHours(t.avgFirstResponseHours)}</dd>
        </div>
        <div>
          <dt className="text-ink-3">медиана</dt>
          <dd className="mono-num mt-0.5 text-title-md text-ink">{fmtHours(t.medianFirstResponseHours)}</dd>
        </div>
        <div>
          <dt className="text-ink-3">Решение, среднее</dt>
          <dd className="mono-num mt-0.5 text-title-md text-ink">{t.avgResolutionDays == null ? "—" : `${t.avgResolutionDays.toFixed(1).replace(".", ",")} д`}</dd>
        </div>
        <div>
          <dt className="text-ink-3">С результатом</dt>
          <dd className="mono-num mt-0.5 text-title-md text-ink">{t.resolvedWithDecision}</dd>
        </div>
      </dl>
      <div className="min-w-0">
        <h3 className="text-micro font-medium uppercase tracking-[0.08em] text-ink-3">Просрочено сейчас</h3>
        <ul className="mt-2 space-y-2 text-meta">
          <li className="flex items-center justify-between gap-3">
            <Link href="/queue?view=no_response" className="text-ink hover:underline">Нет первой реакции</Link>
            <span className={cn("mono-num", t.reactionOverdue ? "text-danger" : "text-ink-3")}>{t.reactionOverdue}</span>
          </li>
          <li className="flex items-center justify-between gap-3">
            <Link href="/queue?view=overdue" className="text-ink hover:underline">Срок решения истёк</Link>
            <span className={cn("mono-num", resolutionOverdue ? "text-danger" : "text-ink-3")}>{resolutionOverdue}</span>
          </li>
        </ul>
        <p className="mt-3 text-micro text-ink-3">Просроченные эскалируются ответственному и руководителю автоматически.</p>
      </div>
    </section>
  );
}
