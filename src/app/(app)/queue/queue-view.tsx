"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { api, errorMessage, qs } from "@/lib/client/api";
import { useMe, useMeta } from "@/lib/client/queries";
import { PRIORITY_LABEL, PRIORITY_ORDER, STATUS_LABEL, STATUS_ORDER, TYPE_LABEL, type IssueStatus } from "@/lib/domain";
import { slaInfo } from "@/lib/sla";
import type { IssueListItem } from "@/lib/services/issues";
import { QueueRow, attachRowNav } from "@/components/issue/issue-row";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/ui/states";
import { Kbd } from "@/components/ui/status";
import { Button } from "@/components/ui/button";
import { useViewer } from "@/components/shell/viewer";

const VIEWS = [
  { key: "queue", label: "Мне назначено", hint: "Открытые обращения, где вы ответственный" },
  { key: "attention", label: "Требует внимания", hint: "Новые без реакции и просроченные" },
  { key: "no_response", label: "Без ответа", hint: "Новые, на которые ещё никто не отреагировал" },
  { key: "overdue", label: "Просрочено", hint: "Истёк срок реакции или решения" },
  { key: "needs_info", label: "Ждут автора", hint: "Запрошено уточнение" },
  { key: "open", label: "Все открытые", hint: "" },
  { key: "resolved", label: "Решённые", hint: "Реализовано, отклонено, закрыто" },
  { key: "all", label: "Все", hint: "" },
] as const;

const SORTS = [
  { key: "created_desc", label: "Сначала новые" },
  { key: "deadline", label: "По сроку решения" },
  { key: "priority", label: "По приоритету" },
  { key: "supporters", label: "По поддержке коллег" },
  { key: "created_asc", label: "Сначала старые" },
];

type Group = { key: string; label: string; items: IssueListItem[] };

function groupBySla(items: IssueListItem[]): Group[] {
  const now = new Date();
  const groups: Record<string, Group> = {
    overdue: { key: "overdue", label: "Просрочено", items: [] },
    soon: { key: "soon", label: "Срок истекает", items: [] },
    ok: { key: "ok", label: "В срок", items: [] },
    paused: { key: "paused", label: "Ждём ответа автора", items: [] },
    done: { key: "done", label: "Решённые", items: [] },
  };
  for (const i of items) {
    const s = slaInfo(
      { status: i.status, firstResponseAt: i.firstResponseAt ? new Date(i.firstResponseAt) : null, firstResponseDueAt: new Date(i.firstResponseDueAt), dueAt: new Date(i.dueAt) },
      now,
      new Date(i.createdAt),
    );
    groups[s.state].items.push(i);
  }
  return Object.values(groups).filter((g) => g.items.length);
}

export function QueueView() {
  const viewer = useViewer();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const meta = useMeta();
  const me = useMe();
  const listRef = useRef<HTMLDivElement>(null);

  const view = sp.get("view") ?? "open";
  const filters = {
    q: sp.get("q") ?? "",
    status: sp.get("status") ?? "",
    type: sp.get("type") ?? "",
    categoryId: sp.get("categoryId") ?? "",
    departmentId: sp.get("departmentId") ?? "",
    priority: sp.get("priority") ?? "",
    assignee: sp.get("assignee") ?? "",
    sort: sp.get("sort") ?? "created_desc",
  };
  const [q, setQ] = useState(filters.q);
  const [syncedQ, setSyncedQ] = useState(filters.q);
  if (syncedQ !== filters.q) {
    // строка поиска в URL изменилась извне (назад/вперёд) — синхронизируем поле
    setSyncedQ(filters.q);
    setQ(filters.q);
  }

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  useEffect(() => {
    const t = setTimeout(() => {
      if (q !== filters.q) setParam({ q: q || null });
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const query = useQuery({
    queryKey: ["issues", view, filters],
    queryFn: () =>
      api.get<{ items: IssueListItem[] }>(
        `/api/issues${qs({ view, ...filters, status: filters.status || undefined })}`,
      ),
    refetchInterval: 60_000,
  });

  useEffect(() => attachRowNav(listRef.current), []);

  const activeFilters = Object.entries(filters).filter(([k, v]) => v && k !== "sort" && k !== "q").length;
  const grouped = useMemo(() => {
    const items = query.data?.items ?? [];
    if (["resolved", "all"].includes(view) || filters.sort !== "created_desc") return [{ key: "all", label: "", items }];
    return groupBySla(items);
  }, [query.data, view, filters.sort]);

  const viewMeta = VIEWS.find((v) => v.key === view) ?? VIEWS[5];
  const counts: Partial<Record<string, number>> = {
    queue: me.data?.counters.queue,
    overdue: me.data?.counters.overdue,
    no_response: me.data?.counters.noResponse,
  };

  if (viewer.role === "EMPLOYEE") {
    return <EmptyState title="Раздел для ответственных" text="Ваши обращения — в разделе «Мои обращения»." action={<Link href="/my" className="text-ui text-accent-text underline">Перейти</Link>} />;
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="px-4 pt-5 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-title-lg font-semibold">{viewMeta.label}</h1>
            {viewMeta.hint && <p className="text-meta text-ink-3">{viewMeta.hint}</p>}
          </div>
          <span className="hidden items-center gap-1.5 text-micro text-ink-3 md:flex">
            <Kbd>J</Kbd>
            <Kbd>K</Kbd> навигация · <Kbd>↵</Kbd> открыть
          </span>
        </div>
        <nav aria-label="Представления" className="-mx-1 mt-4 flex gap-0.5 overflow-x-auto scrollbar-thin">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => setParam({ view: v.key })}
              aria-current={view === v.key ? "true" : undefined}
              className={cn(
                "relative flex h-8 shrink-0 items-center gap-1.5 rounded-ctl px-2.5 text-ui text-ink-2 transition-colors-fast hover:bg-subtle hover:text-ink",
                view === v.key && "bg-subtle-2/70 font-medium text-ink",
              )}
            >
              {v.label}
              {counts[v.key] ? (
                <span className={cn("mono-num text-micro", v.key === "overdue" ? "text-danger" : "text-ink-3")}>{counts[v.key]}</span>
              ) : null}
            </button>
          ))}
        </nav>
      </header>

      <div className="sticky top-12 z-10 mt-3 flex flex-wrap items-center gap-2 border-y border-line bg-surface px-4 py-2 sm:px-6 lg:top-0">
        <label className="relative flex min-w-[200px] flex-1 items-center sm:max-w-[280px]">
          <Search className="pointer-events-none absolute left-2.5 size-3.5 text-ink-3" />
          <span className="sr-only">Поиск по обращениям</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Код, заголовок, текст"
            className="h-8 w-full rounded-ctl border border-line bg-raised pl-8 pr-2 text-ui outline-none placeholder:text-ink-4 focus:border-focus"
          />
        </label>
        <div className="-mx-4 flex w-[calc(100%+2rem)] items-center gap-2 overflow-x-auto px-4 scrollbar-thin md:mx-0 md:w-auto md:flex-1 md:flex-wrap md:overflow-visible md:px-0">
        <FilterSelect label="Статус" value={filters.status} onChange={(v) => setParam({ status: v })} options={STATUS_ORDER.map((s: IssueStatus) => [s, STATUS_LABEL[s]])} />
        <FilterSelect label="Тип" value={filters.type} onChange={(v) => setParam({ type: v })} options={Object.entries(TYPE_LABEL)} />
        <FilterSelect label="Категория" value={filters.categoryId} onChange={(v) => setParam({ categoryId: v })} options={(meta.data?.categories ?? []).map((c) => [c.id, c.name])} />
        <FilterSelect label="Подразделение" value={filters.departmentId} onChange={(v) => setParam({ departmentId: v })} options={(meta.data?.departments ?? []).map((c) => [c.id, c.name])} />
        <FilterSelect label="Приоритет" value={filters.priority} onChange={(v) => setParam({ priority: v })} options={PRIORITY_ORDER.map((p) => [p, PRIORITY_LABEL[p]])} />
        {view !== "queue" && (
          <FilterSelect
            label="Ответственный"
            value={filters.assignee}
            onChange={(v) => setParam({ assignee: v })}
            options={[["me", "Я"], ["none", "Не назначен"], ...(meta.data?.staff ?? []).map((s) => [s.id, s.name] as [string, string])]}
          />
        )}
        <div className="flex shrink-0 items-center gap-2 md:ml-auto">
          {activeFilters > 0 && (
            <button
              onClick={() => setParam({ status: null, type: null, categoryId: null, departmentId: null, priority: null, assignee: null })}
              className="inline-flex h-8 items-center gap-1 rounded-ctl px-2 text-label text-ink-2 hover:bg-subtle"
            >
              <X className="size-3.5" /> Сбросить ({activeFilters})
            </button>
          )}
          <FilterSelect label="Сортировка" value={filters.sort === "created_desc" ? "" : filters.sort} onChange={(v) => setParam({ sort: v })} options={SORTS.slice(1).map((s) => [s.key, s.label])} placeholder="Сначала новые" />
        </div>
        </div>
      </div>

      <div ref={listRef} className="flex-1">
        {query.isLoading && <RowsSkeleton />}
        {query.isError && <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />}
        {query.data && query.data.items.length === 0 && (
          <EmptyState
            title={activeFilters || filters.q ? "По фильтру ничего не найдено" : view === "queue" ? "Очередь разобрана" : "Здесь пусто"}
            text={
              activeFilters || filters.q
                ? "Измените условия поиска или сбросьте фильтры."
                : view === "queue"
                  ? "Открытых обращений, назначенных вам, нет."
                  : "Обращений в этом представлении нет."
            }
            action={
              activeFilters || filters.q ? (
                <Button onClick={() => { setQ(""); setParam({ q: null, status: null, type: null, categoryId: null, departmentId: null, priority: null, assignee: null }); }}>Сбросить фильтры</Button>
              ) : (
                <Button onClick={() => setParam({ view: "resolved" })}>Показать решённые</Button>
              )
            }
          />
        )}
        {grouped.map((g) =>
          g.items.length ? (
            <section key={g.key} aria-label={g.label || "Обращения"}>
              {g.label && (
                <h2 className="sticky top-[100px] z-[5] flex h-8 items-center gap-2 bg-canvas/70 px-4 text-label font-semibold text-ink backdrop-blur-sm hairline-b sm:px-6 lg:top-[49px]">
                  <span className={cn(g.key === "overdue" && "text-danger", g.key === "soon" && "text-warn")}>{g.label}</span>
                  <span className="mono-num font-normal text-ink-3">{g.items.length}</span>
                </h2>
              )}
              {g.items.map((i) => (
                <QueueRow key={i.id} issue={i} />
              ))}
            </section>
          ) : null,
        )}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string | null) => void;
  options: [string, string][];
  placeholder?: string;
}) {
  return (
    <label className="relative inline-flex shrink-0">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value || null)}
        className={cn(
          "h-8 max-w-[190px] appearance-none truncate rounded-ctl border bg-raised pl-2.5 pr-7 text-label outline-none transition-colors-fast hover:border-line-strong focus:border-focus",
          value ? "border-ink-3 font-medium text-ink" : "border-line text-ink-2",
        )}
      >
        <option value="">{placeholder ?? label}</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <svg className="pointer-events-none absolute right-2 top-1/2 size-3 -translate-y-1/2 text-ink-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <path d="M3 4.5l3 3 3-3" />
      </svg>
    </label>
  );
}
