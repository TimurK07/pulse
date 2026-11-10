"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ThumbsUp } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { fmtDate } from "@/lib/client/format";
import { pluralRu, TYPE_LABEL, type IssueStatus, type IssueType } from "@/lib/domain";
import { ErrorState, RowsSkeleton, EmptyState } from "@/components/ui/states";
import { StatusIcon } from "@/components/ui/status";

interface Item {
  code: string;
  title: string;
  type: IssueType;
  status: IssueStatus;
  decision: string | null;
  decisionAt: string | null;
  createdAt: string;
  resolvedAt: string | null;
  supportersCount: number;
  category: { name: string };
  department: { name: string } | null;
}

export function ResultsView() {
  const q = useQuery({ queryKey: ["results"], queryFn: () => api.get<{ items: Item[]; stats: Record<string, number> }>("/api/results") });
  const done = q.data?.items.filter((i) => i.status === "IMPLEMENTED") ?? [];
  const work = q.data?.items.filter((i) => i.status === "IN_PROGRESS") ?? [];
  return (
    <div className="pb-16">
      <header className="border-b border-line px-4 pb-6 pt-7 sm:px-8">
        <p className="text-label font-medium text-ink-3">Доска результатов</p>
        <h1 className="mt-1 max-w-[760px] text-display font-semibold">
          {q.data ? (
            <>
              {done.length} {pluralRu(done.length, "улучшение внедрено", "улучшения внедрены", "улучшений внедрено")} по обращениям сотрудников
              <span className="text-ink-3">, ещё {work.length} в работе</span>
            </>
          ) : (
            "Что изменилось благодаря сотрудникам"
          )}
        </h1>
        <p className="mt-2 max-w-[640px] text-body text-ink-2">
          Здесь публикуются результаты без имён авторов. Обращения с пометкой «не показывать коллегам» сюда не попадают.
        </p>
      </header>
      {q.isLoading && <RowsSkeleton rows={4} />}
      {q.isError && <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
      {q.data && !q.data.items.length && <EmptyState title="Пока нет опубликованных результатов" text="Как только ответственные внедрят первые улучшения, они появятся здесь." />}

      {done.length > 0 && (
        <section className="px-4 pt-8 sm:px-8" aria-label="Реализовано">
          <h2 className="mb-3 flex items-center gap-2 text-title-md font-semibold">
            <StatusIcon status="IMPLEMENTED" /> Реализовано
          </h2>
          <ol className="grid gap-px overflow-hidden rounded-pop border border-line bg-line md:grid-cols-2">
            {done.map((i) => (
              <li key={i.code} className="flex flex-col bg-raised p-5">
                <div className="flex items-center gap-2 text-micro text-ink-3">
                  <span className="mono-id">{i.code}</span>
                  <span>·</span>
                  <span>{TYPE_LABEL[i.type]}</span>
                  <span>·</span>
                  <span className="truncate">{i.category.name}</span>
                </div>
                <h3 className="mt-2 text-title-md font-semibold text-ink">{i.title}</h3>
                <p className="mt-2 flex-1 text-body text-ink-2">{i.decision}</p>
                <p className="mt-4 flex flex-wrap gap-x-3 text-micro text-ink-3">
                  {i.decisionAt && <span>внедрено {fmtDate(i.decisionAt)}</span>}
                  {i.resolvedAt && <span>за {Math.max(1, Math.round((new Date(i.resolvedAt).getTime() - new Date(i.createdAt).getTime()) / 864e5))} дн. от идеи до результата</span>}
                  {i.department && <span>идея из подразделения «{i.department.name}»</span>}
                </p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {work.length > 0 && (
        <section className="px-4 pt-10 sm:px-8" aria-label="В работе">
          <h2 className="mb-3 flex items-center gap-2 text-title-md font-semibold">
            <StatusIcon status="IN_PROGRESS" /> Сейчас внедряется
          </h2>
          <ul className="divide-y divide-line border-y border-line">
            {work.map((i) => (
              <li key={i.code} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
                <span className="mono-id text-ink-3">{i.code}</span>
                <span className="text-ui font-medium text-ink">{i.title}</span>
                <span className="text-meta text-ink-3">{i.category.name}</span>
                {i.supportersCount > 0 && (
                  <span className="ml-auto inline-flex items-center gap-1 text-meta text-ink-3">
                    <ThumbsUp className="size-3" /> {i.supportersCount}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-meta text-ink-3">
            Есть похожая проблема? <Link href="/new" className="text-accent-text underline underline-offset-2">Сообщите о ней</Link> — PULSE предложит поддержать существующее обращение.
          </p>
        </section>
      )}
    </div>
  );
}
