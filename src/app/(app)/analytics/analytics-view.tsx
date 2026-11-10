"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, errorMessage, qs } from "@/lib/client/api";
import { useMeta } from "@/lib/client/queries";
import type { Analytics } from "@/lib/services/analytics";
import { TYPE_LABEL } from "@/lib/domain";
import { fmtDate, fmtHours, fmtPct } from "@/lib/client/format";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { FlowChart } from "@/components/analytics/flow-chart";
import { CategoryBars, MetricStrip, StatusBar, ThemesList, WorkloadTable } from "@/components/analytics/parts";
import { DigestPanel } from "@/components/analytics/digest-panel";
import { useViewer, isManagerRole } from "@/components/shell/viewer";
import { Select } from "@/components/ui/field";

const PERIODS = [
  ["", "За всё время"],
  ["30", "30 дней"],
  ["90", "90 дней"],
] as const;

export function AnalyticsView() {
  const viewer = useViewer();
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
      <header className="flex flex-wrap items-end justify-between gap-4 px-4 pb-5 pt-6 sm:px-8">
        <div>
          <h1 className="text-title-lg font-semibold">Аналитика</h1>
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

            <section aria-label="Повторяющиеся проблемы">
              <h2 className="text-title-md font-semibold">Повторяющиеся проблемы</h2>
              <p className="mb-3 text-meta text-ink-3">
                Темы выявлены локальным алгоритмом: доменный словарь понятий + сходство текстов (TF-IDF). Уточнённые формулировки — в сводке для руководства.
              </p>
              <ThemesList themes={a.themes} />
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
                <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[420px] text-left text-meta">
                  <thead>
                    <tr className="text-micro uppercase tracking-[0.06em] text-ink-3">
                      <th className="py-2 font-medium">Подразделение</th>
                      <th className="py-2 text-right font-medium">Всего</th>
                      <th className="py-2 text-right font-medium">Открыто</th>
                      <th className="py-2 text-right font-medium">Просрочено</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.byDepartment.map((d) => (
                      <tr key={d.id} className="border-t border-line">
                        <td className="py-2 text-ink">{d.name}</td>
                        <td className="mono-num py-2 text-right">{d.total}</td>
                        <td className="mono-num py-2 text-right text-ink-2">{d.open}</td>
                        <td className={`mono-num py-2 text-right ${d.overdue ? "text-danger" : "text-ink-3"}`}>{d.overdue}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
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
    </div>
  );
}
