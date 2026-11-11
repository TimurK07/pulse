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
import { ArrowRight, Send, TrendingUp, TriangleAlert, Zap } from "lucide-react";
import { useState } from "react";
import { ThemeDecisionDialog, type ThemeRef } from "@/components/issue/theme-decision-dialog";

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
const IMPACT_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

function ImpactMeter({ impact, count }: { impact: "high" | "medium" | "low"; count: number }) {
  const level = IMPACT_RANK[impact];
  return (
    <div className="flex items-center gap-2 sm:block sm:pt-1">
      <div className="flex gap-0.5" role="img" aria-label={IMPACT[impact]}>
        {[1, 2, 3].map((n) => (
          <span key={n} className={cn("h-1.5 w-6 rounded-[2px]", n <= level ? (impact === "high" ? "bg-danger" : "bg-ink-2") : "bg-subtle-2")} />
        ))}
      </div>
      <div className={cn("text-micro sm:mt-1.5", impact === "high" ? "text-danger" : "text-ink-3")}>{IMPACT[impact]}</div>
      <div className="text-micro text-ink-3">{count} обращ.</div>
    </div>
  );
}

function DigestList({ icon, title, tone, empty, children }: { icon: React.ReactNode; title: string; tone?: "danger" | "ok"; empty: string; children: React.ReactNode[] }) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-micro font-medium uppercase tracking-[0.08em] text-ink-3">
        <span className={cn(tone === "danger" ? "text-danger" : tone === "ok" ? "text-ok" : "text-ink-2")}>{icon}</span>
        {title}
        <span className="mono-num normal-case tracking-normal">{children.length || ""}</span>
      </h3>
      {children.length ? <ul className="space-y-3">{children}</ul> : <p className="text-meta text-ink-3">{empty}</p>}
    </section>
  );
}

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
  const q = useQuery({ queryKey: ["digest"], queryFn: () => api.get<{ digest: Digest | null; bitrix?: boolean }>("/api/ai/digest") });
  const [theme, setTheme] = useState<ThemeRef | null>(null);
  const share = useMutation({
    mutationFn: () => api.post("/api/ai/digest/share"),
    onSuccess: () => toast.success("Сводка отправлена в рабочий чат Битрикс24"),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const gen = useMutation({
    mutationFn: () => api.post<{ digest: Digest; reused: boolean }>("/api/ai/digest"),
    onSuccess: (d) => {
      qc.setQueryData(["digest"], (old: { bitrix?: boolean } | undefined) => ({ ...old, digest: d.digest }));
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
        {canGenerate && d && q.data?.bitrix && (
          <Button onClick={() => share.mutate()} loading={share.isPending} variant="ghost" disabled={gen.isPending}>
            <Send className="size-3.5" aria-hidden /> В Битрикс24
          </Button>
        )}
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
      {q.isError && !d && (
        <p className="px-5 py-5 text-meta text-danger">
          Не удалось загрузить сводку.{" "}
          <button type="button" className="underline" onClick={() => q.refetch()}>
            Повторить
          </button>
        </p>
      )}
      {!q.isLoading && !q.isError && !d && !gen.isPending && (
        <p className="px-5 py-5 text-meta text-ink-3">
          {canGenerate ? "Сводка ещё не формировалась." : "Сводку формирует руководитель направления."}
        </p>
      )}
      {d && (
        <div className="px-5 py-5">
          {d.source === "local" && d.content.notice && <p className="mb-3 text-meta text-ink-3">{d.content.notice}</p>}
          <p className="max-w-[860px] text-title-lg font-semibold text-ink">{d.content.headline}</p>
          <p className="mt-1.5 max-w-[860px] text-body text-ink-2">{d.content.overview}</p>

          {d.content.systemicProblems.length > 0 && (
            <div className="mt-7">
              <h3 className="mb-2 text-micro font-medium uppercase tracking-[0.08em] text-ink-3">Системные проблемы</h3>
              <ol className="divide-y divide-line border-y border-line">
                {[...d.content.systemicProblems]
                  .sort((a, b) => IMPACT_RANK[b.impact] - IMPACT_RANK[a.impact] || b.issueCodes.length - a.issueCodes.length)
                  .map((p, n) => (
                    <li key={n} className="grid gap-x-4 gap-y-2 py-4 sm:grid-cols-[28px_minmax(0,1fr)_132px]">
                      <span className="mono-num hidden pt-0.5 text-title-md text-ink-3 sm:block">{String(n + 1).padStart(2, "0")}</span>
                      <div className="min-w-0">
                        <div className="text-ui font-semibold text-ink">{p.title}</div>
                        <p className="mt-0.5 text-meta text-ink-2">{p.description}</p>
                        <div className="mt-2">
                          <Codes codes={p.issueCodes} />
                        </div>
                        <div className="mt-2.5 flex flex-wrap items-start gap-x-3 gap-y-2 rounded-ctl bg-subtle/70 px-3 py-2 text-meta text-ink">
                          <p className="flex min-w-0 flex-1 basis-64 gap-2">
                            <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-accent-text" aria-hidden />
                            <span>
                              <span className="font-medium">Что сделать: </span>
                              {p.recommendation}
                            </span>
                          </p>
                          {canGenerate && p.issueCodes.length > 0 && (
                            <button type="button" onClick={() => setTheme({ title: p.title, codes: p.issueCodes })} className="shrink-0 font-medium text-accent-text hover:underline">
                              Решить тему →
                            </button>
                          )}
                        </div>
                      </div>
                      <ImpactMeter impact={p.impact} count={p.issueCodes.length} />
                    </li>
                  ))}
              </ol>
            </div>
          )}

          <div className="mt-7 grid gap-6 md:grid-cols-3">
            <DigestList icon={<Zap className="size-3.5" />} title="Быстрые улучшения" empty="Нет предложений">
              {d.content.quickWins.map((w, n) => (
                <li key={n}>
                  <span className="text-ui text-ink">{w.title}</span>
                  <span className="mt-0.5 block text-meta text-ink-3">{w.why}</span>
                  <span className="mt-1 block">
                    <Codes codes={w.issueCodes} />
                  </span>
                </li>
              ))}
            </DigestList>
            <DigestList icon={<TriangleAlert className="size-3.5" />} title="Риски" tone="danger" empty="Существенных рисков нет">
              {d.content.risks.map((r, n) => (
                <li key={n} className="text-meta text-ink-2">
                  {r}
                </li>
              ))}
            </DigestList>
            <DigestList icon={<TrendingUp className="size-3.5" />} title="Позитивные сигналы" tone="ok" empty="—">
              {d.content.positiveSignals.map((r, n) => (
                <li key={n} className="text-meta text-ink-2">
                  {r}
                </li>
              ))}
            </DigestList>
          </div>
        </div>
      )}
      <ThemeDecisionDialog theme={theme} onClose={() => setTheme(null)} />
    </section>
  );
}
