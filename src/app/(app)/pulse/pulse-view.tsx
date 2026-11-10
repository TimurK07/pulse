"use client";
import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { ArrowRight } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import type { IssueListItem } from "@/lib/services/issues";
import type { Analytics } from "@/lib/services/analytics";
import { slaInfo } from "@/lib/sla";
import { pluralRu } from "@/lib/domain";
import { fmtHours, fmtPct } from "@/lib/client/format";
import { QueueRow } from "@/components/issue/issue-row";
import { ThemesList, WorkloadTable } from "@/components/analytics/parts";
import { ErrorState, RowsSkeleton } from "@/components/ui/states";
import { useViewer } from "@/components/shell/viewer";
import { cn } from "@/lib/cn";

export function PulseView() {
  const viewer = useViewer();
  const attention = useQuery({
    queryKey: ["issues", "attention-pulse"],
    queryFn: () => api.get<{ items: IssueListItem[] }>("/api/issues?view=open&sort=created_asc"),
    refetchInterval: 60_000,
  });
  const analytics = useQuery({ queryKey: ["analytics", "pulse"], queryFn: () => api.get<Analytics>("/api/analytics") });

  const groups = useMemo(() => {
    const now = new Date();
    const items = attention.data?.items ?? [];
    const info = (i: IssueListItem) =>
      slaInfo(
        { status: i.status, firstResponseAt: i.firstResponseAt ? new Date(i.firstResponseAt) : null, firstResponseDueAt: new Date(i.firstResponseDueAt), dueAt: new Date(i.dueAt) },
        now,
        new Date(i.createdAt),
      );
    const withInfo = items.map((i) => ({ i, s: info(i) }));
    return {
      overdue: withInfo.filter((x) => x.s.state === "overdue").sort((a, b) => (a.s.msLeft ?? 0) - (b.s.msLeft ?? 0)).map((x) => x.i),
      soon: withInfo.filter((x) => x.s.state === "soon").map((x) => x.i),
      fresh: withInfo.filter((x) => x.i.status === "NEW" && x.s.state === "ok").map((x) => x.i),
      waiting: withInfo.filter((x) => x.s.state === "paused").map((x) => x.i),
      unassigned: items.filter((i) => !i.assignee),
    };
  }, [attention.data]);

  const todayRaw = format(new Date(), "EEEE, d MMMM", { locale: ru });
  const today = todayRaw.charAt(0).toUpperCase() + todayRaw.slice(1);
  const t = analytics.data?.totals;

  return (
    <div className="pb-16">
      <header className="px-4 pb-6 pt-8 sm:px-8">
        <p className="text-meta text-ink-3">{today}</p>
        <h1 className="mt-1 text-display font-semibold">
          {attention.isLoading ? (
            "Пульс"
          ) : groups.overdue.length ? (
            <>
              {groups.overdue.length} {pluralRu(groups.overdue.length, "обращение просрочено", "обращения просрочены", "обращений просрочено")}
              <span className="text-ink-3">, {groups.soon.length + groups.fresh.length} ждут реакции</span>
            </>
          ) : (
            "Просроченных обращений нет"
          )}
        </h1>
        {t && (
          <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-meta text-ink-2">
            <span>
              рассмотрено <b className="mono-num font-medium text-ink">{fmtPct(t.respondedShare)}</b>
            </span>
            <span>
              первая реакция в среднем <b className="mono-num font-medium text-ink">{fmtHours(t.avgFirstResponseHours)}</b>
            </span>
            <span>
              в срок <b className="mono-num font-medium text-ink">{fmtPct(t.firstResponseOnTimeShare)}</b>
            </span>
            <span>
              реализовано улучшений <b className="mono-num font-medium text-ink">{t.implemented}</b>
            </span>
            <Link href="/analytics" className="inline-flex items-center gap-1 text-accent-text hover:underline">
              вся аналитика <ArrowRight className="size-3" />
            </Link>
          </p>
        )}
      </header>

      {attention.isLoading && <RowsSkeleton rows={6} />}
      {attention.isError && <ErrorState message={errorMessage(attention.error)} onRetry={() => attention.refetch()} />}
      {attention.data && (
        <div className="border-t border-line">
          <Group title="Просрочено" tone="danger" items={groups.overdue} more="/queue?view=overdue" hint="Сначала самые давние. Каждое уже эскалировано вам и ответственному." />
          <Group title="Срок истекает" tone="warn" items={groups.soon} more="/queue?view=open" />
          <Group title="Новые без реакции" items={groups.fresh} more="/queue?view=no_response" />
          <Group title="Ждём ответа автора" items={groups.waiting} more="/queue?view=needs_info" hint="Срок на паузе, пока автор не ответит на уточнение." />
          {groups.unassigned.length > 0 && <Group title="Без ответственного" tone="danger" items={groups.unassigned} more="/queue?view=open&assignee=none" />}
        </div>
      )}

      {analytics.data && (
        <div className="mt-10 grid gap-10 px-4 sm:px-8 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <section aria-label="Повторяющиеся проблемы" className="min-w-0">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-title-md font-semibold">Повторяющиеся проблемы</h2>
              <Link href="/analytics" className="text-meta text-ink-2 hover:text-ink">
                AI-сводка →
              </Link>
            </div>
            <ThemesList themes={analytics.data.themes} compact />
          </section>
          <section aria-label="Нагрузка ответственных" className="min-w-0">
            <h2 className="mb-1 text-title-md font-semibold">Нагрузка ответственных</h2>
            <WorkloadTable rows={analytics.data.byAssignee.filter((r) => r.open > 0).slice(0, 8)} />
          </section>
        </div>
      )}
      {viewer.role === "ADMIN" && (
        <p className="mt-10 px-4 text-meta text-ink-3 sm:px-8">
          Вы администратор: правила маршрутизации и сроки — в <Link href="/admin" className="text-accent-text underline underline-offset-2">настройках</Link>.
        </p>
      )}
    </div>
  );
}

function Group({ title, items, more, tone, hint }: { title: string; items: IssueListItem[]; more: string; tone?: "danger" | "warn"; hint?: string }) {
  if (!items.length) return null;
  const shown = items.slice(0, 5);
  return (
    <section aria-label={title}>
      <h2 className="flex h-9 items-center gap-2 bg-canvas/60 px-4 text-label font-semibold hairline-b sm:px-6">
        <span className={cn(tone === "danger" && "text-danger", tone === "warn" && "text-warn")}>{title}</span>
        <span className="mono-num font-normal text-ink-3">{items.length}</span>
        {hint && <span className="hidden truncate font-normal text-ink-3 md:inline">· {hint}</span>}
        {items.length > shown.length && (
          <Link href={more} className="ml-auto font-normal text-ink-2 hover:text-ink">
            все {items.length} →
          </Link>
        )}
      </h2>
      {shown.map((i) => (
        <QueueRow key={i.id} issue={i} />
      ))}
    </section>
  );
}
