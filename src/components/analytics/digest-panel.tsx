"use client";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/client/api";
import { fmtDateTime } from "@/lib/client/format";
import { Button } from "@/components/ui/button";
import { SourceBadge } from "@/components/ui/status";
import { Skeleton } from "@/components/ui/states";
import { cn } from "@/lib/cn";

interface DigestContent {
  headline: string;
  overview: string;
  systemicProblems: { title: string; description: string; issueCodes: string[]; impact: "high" | "medium" | "low"; recommendation: string }[];
  quickWins: { title: string; issueCodes: string[]; why: string }[];
  risks: string[];
  positiveSignals: string[];
  notice?: string | null;
}
interface Digest {
  id: string;
  source: "ai" | "local";
  model: string | null;
  content: DigestContent;
  issuesCount: number;
  createdAt: string;
}

const IMPACT: Record<string, string> = { high: "высокое влияние", medium: "среднее влияние", low: "низкое влияние" };

const Codes = ({ codes }: { codes: string[] }) => (
  <span className="inline-flex flex-wrap gap-1">
    {codes.map((c) => (
      <Link key={c} href={`/issues/${c}`} className="mono-id rounded-chip border border-line px-1 text-ink-2 hover:border-ink-3 hover:text-ink">
        {c}
      </Link>
    ))}
  </span>
);

export function DigestPanel({ canGenerate }: { canGenerate: boolean }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["digest"], queryFn: () => api.get<{ digest: Digest | null }>("/api/ai/digest") });
  const gen = useMutation({
    mutationFn: () => api.post<{ digest: Digest; reused: boolean }>("/api/ai/digest"),
    onSuccess: (d) => {
      qc.setQueryData(["digest"], { digest: d.digest });
      if (d.reused) toast.info("Данные не изменились с прошлой сводки — показана последняя версия без нового запроса к AI");
      else if (d.digest.source === "local") toast.warning(d.digest.content.notice ?? "Сводка подготовлена локальным алгоритмом");
      else toast.success("Сводка обновлена");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const d = q.data?.digest;

  return (
    <section aria-label="Сводка для руководства" className="rounded-pop border border-line bg-raised">
      <header className="flex flex-wrap items-center gap-3 px-5 py-4 hairline-b">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-title-md font-semibold">
            Сводка для руководства
            {d && <SourceBadge source={d.source === "ai" ? "ai" : "fallback"} model={d.model} notice={d.content.notice ?? undefined} />}
          </h2>
          <p className="text-meta text-ink-3">
            {d
              ? `Сформирована ${fmtDateTime(d.createdAt)} по ${d.issuesCount} обращениям`
              : "Системные проблемы, быстрые улучшения и риски по всем обращениям. Персональные данные авторов не передаются."}
          </p>
        </div>
        {canGenerate && (
          <Button onClick={() => gen.mutate()} loading={gen.isPending} variant={d ? "secondary" : "primary"}>
            {d ? "Обновить сводку" : "Сформировать сводку"}
          </Button>
        )}
      </header>
      {q.isLoading && (
        <div className="space-y-2 p-5">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      )}
      {gen.isPending && <p className="px-5 pt-4 text-meta text-ink-3">Анализируем обращения… обычно до 30 секунд.</p>}
      {!q.isLoading && !d && !gen.isPending && (
        <p className="px-5 py-5 text-meta text-ink-3">
          {canGenerate ? "Сводка ещё не формировалась." : "Сводку формирует руководитель направления."}
        </p>
      )}
      {d && (
        <div className="space-y-6 px-5 py-5">
          {d.source === "local" && d.content.notice && <p className="text-meta text-ink-3">{d.content.notice}</p>}
          <div>
            <p className="text-title-md font-semibold text-ink">{d.content.headline}</p>
            <p className="mt-1 max-w-[860px] text-body text-ink-2">{d.content.overview}</p>
          </div>
          {d.content.systemicProblems.length > 0 && (
            <div>
              <h3 className="mb-2 text-micro font-medium uppercase tracking-[0.08em] text-ink-3">Системные проблемы</h3>
              <ol className="divide-y divide-line border-y border-line">
                {d.content.systemicProblems.map((p, n) => (
                  <li key={n} className="grid gap-x-6 gap-y-1 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <div>
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-ui font-semibold text-ink">{p.title}</span>
                        <span className={cn("text-micro", p.impact === "high" ? "text-danger" : "text-ink-3")}>{IMPACT[p.impact]}</span>
                      </div>
                      <p className="mt-0.5 text-meta text-ink-2">{p.description}</p>
                      <div className="mt-1.5">
                        <Codes codes={p.issueCodes} />
                      </div>
                    </div>
                    <p className="text-meta text-ink">
                      <span className="text-ink-3">Рекомендация: </span>
                      {p.recommendation}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          )}
          <div className="grid gap-6 md:grid-cols-3">
            {d.content.quickWins.length > 0 && (
              <div>
                <h3 className="mb-2 text-micro font-medium uppercase tracking-[0.08em] text-ink-3">Быстрые улучшения</h3>
                <ul className="space-y-2">
                  {d.content.quickWins.map((w, n) => (
                    <li key={n} className="text-meta">
                      <span className="text-ink">{w.title}</span> <Codes codes={w.issueCodes} />
                      <span className="block text-ink-3">{w.why}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {d.content.risks.length > 0 && (
              <div>
                <h3 className="mb-2 text-micro font-medium uppercase tracking-[0.08em] text-ink-3">Риски</h3>
                <ul className="list-disc space-y-1 pl-4 text-meta text-ink-2 marker:text-ink-4">
                  {d.content.risks.map((r, n) => (
                    <li key={n}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
            {d.content.positiveSignals.length > 0 && (
              <div>
                <h3 className="mb-2 text-micro font-medium uppercase tracking-[0.08em] text-ink-3">Позитивные сигналы</h3>
                <ul className="list-disc space-y-1 pl-4 text-meta text-ink-2 marker:text-ink-4">
                  {d.content.positiveSignals.map((r, n) => (
                    <li key={n}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
