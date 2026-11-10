"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Check, Download, EyeOff, Link2, Lock, Paperclip, ThumbsUp, Upload } from "lucide-react";
import { cn } from "@/lib/cn";
import { api, errorMessage, ApiClientError } from "@/lib/client/api";
import { useMeta } from "@/lib/client/queries";
import {
  ALLOWED_MIME,
  AUTHOR_STEPS,
  LIMITS,
  PRIORITY_LABEL,
  PRIORITY_ORDER,
  STATUS_LABEL,
  transitionLabel,
  authorStepIndex,
  isOpen,
  type IssueStatus,
} from "@/lib/domain";
import type { IssueDetail } from "@/lib/services/issues";
import { fmtBytes, fmtDate, fmtDateTime } from "@/lib/client/format";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Avatar, Kbd, PriorityIcon, STATUS_VAR, SlaBar, SlaTimer, StatusPill, TypeTag } from "@/components/ui/status";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/states";
import { Timeline } from "@/components/issue/timeline";
import { TransitionDialog } from "@/components/issue/transition-dialog";
import { AiTriage } from "@/components/issue/ai-triage";
import { useViewer } from "@/components/shell/viewer";

export function IssueView({ code }: { code: string }) {
  const qc = useQueryClient();
  const router = useRouter();
  const meta = useMeta();
  const viewer = useViewer();
  const q = useQuery({ queryKey: ["issue", code], queryFn: () => api.get<IssueDetail>(`/api/issues/${code}`) });
  const [target, setTarget] = useState<IssueStatus | null>(null);
  const [prefill, setPrefill] = useState<string | null>(null);
  const [transitionError, setTransitionError] = useState<string | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["issue", code] });
    qc.invalidateQueries({ queryKey: ["issues"] });
    qc.invalidateQueries({ queryKey: ["me"] });
    qc.invalidateQueries({ queryKey: ["triage", code] });
  };

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/api/issues/${code}`, body),
    onSuccess: (_d, body) => {
      invalidate();
      setTarget(null);
      setTransitionError(null);
      if (body.status) toast.success(`Статус: ${STATUS_LABEL[body.status as IssueStatus]}`);
      else toast.success("Сохранено");
    },
    onError: (e, body) => {
      if (body.status) setTransitionError(errorMessage(e));
      else toast.error(errorMessage(e));
    },
  });

  const support = useMutation({
    mutationFn: () => api.post<{ supported: boolean }>(`/api/issues/${code}/support`),
    onSuccess: (d) => {
      invalidate();
      toast.success(d.supported ? "Вы поддержали обращение — придёт уведомление о решении" : "Поддержка снята");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.isLoading) {
    return (
      <div className="mx-auto max-w-[760px] px-6 py-10">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="mt-4 h-7 w-3/4" />
        <Skeleton className="mt-6 h-24 w-full" />
      </div>
    );
  }
  if (q.isError) {
    const status = (q.error as ApiClientError).status;
    if (status === 404)
      return (
        <EmptyState
          title="Обращение не найдено"
          text="Возможно, у вас нет к нему доступа или код указан неверно."
          action={<Button onClick={() => router.back()}>Назад</Button>}
        />
      );
    return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  }
  const i = q.data!;
  const v = i.viewer;
  const staff = v.canProcess;

  const applyCategory = (name: string) => {
    const cat = meta.data?.categories.find((c) => c.name === name);
    if (cat) patch.mutate({ categoryId: cat.id });
  };

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex h-12 items-center gap-2 border-b border-line px-4 sm:px-6">
        <button onClick={() => router.back()} className="grid size-7 place-items-center rounded-ctl text-ink-2 hover:bg-subtle" aria-label="Назад">
          <ArrowLeft className="size-4" />
        </button>
        <nav aria-label="Хлебные крошки" className="flex min-w-0 items-center gap-1.5 text-meta text-ink-3">
          <Link href={staff ? "/queue?view=open" : v.isAuthor ? "/my" : "/results"} className="hover:text-ink">
            {staff ? "Обращения" : v.isAuthor ? "Мои обращения" : "Результаты"}
          </Link>
          <span>/</span>
          <span className="mono-id text-ink-2">{i.code}</span>
        </nav>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={() => {
            navigator.clipboard?.writeText(location.href).then(() => toast.success("Ссылка скопирована"), () => toast.error("Не удалось скопировать"));
          }}
        >
          <Link2 className="size-3.5" /> <span className="hidden sm:inline">Ссылка</span>
        </Button>
      </div>

      <div className="flex flex-1 flex-col xl:flex-row">
        {/* Основная колонка */}
        <article className="min-w-0 flex-1 px-4 pb-16 pt-6 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-[720px]">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={i.status} withHint />
              <TypeTag type={i.type} />
              <span className="text-meta text-ink-3">{i.category.name}</span>
            </div>
            <h1 className="mt-3 text-title-xl font-semibold text-ink">{i.title}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-meta text-ink-3">
              {i.author ? (
                <>
                  <span className="text-ink-2">{v.isAuthor ? "Вы" : i.author.name}</span>
                  {!v.isAuthor && <span>· {i.author.title}</span>}
                </>
              ) : (
                <span className="inline-flex items-center gap-1 text-ink-2">
                  <EyeOff className="size-3.5" /> Автор скрыт
                </span>
              )}
              {i.department && !(i.isAnonymous && !v.isAuthor) && <span>· {i.department.name}</span>}
              <span>· подано {fmtDateTime(i.createdAt)}</span>
              {v.isAuthor && i.isAnonymous && <span className="text-ink-2">· имя скрыто от обработчиков</span>}
              {v.isAuthor && i.isPrivate && (
                <span className="inline-flex items-center gap-1 text-ink-2">
                  · <Lock className="size-3" /> не видно коллегам
                </span>
              )}
            </p>

            {staff && v.transitions.length > 0 && (
              <div className="mt-5 xl:hidden">
                <Actions issue={i} inline onPick={(s) => { setPrefill(null); setTransitionError(null); setTarget(s); }} />
              </div>
            )}

            {(v.isAuthor || v.access === "public") && <AuthorProgress status={i.status} />}

            {v.canAnswerInfo && (
              <div className="mt-6 rounded-ctl px-4 py-3" style={{ background: "var(--st-info-bg)" }}>
                <p className="text-ui font-medium" style={{ color: "var(--st-info)" }}>
                  Ответственный задал вопрос
                </p>
                <p className="mt-0.5 text-meta text-ink-2">Ответьте в поле внизу страницы — обращение вернётся на рассмотрение автоматически.</p>
              </div>
            )}

            {i.decision && !isOpen(i.status) && (v.isAuthor || v.access === "public") && (
              <section className="mt-6 rounded-ctl bg-subtle px-5 py-4" style={{ boxShadow: `inset 3px 0 0 var(--st-${STATUS_VAR[i.status]})` }} aria-label="Итог рассмотрения">
                <h2 className="text-label font-semibold uppercase tracking-[0.08em]" style={{ color: `var(--st-${STATUS_VAR[i.status]})` }}>
                  Итог: {STATUS_LABEL[i.status]}
                </h2>
                <p className="mt-1.5 whitespace-pre-wrap text-body text-ink">{i.decision}</p>
                <p className="mt-2 text-meta text-ink-3">
                  {i.decidedBy?.name}
                  {i.decidedBy?.title && <>, {i.decidedBy.title}</>} · {i.decisionAt && fmtDate(i.decisionAt)}
                </p>
              </section>
            )}

            {staff && isOpen(i.status) && (
              <div className="mt-6">
                <AiTriage
                  code={i.code}
                  currentPriority={i.priority}
                  canEdit={staff}
                  onApplyPriority={(p) => patch.mutate({ priority: p })}
                  onAskQuestion={(question) => {
                    if (!i.viewer.transitions.includes("NEEDS_INFO")) {
                      toast.error("Из текущего статуса нельзя запросить уточнение");
                      return;
                    }
                    setPrefill(question);
                    setTarget("NEEDS_INFO");
                  }}
                  onApplyCategory={applyCategory}
                />
              </div>
            )}

            <section className="mt-6" aria-label="Описание">
              <p className="whitespace-pre-wrap text-[15px] leading-6 text-ink">{i.description}</p>
              {i.proposedSolution && (
                <div className="mt-5">
                  <h2 className="text-label font-semibold uppercase tracking-[0.08em] text-ink-3">Предлагаемое решение</h2>
                  <p className="mt-1.5 whitespace-pre-wrap text-body text-ink">{i.proposedSolution}</p>
                </div>
              )}
            </section>

            {v.access !== "public" && <Attachments issue={i} onUploaded={invalidate} />}

            {v.access === "public" ? (
              <p className="mt-10 border-t border-line pt-4 text-meta text-ink-3">
                Вы видите обращение коллеги, потому что поддержали его. Переписка и имя автора скрыты; об итоге придёт уведомление.
              </p>
            ) : (
              <section className="mt-10" aria-label="История">
                <h2 className="mb-3 text-title-md font-semibold">История</h2>
                <Timeline items={i.timeline} />
                {v.canComment && <Composer issue={i} onSent={invalidate} />}
                {v.isAuthor && !isOpen(i.status) && (
                  <p className="mt-6 text-meta text-ink-3">
                    Обращение закрыто. Если вопрос остался, <Link className="text-accent-text underline underline-offset-2" href="/new">создайте новое обращение</Link>.
                  </p>
                )}
              </section>
            )}
          </div>
        </article>

        {/* Правая панель свойств */}
        <aside aria-label="Свойства обращения" className="shrink-0 border-t border-line bg-surface xl:w-[300px] xl:border-l xl:border-t-0">
          <div className="space-y-6 px-5 py-5 xl:sticky xl:top-0">
            {staff && v.transitions.length > 0 && (
              <div className="hidden xl:block">
                <Actions issue={i} onPick={(s) => { setPrefill(null); setTransitionError(null); setTarget(s); }} />
              </div>
            )}

            <section>
              <h2 className="mb-1 text-micro font-medium uppercase tracking-[0.08em] text-ink-3">Свойства</h2>
              <dl className="divide-y divide-line text-ui">
                <Prop label="Статус">
                  <StatusPill status={i.status} />
                </Prop>
                <Prop label="Приоритет">
                  {staff ? (
                    <InlineSelect
                      value={i.priority}
                      onChange={(p) => patch.mutate({ priority: p })}
                      options={PRIORITY_ORDER.map((p) => [p, PRIORITY_LABEL[p]])}
                      label="Приоритет"
                      prefix={<PriorityIcon priority={i.priority} />}
                    />
                  ) : (
                    <span className="inline-flex items-center gap-1.5">
                      <PriorityIcon priority={i.priority} /> {PRIORITY_LABEL[i.priority]}
                    </span>
                  )}
                </Prop>
                <Prop label="Категория">
                  {staff && meta.data ? (
                    <InlineSelect value={i.category.id} onChange={(c) => patch.mutate({ categoryId: c })} options={meta.data.categories.map((c) => [c.id, c.name])} label="Категория" />
                  ) : (
                    <span className="text-ink">{i.category.name}</span>
                  )}
                </Prop>
                <Prop label="Ответственный">
                  {v.canReassign && meta.data ? (
                    <InlineSelect
                      value={i.assignee?.id ?? ""}
                      onChange={(id) => patch.mutate({ assigneeId: id || null })}
                      options={[["", "Не назначен"], ...meta.data.staff.map((s) => [s.id, `${s.name}${s.isAvailable ? "" : " (отсутствует)"}`] as [string, string])]}
                      label="Ответственный"
                      prefix={<Avatar name={i.assignee?.name} />}
                    />
                  ) : (
                    <span className="flex items-center gap-2">
                      <Avatar name={i.assignee?.name} />
                      <span className="min-w-0">
                        <span className="block truncate text-ink">{i.assignee?.name ?? "Не назначен"}</span>
                        {i.assignee && <span className="block truncate text-micro text-ink-3">{i.assignee.title}</span>}
                      </span>
                    </span>
                  )}
                  {v.canTakeOver && (
                    <Button size="sm" variant="quiet" className="mt-1" onClick={() => patch.mutate({ assigneeId: viewer.id })}>
                      Взять себе
                    </Button>
                  )}
                </Prop>
                {i.department && !(i.isAnonymous && !v.isAuthor) && (
                  <Prop label="Подразделение">
                    <span className="text-ink">{i.department.name}</span>
                  </Prop>
                )}
              </dl>
            </section>

            <section>
              <h2 className="mb-2 text-micro font-medium uppercase tracking-[0.08em] text-ink-3">Сроки</h2>
              <Deadlines issue={i} canEdit={v.canReassign} onChangeDue={(iso) => patch.mutate({ dueAt: iso })} />
            </section>

            {staff && i.routingNote && (
              <section>
                <h2 className="mb-1.5 text-micro font-medium uppercase tracking-[0.08em] text-ink-3">Маршрутизация</h2>
                <p className="text-meta text-ink-2">{i.routingNote}</p>
              </section>
            )}

            <section>
              <h2 className="mb-1.5 text-micro font-medium uppercase tracking-[0.08em] text-ink-3">Поддержка коллег</h2>
              <p className="flex items-center gap-2 text-ui text-ink">
                <ThumbsUp className="size-3.5 text-ink-3" />
                <span className="mono-num">{i.supportersCount}</span>
                <span className="text-meta text-ink-3">сталкиваются с тем же</span>
              </p>
              {v.canSupport && (
                <Button size="sm" className="mt-2" variant={v.isSupporter ? "secondary" : "primary"} onClick={() => support.mutate()} loading={support.isPending}>
                  {v.isSupporter ? (
                    <>
                      <Check className="size-3.5" /> Вы поддержали
                    </>
                  ) : (
                    "Поддержать"
                  )}
                </Button>
              )}
            </section>
          </div>
        </aside>
      </div>

      <TransitionDialog
        target={target}
        from={i.status}
        prefill={prefill}
        pending={patch.isPending}
        error={transitionError}
        onClose={() => setTarget(null)}
        onSubmit={(text) => patch.mutate({ status: target, text: text || undefined })}
      />
    </div>
  );
}

function Actions({ issue: i, onPick, inline }: { issue: IssueDetail; onPick: (s: IssueStatus) => void; inline?: boolean }) {
  return (
    <section aria-label="Действия">
      {!inline && <h2 className="mb-2 text-micro font-medium uppercase tracking-[0.08em] text-ink-3">Действия</h2>}
      <div className={cn("flex gap-1.5", inline ? "flex-wrap" : "flex-col")}>
        {i.viewer.transitions.map((s, idx) => (
          <Button key={s} size={inline ? "sm" : "md"} variant={idx === 0 ? "primary" : s === "REJECTED" ? "danger" : "secondary"} className="justify-start" onClick={() => onPick(s)}>
            {transitionLabel(i.status, s)}
          </Button>
        ))}
      </div>
    </section>
  );
}

function Prop({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[104px_minmax(0,1fr)] items-start gap-2 py-2.5">
      <dt className="pt-0.5 text-meta text-ink-3">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function InlineSelect({
  value,
  onChange,
  options,
  label,
  prefix,
}: {
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
  label: string;
  prefix?: React.ReactNode;
}) {
  return (
    <label className="group relative -mx-1.5 flex items-center gap-1.5 rounded-ctl px-1.5 py-0.5 transition-colors-fast hover:bg-subtle">
      {prefix}
      <span className="sr-only">{label}</span>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="w-full min-w-0 cursor-pointer appearance-none truncate bg-transparent text-ui text-ink outline-none">
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function Deadlines({ issue: i, canEdit, onChangeDue }: { issue: IssueDetail; canEdit: boolean; onChangeDue: (iso: string) => void }) {
  const open = isOpen(i.status);
  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-meta text-ink-3">Первая реакция</span>
          {i.firstResponseAt ? (
            <span className={cn("text-meta", new Date(i.firstResponseAt) > new Date(i.firstResponseDueAt) ? "text-warn" : "text-ok")}>
              {fmtDateTime(i.firstResponseAt)}
            </span>
          ) : open ? (
            <SlaTimer status={i.status} createdAt={i.createdAt} firstResponseAt={null} firstResponseDueAt={i.firstResponseDueAt} dueAt={i.firstResponseDueAt} variant="panel" />
          ) : (
            <span className="text-meta text-ink-3">—</span>
          )}
        </div>
        {!i.firstResponseAt && open && (
          <div className="mt-1.5">
            <SlaBar createdAt={i.createdAt} deadline={i.firstResponseDueAt} status={i.status} />
          </div>
        )}
        <p className="mt-1 text-micro text-ink-3">норматив до {fmtDateTime(i.firstResponseDueAt)}</p>
      </div>
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-meta text-ink-3">Решение</span>
          {i.resolvedAt ? (
            <span className={cn("text-meta", new Date(i.resolvedAt) > new Date(i.dueAt) ? "text-warn" : "text-ok")}>{fmtDateTime(i.resolvedAt)}</span>
          ) : (
            <SlaTimer status={i.status} createdAt={i.createdAt} firstResponseAt={i.createdAt} firstResponseDueAt={i.firstResponseDueAt} dueAt={i.dueAt} variant="panel" />
          )}
        </div>
        {open && (
          <div className="mt-1.5">
            <SlaBar createdAt={i.createdAt} deadline={i.dueAt} status={i.status} />
          </div>
        )}
        <div className="mt-1 flex items-center justify-between gap-2 text-micro text-ink-3">
          <span>срок {fmtDate(i.dueAt)}</span>
          {canEdit && open && (
            <label className="relative cursor-pointer text-ink-2 hover:text-ink">
              изменить
              <input
                type="date"
                aria-label="Новый срок решения"
                className="absolute inset-0 cursor-pointer opacity-0"
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => {
                  if (e.target.value) onChangeDue(new Date(`${e.target.value}T18:00:00`).toISOString());
                }}
              />
            </label>
          )}
        </div>
      </div>
    </div>
  );
}

function AuthorProgress({ status }: { status: IssueStatus }) {
  const idx = authorStepIndex(status);
  const finalLabel = status === "REJECTED" ? "Отклонено" : status === "CLOSED" ? "Закрыто" : status === "IMPLEMENTED" ? "Реализовано" : "Результат";
  return (
    <ol className="mt-6 grid grid-cols-4 gap-1" aria-label="Ход рассмотрения">
      {AUTHOR_STEPS.map((s, n) => {
        const done = n < idx || (n === idx && n === 3);
        const current = n === idx && n !== 3;
        return (
          <li key={s.key} className="min-w-0" aria-current={current ? "step" : undefined}>
            <div className={cn("h-1 rounded-full", done ? "bg-ink" : current ? "bg-ink-3" : "bg-subtle-2")} />
            <div className={cn("mt-1.5 truncate text-label", done || current ? "font-medium text-ink" : "text-ink-3")}>
              {n === 3 ? finalLabel : s.label}
              {n === 1 && status === "NEEDS_INFO" && <span className="font-normal text-[var(--st-info)]"> · ждём вас</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Attachments({ issue: i, onUploaded }: { issue: IssueDetail; onUploaded: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: async (files: FileList) => {
      const fd = new FormData();
      for (const f of Array.from(files)) fd.append("files", f);
      return api.post(`/api/issues/${i.code}/attachments`, fd);
    },
    onSuccess: () => {
      onUploaded();
      toast.success("Файл добавлен");
    },
    onError: (e) => toast.error(errorMessage(e)),
    onSettled: () => {
      if (ref.current) ref.current.value = "";
    },
  });
  if (!i.attachments.length && !i.viewer.canUpload) return null;
  return (
    <section className="mt-6" aria-label="Материалы">
      <div className="flex items-center justify-between">
        <h2 className="text-label font-semibold uppercase tracking-[0.08em] text-ink-3">Материалы</h2>
        {i.viewer.canUpload && i.attachments.length < LIMITS.attachmentsPerIssue && (
          <>
            <input
              ref={ref}
              type="file"
              multiple
              className="sr-only"
              id="attach"
              aria-label="Прикрепить файлы к обращению"
              accept={Object.keys(ALLOWED_MIME).join(",")}
              onChange={(e) => e.target.files?.length && upload.mutate(e.target.files)}
            />
            <Button size="sm" variant="ghost" onClick={() => ref.current?.click()} loading={upload.isPending}>
              <Upload className="size-3.5" /> Прикрепить
            </Button>
          </>
        )}
      </div>
      {i.attachments.length ? (
        <ul className="mt-2 divide-y divide-line rounded-ctl border border-line">
          {i.attachments.map((a) => (
            <li key={a.id}>
              <a href={`/api/attachments/${a.id}`} className="flex items-center gap-3 px-3 py-2 text-ui transition-colors-fast hover:bg-subtle">
                <Paperclip className="size-3.5 text-ink-3" />
                <span className="min-w-0 flex-1 truncate">{a.fileName}</span>
                <span className="text-micro text-ink-3">
                  {ALLOWED_MIME[a.mimeType] ?? "файл"} · {fmtBytes(a.size)}
                </span>
                <Download className="size-3.5 text-ink-3" />
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-meta text-ink-3">PDF, изображения, документы Office, TXT/CSV — до 10 МБ, не больше {LIMITS.attachmentsPerIssue} файлов.</p>
      )}
    </section>
  );
}

function Composer({ issue: i, onSent }: { issue: IssueDetail; onSent: () => void }) {
  const staff = i.viewer.canProcess;
  const [mode, setMode] = useState<"COMMENT" | "INTERNAL">("COMMENT");
  const [body, setBody] = useState("");
  const send = useMutation({
    mutationFn: () => api.post<{ statusChanged?: boolean }>(`/api/issues/${i.code}/comments`, { body, kind: mode }),
    onSuccess: (d) => {
      setBody("");
      onSent();
      toast.success(d?.statusChanged ? "Ответ отправлен — обращение вернулось на рассмотрение" : mode === "INTERNAL" ? "Заметка сохранена" : "Комментарий отправлен");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!staff && !isOpen(i.status)) return null;
  const answering = i.viewer.canAnswerInfo;
  return (
    <form
      className={cn("mt-6 rounded-pop border bg-raised transition-colors-fast", mode === "INTERNAL" ? "border-line-strong bg-subtle" : "border-line-strong")}
      onSubmit={(e) => {
        e.preventDefault();
        if (body.trim()) send.mutate();
      }}
    >
      <Textarea
        aria-label={answering ? "Ответ на уточнение" : "Комментарий"}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && body.trim()) send.mutate();
        }}
        maxLength={LIMITS.commentMax}
        rows={3}
        autoFocus={answering}
        placeholder={
          answering
            ? "Ответьте на вопрос ответственного…"
            : mode === "INTERNAL"
              ? "Заметка для коллег — автор её не увидит"
              : staff
                ? "Ответ автору: он получит уведомление"
                : "Комментарий для ответственного"
        }
        className="min-h-20 border-0 bg-transparent focus:ring-0"
      />
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-2 py-2">
        {staff && (
          <div role="radiogroup" aria-label="Тип сообщения" className="flex rounded-ctl bg-subtle p-0.5">
            {(
              [
                ["COMMENT", "Ответ автору"],
                ["INTERNAL", "Внутренняя заметка"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={mode === k}
                onClick={() => setMode(k)}
                className={cn("inline-flex h-6 items-center gap-1 rounded-[5px] px-2 text-label text-ink-2", mode === k && "bg-raised font-medium text-ink shadow-[0_1px_2px_rgba(28,27,24,.08)]")}
              >
                {k === "INTERNAL" && <Lock className="size-3" />}
                {l}
              </button>
            ))}
          </div>
        )}
        <span className="ml-auto hidden items-center gap-1 text-micro text-ink-3 sm:flex">
          <Kbd>⌘</Kbd>
          <Kbd>↵</Kbd>
        </span>
        <Button type="submit" size="sm" variant={answering ? "primary" : "secondary"} disabled={!body.trim()} loading={send.isPending}>
          {answering ? "Ответить" : "Отправить"}
        </Button>
      </div>
    </form>
  );
}
