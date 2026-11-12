"use client";
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { ArrowRight, CircleAlert, Clock3, Layers, UserRoundX, UsersRound, MessageCircleQuestion } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import type { IssueListItem } from "@/lib/services/issues";
import type { Analytics } from "@/lib/services/analytics";
import { buildActions, type WithSla } from "@/lib/next-actions";
import { slaInfo } from "@/lib/sla";
import { pluralRu } from "@/lib/domain";
import { fmtHours, fmtPct } from "@/lib/client/format";
import { cn } from "@/lib/cn";
import { QueueRow } from "@/components/issue/issue-row";
import { ErrorState, RowsSkeleton, Skeleton } from "@/components/ui/states";
import { PageHeader, SectionTitle } from "@/components/ui/page";
import { StatusIcon } from "@/components/ui/status";
import type { IssueStatus } from "@/lib/domain";
import { ThemeDecisionDialog, type ThemeRef } from "@/components/issue/theme-decision-dialog";
import { useViewer, isManagerRole } from "@/components/shell/viewer";


export function PulseView() {
  const issues = useQuery({
    queryKey: ["issues", "attention-pulse"],
    queryFn: () => api.get<{ items: IssueListItem[] }>("/api/issues?view=open&sort=created_asc&limit=200"),
    refetchInterval: 60_000,
  });
  const analytics = useQuery({ queryKey: ["analytics", "pulse"], queryFn: () => api.get<Analytics>("/api/analytics") });

  const g = useMemo(() => {
    const now = new Date();
    const items = issues.data?.items ?? [];
    const all: WithSla[] = items.map((i) => ({
      i,
      s: slaInfo(
        { status: i.status, firstResponseAt: i.firstResponseAt ? new Date(i.firstResponseAt) : null, firstResponseDueAt: new Date(i.firstResponseDueAt), dueAt: new Date(i.dueAt), pausedAt: i.pausedAt ? new Date(i.pausedAt) : null },
        now,
        new Date(i.createdAt),
      ),
    }));
    return {
      all,
      overdue: all.filter((x) => x.s.state === "overdue").sort((a, b) => (a.s.msLeft ?? 0) - (b.s.msLeft ?? 0)),
      soon: all.filter((x) => x.s.state === "soon"),
      fresh: all.filter((x) => x.i.status === "NEW" && !x.i.firstResponseAt && x.s.state === "ok"),
      noReaction: all.filter((x) => !x.i.firstResponseAt),
      waiting: all.filter((x) => x.s.state === "paused"),
      unassigned: items.filter((i) => !i.assignee),
    };
  }, [issues.data]);

  // дата — только на клиенте: часовой пояс сервера может отличаться от пользовательского
  const today = useSyncExternalStore(noopSubscribe, todayLabel, () => "");
  const t = analytics.data?.totals;
  const loading = issues.isLoading;
  // при ошибке загрузки нельзя показывать «просроченных нет» и нули
  const unknown = loading || (issues.isError && !issues.data);

  const headline = unknown ? (
    "Пульс"
  ) : g.overdue.length ? (
    <>
      {g.overdue.length} {pluralRu(g.overdue.length, "обращение просрочено", "обращения просрочены", "обращений просрочено")}
      {/* «Срок истекает» + «Новые без реакции»: не путать с плиткой «Без первой реакции» */}
      {g.soon.length + g.fresh.length > 0 && (
        <span className="text-ink-3">
          , ещё {g.soon.length + g.fresh.length} {pluralRu(g.soon.length + g.fresh.length, "требует", "требуют", "требуют")} внимания
        </span>
      )}
    </>
  ) : (
    "Просроченных обращений нет"
  );

  return (
    <div className="pb-16">
      <PageHeader kind="statement" eyebrow={today} title={headline}>
        {/* Очереди действия: каждая ведёт в отфильтрованный список */}
        <nav aria-label="Очереди действия" className="mt-6 grid grid-cols-2 border-y border-line md:grid-cols-4">
          <Counter href="/queue?view=overdue" icon={<CircleAlert className="size-4" />} label="Просрочено" value={g.overdue.length} tone="danger" loading={unknown} />
          <Counter href="/queue?view=no_response" icon={<Clock3 className="size-4" />} label="Без первой реакции" value={g.noReaction.length} tone="warn" loading={unknown} />
          <Counter href="/queue?view=needs_info" icon={<MessageCircleQuestion className="size-4" />} label="Ждут ответа автора" value={g.waiting.length} loading={unknown} />
          <Counter href="/queue?view=open&assignee=none" icon={<UserRoundX className="size-4" />} label="Без ответственного" value={g.unassigned.length} tone="danger" loading={unknown} />
        </nav>
        {t && (
          <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 pb-5 text-meta text-ink-3">
            <span>
              рассмотрено <b className="mono-num font-medium text-ink">{fmtPct(t.respondedShare)}</b>
            </span>
            <span>
              первая реакция в среднем <b className="mono-num font-medium text-ink">{fmtHours(t.avgFirstResponseHours)}</b>
            </span>
            <span>
              реакция в срок <b className="mono-num font-medium text-ink">{fmtPct(t.firstResponseOnTimeShare)}</b>
            </span>
            <span>
              реализовано улучшений <b className="mono-num font-medium text-ink">{t.implemented}</b>
            </span>
            <Link href="/analytics" className="inline-flex items-center gap-1 text-accent-text hover:underline">
              вся аналитика <ArrowRight className="size-3" />
            </Link>
          </p>
        )}
      </PageHeader>

      {issues.isError && <ErrorState message={errorMessage(issues.error)} onRetry={() => issues.refetch()} />}

      <div className="grid xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* Левая колонка: списки по риску срока */}
        <div className="min-w-0 border-t border-line xl:border-r">
          {loading && <RowsSkeleton rows={8} />}
          {issues.data && (
            <>
              <Group title="Просрочено" tone="danger" items={g.overdue.map((x) => x.i)} more="/queue?view=overdue" hint="сначала самые давние; уже эскалировано вам и ответственному" />
              <Group title="Срок истекает" tone="warn" items={g.soon.map((x) => x.i)} more="/queue?view=open" />
              <Group title="Новые без реакции" items={g.fresh.map((x) => x.i)} more="/queue?view=no_response" />
              <Group title="Ждём ответа автора" items={g.waiting.map((x) => x.i)} more="/queue?view=needs_info" hint="срок на паузе" />
              {g.unassigned.length > 0 && <Group title="Без ответственного" tone="danger" items={g.unassigned} more="/queue?view=open&assignee=none" />}
              {!g.overdue.length && !g.soon.length && !g.fresh.length && !g.waiting.length && (
                <p className="px-6 py-10 text-body text-ink-2">Срочных обращений нет. Откройте очередь, чтобы посмотреть все открытые.</p>
              )}
            </>
          )}
        </div>

        {/* Правая колонка: решения руководителя */}
        <aside className="min-w-0 space-y-8 border-t border-line px-4 py-6 sm:px-6">
          <NextActions data={g} analytics={analytics.data} loading={loading || analytics.isLoading} failed={(issues.isError && !issues.data) || (analytics.isError && !analytics.data)} />
          <Bottlenecks analytics={analytics.data} failed={analytics.isError && !analytics.data} onRetry={() => analytics.refetch()} />
          <Themes analytics={analytics.data} failed={analytics.isError && !analytics.data} onRetry={() => analytics.refetch()} />
        </aside>
      </div>
    </div>
  );
}

function Counter({ href, icon, label, value, tone, loading }: { href: string; icon: React.ReactNode; label: string; value: number; tone?: "danger" | "warn"; loading: boolean }) {
  const hot = value > 0 && tone;
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 border-line px-1 py-3 transition-colors-fast hover:bg-subtle/60 sm:px-3 [&:nth-child(odd)]:border-r md:[&:not(:last-child)]:border-r"
    >
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-ctl", hot === "danger" ? "bg-danger-soft text-danger" : hot === "warn" ? "bg-warn-soft text-warn" : "bg-subtle text-ink-3")}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className={cn("mono-num block text-[22px] leading-7", hot === "danger" ? "text-danger" : "text-ink")}>{loading ? "·" : value}</span>
        <span className="block truncate text-label text-ink-2 group-hover:text-ink">{label}</span>
      </span>
    </Link>
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
        <QueueRow key={i.id} issue={i} compact />
      ))}
    </section>
  );
}

function NextActions({
  data,
  analytics,
  loading,
  failed,
}: {
  data: { overdue: WithSla[]; unassigned: IssueListItem[]; waiting: WithSla[] };
  analytics?: Analytics;
  loading: boolean;
  failed: boolean;
}) {
  const acts = buildActions(data, analytics);
  return (
    <section aria-label="Что сделать сейчас">
      <SectionTitle hint="по правилам PULSE">Что сделать сейчас</SectionTitle>
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : acts.length ? (
        <ol className="divide-y divide-line rounded-pop border border-line bg-raised">
          {acts.map((x, n) => (
            <li key={x.key}>
              <Link href={x.href} className="group flex items-start gap-3 px-3.5 py-3 transition-colors-fast hover:bg-subtle/60">
                <span
                  className={cn(
                    "mono-num mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-micro",
                    x.tone === "danger" ? "bg-danger-soft text-danger" : x.tone === "warn" ? "bg-warn-soft text-warn" : "bg-subtle text-ink-2",
                  )}
                >
                  {n + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-ui font-medium text-ink">{x.title}</span>
                  <span className="block truncate text-meta text-ink-3">{x.detail}</span>
                </span>
                <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-label text-ink-3 group-hover:text-ink">
                  {x.cta} <ArrowRight className="size-3" />
                </span>
              </Link>
            </li>
          ))}
        </ol>
      ) : failed ? (
        <p className="text-meta text-danger">Не удалось загрузить данные — список действий может быть неполным.</p>
      ) : (
        <p className="text-meta text-ink-3">Срочных решений не требуется.</p>
      )}
    </section>
  );
}

function Bottlenecks({ analytics, failed, onRetry }: { analytics?: Analytics; failed: boolean; onRetry: () => void }) {
  const rows = (analytics?.byAssignee ?? []).filter((r) => r.open > 0).sort((a, b) => b.overdue - a.overdue || b.open - a.open).slice(0, 6);
  const peak = Math.max(1, ...rows.map((r) => r.open));
  return (
    <section aria-label="Нагрузка ответственных">
      <SectionTitle action={<Link href="/analytics" className="text-ink-2 hover:text-ink">все →</Link>}>
        <span className="inline-flex items-center gap-2">
          <UsersRound className="size-4 text-ink-3" /> Узкие места
        </span>
      </SectionTitle>
      {failed ? (
        <LoadFailed onRetry={onRetry} />
      ) : !analytics ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/queue?view=open&assignee=${r.id}`} className="group block">
                <div className="flex items-baseline justify-between gap-3 text-meta">
                  <span className="truncate text-ink group-hover:underline">{r.name}</span>
                  <span className="shrink-0 text-ink-3">
                    <span className="mono-num text-ink">{r.open}</span> откр.
                    {r.overdue > 0 && <span className="text-danger"> · {r.overdue} просроч.</span>}
                  </span>
                </div>
                <div className="mt-1 flex h-1.5 gap-[2px]" aria-hidden>
                  {r.overdue > 0 && <div className="h-full rounded-l-[2px] bg-danger" style={{ width: `${(r.overdue / peak) * 100}%` }} />}
                  <div className={cn("h-full bg-ink-4", r.overdue === 0 && "rounded-l-[2px]", "rounded-r-[2px]")} style={{ width: `${((r.open - r.overdue) / peak) * 100}%` }} />
                </div>
              </Link>
            </li>
          ))}
          {!rows.length && <li className="text-meta text-ink-3">Открытых обращений нет.</li>}
        </ul>
      )}
    </section>
  );
}

function Themes({ analytics, failed, onRetry }: { analytics?: Analytics; failed: boolean; onRetry: () => void }) {
  const themes = (analytics?.themes ?? []).slice(0, 5);
  const canDecide = isManagerRole(useViewer().role);
  const [theme, setTheme] = useState<ThemeRef | null>(null);
  return (
    <section aria-label="Повторяющиеся проблемы">
      <SectionTitle action={<Link href="/analytics" className="text-ink-2 hover:text-ink">AI-сводка →</Link>}>
        <span className="inline-flex items-center gap-2">
          <Layers className="size-4 text-ink-3" /> Повторяющиеся проблемы
        </span>
      </SectionTitle>
      {failed ? (
        <LoadFailed onRetry={onRetry} />
      ) : !analytics ? (
        <Skeleton className="h-32 w-full" />
      ) : themes.length ? (
        <ol className="space-y-3">
          {themes.map((t) => (
            <li key={t.key} className="border-l-2 border-line pl-3">
              <div className="text-ui font-medium text-ink">{t.title}</div>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                {t.codes.map((c, n) => (
                  <Link key={c} href={`/issues/${c}`} className="inline-flex items-center gap-1 rounded-chip border border-line px-1 hover:border-ink-3">
                    {t.statuses[n] && <StatusIcon status={t.statuses[n] as IssueStatus} size={10} />}
                    <span className="mono-id text-ink-2">{c}</span>
                  </Link>
                ))}
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 text-micro text-ink-3">
                <span>
                  открыто {t.openCount} · поддержали {t.supporters}
                </span>
                {canDecide && t.openCount > 0 && (
                  <button type="button" onClick={() => setTheme({ title: t.title, codes: t.codes })} className="font-medium text-accent-text hover:underline">
                    Решить тему →
                  </button>
                )}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-meta text-ink-3">Повторяющихся тем пока не найдено.</p>
      )}
      <ThemeDecisionDialog theme={theme} onClose={() => setTheme(null)} />
    </section>
  );
}

function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <p className="text-meta text-ink-3">
      Не удалось загрузить.{" "}
      <button type="button" onClick={onRetry} className="text-ink-2 underline hover:text-ink">
        Повторить
      </button>
    </p>
  );
}

const noopSubscribe = () => () => {};
function todayLabel() {
  const raw = format(new Date(), "EEEE, d MMMM", { locale: ru });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}
