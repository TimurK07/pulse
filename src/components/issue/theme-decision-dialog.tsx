"use client";
import Link from "next/link";
import { Dialog } from "radix-ui";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Layers } from "lucide-react";
import { api, errorMessage } from "@/lib/client/api";
import { useMeta } from "@/lib/client/queries";
import { OPEN_STATUSES, STATUS_LABEL, STATUS_REQUIRES_TEXT, pluralRu, type IssueStatus } from "@/lib/domain";
import type { IssueListItem } from "@/lib/services/issues";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { StatusPill } from "@/components/ui/status";
import { Skeleton } from "@/components/ui/states";
import { cn } from "@/lib/cn";

type Target = "IN_PROGRESS" | "IMPLEMENTED" | "REJECTED";

const TARGETS: [Target, string][] = [
  ["IN_PROGRESS", "Взять в работу"],
  ["IMPLEMENTED", "Реализовано"],
  ["REJECTED", "Отклонить"],
];

const TEXT: Record<Target, { label: string; placeholder: string }> = {
  IN_PROGRESS: {
    label: "План решения",
    placeholder: "Что сделаем, кто отвечает и к какому сроку. Текст увидят авторы всех обращений темы.",
  },
  IMPLEMENTED: { label: "Что сделано", placeholder: STATUS_REQUIRES_TEXT.IMPLEMENTED!.placeholder },
  REJECTED: { label: "Мотивированный отказ", placeholder: STATUS_REQUIRES_TEXT.REJECTED!.placeholder },
};

const minFor = (t: Target) => STATUS_REQUIRES_TEXT[t]?.min ?? 20;

export interface ThemeRef {
  title: string;
  codes: string[];
}

interface Result {
  codes: string[];
  status: Target;
  notified: number;
  bitrix: boolean;
}

/**
 * Одно решение на всю повторяющуюся тему: руководитель выбирает открытые обращения,
 * исход и владельца — PULSE переводит их все и уведомляет авторов и поддержавших.
 */
export function ThemeDecisionDialog({ theme, onClose }: { theme: ThemeRef | null; onClose: () => void }) {
  const qc = useQueryClient();
  const meta = useMeta();
  // запрашиваем ровно обращения темы — не зависит от размера базы
  const codesQs = (theme?.codes ?? []).map((c) => `code=${encodeURIComponent(c)}`).join("&");
  const issues = useQuery({
    queryKey: ["issues", "theme-pick", codesQs],
    queryFn: () => api.get<{ items: IssueListItem[] }>(`/api/issues?view=all&limit=200&${codesQs}`),
    enabled: !!theme && codesQs.length > 0,
  });

  const [title, setTitle] = useState("");
  const [target, setTarget] = useState<Target>("IN_PROGRESS");
  const [ownerId, setOwnerId] = useState("");
  const [text, setText] = useState("");
  const [excluded, setExcluded] = useState<string[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  // новое открытие — чистая форма
  const openKey = theme ? `${theme.title}|${theme.codes.join(",")}` : "";
  const [lastKey, setLastKey] = useState(openKey);
  if (lastKey !== openKey) {
    setLastKey(openKey);
    setTitle(theme?.title ?? "");
    setTarget("IN_PROGRESS");
    setOwnerId("");
    setText("");
    setExcluded([]);
    setResult(null);
    setError(null);
  }

  const rows = (theme?.codes ?? []).map((code) => ({ code, issue: issues.data?.items.find((i) => i.code === code) }));
  const open = rows.filter((r) => r.issue && OPEN_STATUSES.includes(r.issue.status));
  const selected = open.filter((r) => !excluded.includes(r.code));
  const supporters = selected.reduce((s, r) => s + (r.issue?.supportersCount ?? 0), 0);
  const min = minFor(target);
  const valid = selected.length > 0 && title.trim().length >= 3 && text.trim().length >= min;

  const decide = useMutation({
    mutationFn: () =>
      api.post<Result>("/api/themes", {
        title: title.trim(),
        codes: selected.map((r) => r.code),
        status: target,
        text: text.trim(),
        ownerId: ownerId || null,
      }),
    onSuccess: (r) => {
      setResult(r);
      setError(null);
      qc.invalidateQueries({ queryKey: ["issues"] });
      qc.invalidateQueries({ queryKey: ["analytics"] });
      qc.invalidateQueries({ queryKey: ["issue"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e) => setError(errorMessage(e)),
  });

  return (
    <Dialog.Root open={!!theme} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--overlay)]" />
        <Dialog.Content className="fixed left-1/2 top-[6vh] z-50 max-h-[88vh] w-[600px] max-w-[calc(100vw-24px)] -translate-x-1/2 animate-pop-in overflow-y-auto rounded-dlg border border-line bg-raised p-6 shadow-[var(--shadow-dialog)]">
          {theme && result ? (
            <Success result={result} title={title.trim()} onClose={onClose} />
          ) : theme ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (valid) decide.mutate();
              }}
            >
              <Dialog.Title className="flex items-center gap-2 text-title-lg font-semibold">
                <Layers className="size-5 text-ink-3" aria-hidden /> Решить тему целиком
              </Dialog.Title>
              <Dialog.Description className="mt-1.5 text-meta text-ink-3">
                Одно решение для всех открытых обращений темы. Каждый автор и все, кто поддержал, получат уведомление с итогом.
              </Dialog.Description>

              <div className="mt-5 space-y-5">
                <div>
                  <Label htmlFor="theme-title" required>
                    Тема
                  </Label>
                  <Input id="theme-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} />
                </div>

                <fieldset>
                  <legend className="mb-1.5 text-label font-medium text-ink-2">
                    Обращения <span className="mono-num font-normal text-ink-3">{selected.length}</span>
                  </legend>
                  {issues.isLoading ? (
                    <Skeleton className="h-24 w-full" />
                  ) : (
                    <ul className="divide-y divide-line rounded-ctl border border-line">
                      {rows.map(({ code, issue }) => {
                        const isOpen = !!issue && OPEN_STATUSES.includes(issue.status);
                        const on = isOpen && !excluded.includes(code);
                        return (
                          <li key={code}>
                            <label className={cn("flex items-start gap-3 px-3 py-2.5", isOpen ? "cursor-pointer hover:bg-subtle/50" : "opacity-60")}>
                              <input
                                type="checkbox"
                                className="mt-1 size-4 accent-[var(--ink)]"
                                checked={on}
                                disabled={!isOpen}
                                onChange={(e) => setExcluded((x) => (e.target.checked ? x.filter((c) => c !== code) : [...x, code]))}
                                aria-label={`Включить ${code}`}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-2">
                                  <span className="mono-id text-ink-2">{code}</span>
                                  {issue && <StatusPill status={issue.status} />}
                                  {!isOpen && <span className="text-micro text-ink-3">{issue ? "уже решено" : "нет доступа"}</span>}
                                </span>
                                {issue && <span className="mt-0.5 block truncate text-meta text-ink">{issue.title}</span>}
                              </span>
                              {issue && issue.supportersCount > 0 && (
                                <span className="mono-num shrink-0 text-micro text-ink-3">+{issue.supportersCount}</span>
                              )}
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </fieldset>

                <div>
                  <span className="mb-1.5 block text-label font-medium text-ink-2">Решение</span>
                  <Segmented value={target} onChange={(v) => setTarget(v as Target)} options={TARGETS} label="Решение по теме" />
                </div>

                {target === "IN_PROGRESS" && (
                  <div>
                    <Label htmlFor="theme-owner" hint="станет ответственным по всем обращениям">
                      Владелец темы
                    </Label>
                    <Select id="theme-owner" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
                      <option value="">Оставить текущих ответственных</option>
                      {(meta.data?.staff ?? []).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} — {s.title}
                          {s.isAvailable ? "" : " (отсутствует)"}
                        </option>
                      ))}
                    </Select>
                  </div>
                )}

                <div>
                  <Label htmlFor="theme-text" required hint={`${text.trim().length}/${min}+`}>
                    {TEXT[target].label}
                  </Label>
                  <Textarea id="theme-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={TEXT[target].placeholder} aria-invalid={!!error || undefined} />
                  <FieldError>{error}</FieldError>
                </div>
              </div>

              <p className="mt-4 text-meta text-ink-3">
                {selected.length} {pluralRu(selected.length, "обращение перейдёт", "обращения перейдут", "обращений перейдут")} в «{STATUS_LABEL[target as IssueStatus]}». Уведомим авторов
                {supporters > 0 ? ` и ${supporters} ${pluralRu(supporters, "поддержавшего", "поддержавших", "поддержавших")}` : ""}.
              </p>

              <div className="mt-5 flex justify-end gap-2">
                <Dialog.Close asChild>
                  <Button type="button" variant="ghost">
                    Отмена
                  </Button>
                </Dialog.Close>
                <Button type="submit" variant={target === "REJECTED" ? "danger" : "primary"} disabled={!valid} loading={decide.isPending}>
                  {target === "IN_PROGRESS" ? "Взять тему в работу" : target === "IMPLEMENTED" ? "Закрыть тему: реализовано" : "Отклонить тему"}
                </Button>
              </div>
            </form>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Success({ result, title, onClose }: { result: Result; title: string; onClose: () => void }) {
  const n = result.codes.length;
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-full bg-ok-soft text-ok">
          <Check className="size-5" aria-hidden />
        </span>
        <div>
          <Dialog.Title className="text-title-lg font-semibold">Системное решение принято</Dialog.Title>
          <Dialog.Description className="text-meta text-ink-3">«{title}»</Dialog.Description>
        </div>
      </div>
      <dl className="mt-6 grid grid-cols-2 border-y border-line">
        <div className="border-r border-line py-4 pr-4">
          <dd className="mono-num text-[34px] leading-10 text-ink">{n}</dd>
          <dt className="text-meta text-ink-2">
            {pluralRu(n, "обращение", "обращения", "обращений")} → «{STATUS_LABEL[result.status]}» одним действием
          </dt>
        </div>
        <div className="py-4 pl-4">
          <dd className="mono-num text-[34px] leading-10 text-ink">{result.notified}</dd>
          <dt className="text-meta text-ink-2">{pluralRu(result.notified, "сотрудник получил", "сотрудника получили", "сотрудников получили")} уведомление</dt>
        </div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-1">
        {result.codes.map((c) => (
          <Link key={c} href={`/issues/${c}`} onClick={onClose} className="mono-id rounded-chip border border-line px-1.5 text-ink-2 hover:border-ink-3 hover:text-ink">
            {c}
          </Link>
        ))}
      </div>
      {result.bitrix && <p className="mt-3 text-meta text-ink-3">Итог отправлен одним сообщением в рабочий чат Битрикс24.</p>}
      <div className="mt-6 flex justify-end">
        <Button variant="primary" onClick={onClose} autoFocus>
          Готово
        </Button>
      </div>
    </div>
  );
}
