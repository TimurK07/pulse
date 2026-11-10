"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { useMeta } from "@/lib/client/queries";
import { isOpen } from "@/lib/domain";
import type { IssueListItem } from "@/lib/services/issues";
import { MyIssueRow } from "@/components/issue/issue-row";
import { EmptyState, ErrorState, RowsSkeleton } from "@/components/ui/states";
import { useViewer } from "@/components/shell/viewer";
import { Kbd } from "@/components/ui/status";

export function MyView() {
  const viewer = useViewer();
  const meta = useMeta();
  const mine = useQuery({ queryKey: ["issues", "mine"], queryFn: () => api.get<{ items: IssueListItem[] }>("/api/issues?view=mine") });
  const supported = useQuery({ queryKey: ["issues", "supported"], queryFn: () => api.get<{ items: IssueListItem[] }>("/api/issues?view=supported") });

  const items = mine.data?.items ?? [];
  const waiting = items.filter((i) => i.status === "NEEDS_INFO");
  const active = items.filter((i) => isOpen(i.status) && i.status !== "NEEDS_INFO");
  const done = items.filter((i) => !isOpen(i.status));
  const firstName = viewer.name.split(" ")[0];
  const sla = meta.data?.sla;

  return (
    <div className="pb-16">
      <header className="border-b border-line px-4 pb-6 pt-7 sm:px-8">
        <p className="text-label font-medium text-ink-3">{viewer.department ?? ""}</p>
        <h1 className="mt-1 text-display font-semibold">Здравствуйте, {firstName}</h1>
        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link
            href="/new"
            className="inline-flex h-10 items-center gap-2 rounded-ctl bg-accent px-4 text-ui font-semibold text-accent-ink transition-colors-fast hover:bg-accent-hover active:bg-accent-press"
          >
            Сообщить о проблеме или предложить улучшение
            <ArrowRight className="size-4" />
          </Link>
          <span className="flex items-center gap-1.5 text-meta text-ink-3">
            или нажмите <Kbd>C</Kbd> в любом разделе
          </span>
        </div>
        {sla && (
          <p className="mt-5 max-w-[640px] text-meta text-ink-3">
            У каждого обращения сразу есть ответственный и срок первой реакции — от {sla.HIGH.firstResponseHours} до {sla.LOW.firstResponseHours} ч. Итог — решение или
            мотивированный отказ — появится здесь.
          </p>
        )}
      </header>

      {mine.isLoading && <RowsSkeleton rows={5} />}
      {mine.isError && <ErrorState message={errorMessage(mine.error)} onRetry={() => mine.refetch()} />}
      {mine.data && items.length === 0 && (
        <EmptyState title="Здесь появятся ваши обращения" text="Опишите, что мешает работать или что можно улучшить. Можно скрыть своё имя от обработчиков." />
      )}

      <Section title="Нужен ваш ответ" items={waiting} tone="info" />
      <Section title="Открытые" items={active} />
      <Section title="Завершённые" items={done} />

      {!!supported.data?.items.length && (
        <Section title="Вы поддержали" items={supported.data.items} note="Обращения коллег, с которыми вы тоже сталкиваетесь. Об итоге придёт уведомление." />
      )}
    </div>
  );
}

function Section({ title, items, tone, note }: { title: string; items: IssueListItem[]; tone?: "info"; note?: string }) {
  if (!items.length) return null;
  return (
    <section className="mt-8" aria-label={title}>
      <h2 className="flex items-baseline gap-2 px-4 pb-2 text-title-md font-semibold sm:px-8">
        <span style={tone === "info" ? { color: "var(--st-info)" } : undefined}>{title}</span>
        <span className="mono-num text-meta font-normal text-ink-3">{items.length}</span>
      </h2>
      {note && <p className="-mt-1 px-4 pb-2 text-meta text-ink-3 sm:px-8">{note}</p>}
      <div className="border-t border-line sm:[&>a]:px-8">
        {items.map((i) => (
          <MyIssueRow key={i.id} issue={i} />
        ))}
      </div>
    </section>
  );
}
