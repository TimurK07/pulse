"use client";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, CircleHelp, Flag, RefreshCw, Route, Sparkles, Tag } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { PRIORITY_LABEL, STATUS_LABEL, type IssueStatus, type Priority } from "@/lib/domain";
import { fmtDateTime } from "@/lib/client/format";
import { Button } from "@/components/ui/button";
import { SourceBadge, StatusIcon } from "@/components/ui/status";
import { Skeleton } from "@/components/ui/states";

export interface TriageData {
  data: {
    summary: string;
    keyPoints: string[];
    suggestedNextStep: string;
    suggestedPriority: Priority;
    priorityReason: string;
    clarifyingQuestion: string | null;
    categoryCheck: { suggested: string | null; matches: boolean; reason: string } | null;
    related: { code: string; title: string; status: string }[];
  };
  source: "ai" | "cache" | "fallback";
  model: string | null;
  notice?: string;
  generatedAt: string;
  stale?: boolean;
}

/**
 * Ассистент PULSE в карточке обращения. Разделяет:
 *  1) суть и факты, извлечённые из текста (сверяются с описанием);
 *  2) рекомендации — каждая с отдельной кнопкой и подтверждением человеком;
 *  3) похожие обращения (возможные дубликаты).
 * Запускается явно (защита от лишних запросов), результат хранится в обращении.
 */
export function AiTriage({
  code,
  currentPriority,
  onApplyPriority,
  onAskQuestion,
  onApplyCategory,
  canEdit,
  canAsk,
}: {
  code: string;
  currentPriority: Priority;
  onApplyPriority: (p: Priority) => void;
  onAskQuestion: (q: string) => void;
  onApplyCategory: (name: string) => void;
  canEdit: boolean;
  canAsk: boolean;
}) {
  const qc = useQueryClient();
  const cached = useQuery({
    queryKey: ["triage", code],
    queryFn: () => api.get<{ triage: TriageData | null }>(`/api/issues/${code}/triage`),
  });
  const run = useMutation({
    mutationFn: () => api.post<{ triage: TriageData }>(`/api/issues/${code}/triage`),
    onSuccess: (d) => qc.setQueryData(["triage", code], d),
  });
  const t = cached.data?.triage;

  if (cached.isLoading) return null;

  if (!t) {
    return (
      <section aria-label="Ассистент" className="rounded-pop border border-dashed border-line-strong px-4 py-3.5 sm:px-5">
        <div className="flex flex-wrap items-center gap-3">
          <Sparkles className="hidden size-4 text-ink-3 sm:block" strokeWidth={1.75} />
          <div className="min-w-0 flex-1 basis-56">
            <div className="text-ui font-medium text-ink">Ассистент: разбор обращения</div>
            <p className="text-meta text-ink-3">Суть, проверка категории и приоритета, вопрос автору, похожие обращения. Имя и контакты автора не передаются.</p>
          </div>
          <Button size="sm" onClick={() => run.mutate()} loading={run.isPending}>
            Разобрать
          </Button>
        </div>
        {run.isPending && (
          <div className="mt-3 space-y-2" aria-hidden>
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        )}
        {run.isError && <p className="mt-2 text-label text-danger">{errorMessage(run.error)}</p>}
      </section>
    );
  }

  const d = t.data;
  const priorityDiffers = d.suggestedPriority !== currentPriority;
  const categoryDiffers = !!(d.categoryCheck && !d.categoryCheck.matches && d.categoryCheck.suggested);

  const suggestions: { key: string; icon: React.ReactNode; title: string; reason: string; action?: React.ReactNode; ok?: boolean }[] = [
    {
      key: "next",
      icon: <Route className="size-3.5" />,
      title: d.suggestedNextStep,
      reason: "Рекомендуемый следующий шаг",
    },
    {
      key: "priority",
      icon: <Flag className="size-3.5" />,
      title: priorityDiffers ? `Приоритет: ${PRIORITY_LABEL[currentPriority].toLowerCase()} → ${PRIORITY_LABEL[d.suggestedPriority].toLowerCase()}` : `Приоритет «${PRIORITY_LABEL[d.suggestedPriority].toLowerCase()}» выбран верно`,
      reason: d.priorityReason,
      ok: !priorityDiffers,
      action:
        priorityDiffers && canEdit ? (
          <Button size="sm" onClick={() => onApplyPriority(d.suggestedPriority)}>
            Применить
          </Button>
        ) : undefined,
    },
    ...(d.categoryCheck
      ? [
          {
            key: "category",
            icon: <Tag className="size-3.5" />,
            title: categoryDiffers ? `Категория: возможно, «${d.categoryCheck.suggested}»` : "Категория выбрана верно",
            reason: d.categoryCheck.reason,
            ok: !categoryDiffers,
            action:
              categoryDiffers && canEdit ? (
                <Button size="sm" onClick={() => onApplyCategory(d.categoryCheck!.suggested!)}>
                  Сменить
                </Button>
              ) : undefined,
          },
        ]
      : []),
    ...(d.clarifyingQuestion
      ? [
          {
            key: "question",
            icon: <CircleHelp className="size-3.5" />,
            title: `«${d.clarifyingQuestion}»`,
            reason: "Вопрос автору — без ответа решение принять трудно",
            action:
              canEdit && canAsk ? (
                <Button size="sm" onClick={() => onAskQuestion(d.clarifyingQuestion!)}>
                  Запросить уточнение
                </Button>
              ) : undefined,
          },
        ]
      : []),
  ];

  return (
    <section aria-label="Ассистент" className="rounded-pop border border-line bg-raised">
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5 sm:px-5">
        <Sparkles className="size-4 text-ink-2" strokeWidth={1.75} />
        <span className="text-ui font-medium text-ink">Ассистент</span>
        <SourceBadge source={t.source} model={t.model} notice={t.notice} />
        <span className="text-micro text-ink-3">{fmtDateTime(t.generatedAt)}</span>
        {t.stale && <span className="text-micro text-warn">· обращение изменилось после разбора</span>}
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => run.mutate()} loading={run.isPending} aria-label="Обновить разбор">
          <RefreshCw className="size-3.5" />
        </Button>
      </header>
      {t.source === "fallback" && t.notice && <p className="border-b border-line bg-subtle/50 px-4 py-2 text-meta text-ink-3 sm:px-5">{t.notice}</p>}

      <div className="grid gap-5 px-4 py-4 sm:px-5">
        <div>
          <p className="text-body text-ink">{d.summary}</p>
          {d.keyPoints.length > 0 && (
            <ul className="mt-2.5 space-y-1 border-l-2 border-line pl-3">
              {d.keyPoints.map((k, n) => (
                <li key={n} className="text-meta text-ink-2">
                  {k}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1.5 text-micro text-ink-3">Суть и факты извлечены из текста и переписки — сверяйте с описанием.</p>
        </div>

        <div>
          <h3 className="mb-1.5 text-micro font-medium uppercase tracking-[0.08em] text-ink-3">Рекомендации · решение за вами</h3>
          <ul className="divide-y divide-line rounded-ctl border border-line">
            {suggestions.map((s) => (
              <li key={s.key} className="flex flex-wrap items-start gap-x-3 gap-y-2 px-3 py-2.5">
                <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${s.ok ? "bg-ok-soft text-ok" : "bg-subtle text-ink-2"}`}>{s.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-ui text-ink">{s.title}</span>
                  <span className="block text-meta text-ink-3">{s.reason}</span>
                </span>
                {s.action && <span className="shrink-0">{s.action}</span>}
              </li>
            ))}
          </ul>
        </div>

        {d.related.length > 0 && (
          <div>
            <h3 className="mb-1.5 text-micro font-medium uppercase tracking-[0.08em] text-ink-3">Похожие обращения · возможные дубликаты</h3>
            <ul className="space-y-1">
              {d.related.map((r) => (
                <li key={r.code}>
                  <Link href={`/issues/${r.code}`} className="group flex items-center gap-2 rounded-ctl px-1 py-1 text-meta text-ink transition-colors-fast hover:bg-subtle">
                    <StatusIcon status={r.status as IssueStatus} size={12} />
                    <span className="mono-id shrink-0 whitespace-nowrap text-ink-3">{r.code}</span>
                    <span className="min-w-0 truncate">{r.title}</span>
                    <span className="hidden shrink-0 text-ink-3 sm:inline">· {STATUS_LABEL[r.status as IssueStatus]}</span>
                    <ArrowUpRight className="ml-auto size-3.5 shrink-0 text-ink-4 group-hover:text-ink-2" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <p className="border-t border-line px-4 py-2 text-micro text-ink-3 sm:px-5">Ассистент ничего не меняет сам: каждое действие подтверждаете вы.</p>
    </section>
  );
}
