"use client";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, RefreshCw } from "lucide-react";
import { useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import { PRIORITY_LABEL, STATUS_LABEL, type IssueStatus, type Priority } from "@/lib/domain";
import { fmtDateTime } from "@/lib/client/format";
import { Button } from "@/components/ui/button";
import { SourceBadge, StatusIcon } from "@/components/ui/status";

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
 * AI-разбор для ответственного. Запускается явно (защита от лишних запросов),
 * результат кэшируется в обращении и переиспользуется, пока текст не изменился.
 */
export function AiTriage({
  code,
  currentPriority,
  onApplyPriority,
  onAskQuestion,
  onApplyCategory,
  canEdit,
}: {
  code: string;
  currentPriority: Priority;
  onApplyPriority: (p: Priority) => void;
  onAskQuestion: (q: string) => void;
  onApplyCategory: (name: string) => void;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(true);
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
      <div className="flex flex-wrap items-center gap-3 rounded-pop border border-dashed border-line-strong px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-ui font-medium text-ink">AI-разбор обращения</div>
          <p className="text-meta text-ink-3">Резюме, проверка категории и приоритета, следующий шаг и вопрос автору. Данные автора не передаются.</p>
        </div>
        <Button size="sm" onClick={() => run.mutate()} loading={run.isPending}>
          Разобрать
        </Button>
        {run.isError && <p className="w-full text-label text-danger">{errorMessage(run.error)}</p>}
      </div>
    );
  }

  const d = t.data;
  const priorityDiffers = d.suggestedPriority !== currentPriority;
  const categoryDiffers = d.categoryCheck && !d.categoryCheck.matches && d.categoryCheck.suggested;

  return (
    <section aria-label="AI-разбор" className="rounded-pop border border-dashed border-line-strong">
      {t.source === "fallback" && t.notice && <p className="border-b border-dashed border-line-strong px-4 py-2 text-meta text-ink-3">{t.notice}</p>}
      <header className="flex items-center gap-2 px-4 pt-3">
        <SourceBadge source={t.source} model={t.model} notice={t.notice} />
        <span className="text-label font-medium text-ink-2">Разбор для ответственного</span>
        <span className="text-micro text-ink-3">· {fmtDateTime(t.generatedAt)}</span>
        {t.stale && <span className="text-micro text-warn">· обращение изменилось</span>}
        <span className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => run.mutate()} loading={run.isPending} aria-label="Обновить разбор">
            <RefreshCw className="size-3.5" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={open ? "Свернуть" : "Развернуть"}>
            <ChevronDown className={`size-3.5 transition-transform ${open ? "" : "-rotate-90"}`} />
          </Button>
        </span>
      </header>
      <div className="px-4 pb-3 pt-2">
        <p className="text-body text-ink">{d.summary}</p>
        {open && (
          <>
            {d.keyPoints.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-meta text-ink-2 marker:text-ink-4">
                {d.keyPoints.map((k, i) => (
                  <li key={i}>{k}</li>
                ))}
              </ul>
            )}
            <dl className="mt-3 grid gap-x-4 gap-y-2 text-meta sm:grid-cols-[132px_minmax(0,1fr)]">
              <dt className="text-ink-3">Следующий шаг</dt>
              <dd className="text-ink">{d.suggestedNextStep}</dd>
              <dt className="text-ink-3">Приоритет</dt>
              <dd className="flex flex-wrap items-center gap-2 text-ink">
                {PRIORITY_LABEL[d.suggestedPriority]}
                <span className="text-ink-3">— {d.priorityReason}</span>
                {priorityDiffers && canEdit && (
                  <Button size="sm" variant="quiet" onClick={() => onApplyPriority(d.suggestedPriority)}>
                    Применить
                  </Button>
                )}
              </dd>
              {d.categoryCheck && (
                <>
                  <dt className="text-ink-3">Категория</dt>
                  <dd className="flex flex-wrap items-center gap-2 text-ink">
                    {d.categoryCheck.matches ? "Выбрана верно" : `Возможно, «${d.categoryCheck.suggested}»`}
                    <span className="text-ink-3">— {d.categoryCheck.reason}</span>
                    {categoryDiffers && canEdit && (
                      <Button size="sm" variant="quiet" onClick={() => onApplyCategory(d.categoryCheck!.suggested!)}>
                        Сменить
                      </Button>
                    )}
                  </dd>
                </>
              )}
              {d.clarifyingQuestion && (
                <>
                  <dt className="text-ink-3">Вопрос автору</dt>
                  <dd className="flex flex-wrap items-center gap-2 text-ink">
                    «{d.clarifyingQuestion}»
                    {canEdit && (
                      <Button size="sm" variant="quiet" onClick={() => onAskQuestion(d.clarifyingQuestion!)}>
                        Запросить уточнение
                      </Button>
                    )}
                  </dd>
                </>
              )}
              {d.related.length > 0 && (
                <>
                  <dt className="text-ink-3">Похожие</dt>
                  <dd className="space-y-1">
                    {d.related.map((r) => (
                      <Link key={r.code} href={`/issues/${r.code}`} className="flex items-center gap-2 text-ink hover:underline">
                        <StatusIcon status={r.status as IssueStatus} size={12} />
                        <span className="mono-id shrink-0 whitespace-nowrap text-ink-3">{r.code}</span>
                        <span className="truncate">{r.title}</span>
                        <span className="shrink-0 text-ink-3">· {STATUS_LABEL[r.status as IssueStatus]}</span>
                      </Link>
                    ))}
                  </dd>
                </>
              )}
            </dl>
            <p className="mt-3 text-micro text-ink-3">Подсказка не применяется автоматически — решение остаётся за ответственным.</p>
          </>
        )}
      </div>
    </section>
  );
}
