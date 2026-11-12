"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Check, CornerDownLeft, FileText, Paperclip, ThumbsUp, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { api, errorMessage, ApiClientError, uploadFiles } from "@/lib/client/api";
import { useMeta } from "@/lib/client/queries";
import { ALLOWED_MIME, LIMITS, STATUS_LABEL, TYPE_HINT, TYPE_LABEL, type IssueStatus, type IssueType } from "@/lib/domain";
import { fmtBytes, fmtDateTime } from "@/lib/client/format";
import { Button } from "@/components/ui/button";
import { Checkbox, FieldError, Input, Label, Select, Textarea } from "@/components/ui/field";
import { SourceBadge, StatusIcon } from "@/components/ui/status";

interface AssistResponse {
  data: {
    type: IssueType;
    categoryId: string | null;
    categoryName: string | null;
    priority: string;
    suggestedTitle: string;
    summary: string;
    reasoning: string;
    confidence: "high" | "medium" | "low";
    similar: { code: string; title: string; status: string; categoryName: string; supportersCount: number; relation: "duplicate" | "related"; reason: string }[];
  };
  source: "ai" | "cache" | "fallback";
  model: string | null;
  notice?: string;
  route: { assigneeName: string | null; via: string; note: string } | null;
}

interface Created {
  code: string;
  route: { assigneeName: string | null; note: string; via: string };
}

const CONFIDENCE: Record<string, string> = { high: "высокая", medium: "средняя", low: "низкая" };

export function NewIssueFlow() {
  const meta = useMeta();
  const qc = useQueryClient();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [type, setType] = useState<IssueType>("PROBLEM");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [solution, setSolution] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [isPrivate, setPrivate] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  // ошибка поля исчезает, как только пользователь его исправляет
  const clearError = (k: string) => setErrors((e) => (e[k] ? Object.fromEntries(Object.entries(e).filter(([x]) => x !== k)) : e));
  const [supported, setSupported] = useState<Set<string>>(new Set());
  const [created, setCreated] = useState<Created | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const assist = useMutation({
    mutationFn: () => api.post<AssistResponse>("/api/ai/assist", { title, description, type }),
    onSuccess: (r) => {
      if (r.data.categoryId && !categoryId) setCategoryId(r.data.categoryId);
      setStep(2);
    },
    onError: (e) => {
      // Помощник не обязателен: при ошибке продолжаем без подсказок
      toast.error(`${errorMessage(e)}. Категорию можно выбрать вручную.`);
      setStep(2);
    },
  });

  const support = useMutation({
    mutationFn: (code: string) => api.post<{ supported: boolean }>(`/api/issues/${code}/support`),
    onSuccess: (d, code) => {
      setSupported((s) => {
        const n = new Set(s);
        if (d.supported) n.add(code);
        else n.delete(code);
        return n;
      });
      qc.invalidateQueries({ queryKey: ["issues", "supported"] });
      toast.success(d.supported ? `Вы поддержали ${code}. Об итоге придёт уведомление.` : "Поддержка снята");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const submit = useMutation({
    mutationFn: async () => {
      const ack = (assist.data?.data.similar ?? []).map((s) => s.code);
      const res = await api.post<Created>("/api/issues", {
        type,
        categoryId,
        title,
        description,
        proposedSolution: solution || undefined,
        isAnonymous: anonymous,
        isPrivate,
        acknowledgedSimilar: ack.length ? ack : undefined,
      });
      if (files.length) {
        const { failed } = await uploadFiles(res.code, files);
        if (failed.length) {
          toast.error(
            `Обращение создано, но ${failed.length === files.length ? "файлы не загружены" : `не загружено: ${failed.map((f) => f.name).join(", ")}`} — ${failed[0].message}. Добавьте их в карточке обращения.`,
          );
        }
      }
      return res;
    },
    onSuccess: (res) => {
      setCreated(res);
      setStep(3);
      qc.invalidateQueries({ queryKey: ["issues"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["analytics"] });
    },
    onError: (e) => {
      if (e instanceof ApiClientError && e.details) {
        const map: Record<string, string> = {};
        e.details.forEach((d) => (map[d.path] = d.message));
        setErrors(map);
        if (map.title || map.description) setStep(1);
      }
      toast.error(errorMessage(e));
    },
  });

  function validateStep1() {
    const e: Record<string, string> = {};
    if (title.trim().length < LIMITS.titleMin) e.title = `Минимум ${LIMITS.titleMin} символов`;
    if (description.trim().length < LIMITS.descriptionMin) e.description = `Опишите подробнее — минимум ${LIMITS.descriptionMin} символов`;
    setErrors(e);
    return !Object.keys(e).length;
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (next.length >= LIMITS.attachmentsPerIssue) {
        toast.error(`Не больше ${LIMITS.attachmentsPerIssue} файлов`);
        break;
      }
      if (!ALLOWED_MIME[f.type]) {
        toast.error(`«${f.name}»: формат не поддерживается`);
        continue;
      }
      if (f.size > LIMITS.attachmentMaxBytes) {
        toast.error(`«${f.name}»: больше 10 МБ`);
        continue;
      }
      next.push(f);
    }
    setFiles(next);
    if (fileRef.current) fileRef.current.value = "";
  }

  if (step === 3 && created) {
    return (
      <div className="mx-auto max-w-[640px] px-6 py-16">
        <div className="grid size-10 place-items-center rounded-full" style={{ background: "var(--st-done-bg)", color: "var(--st-done)" }}>
          <Check className="size-5" />
        </div>
        <p className="mono-id mt-6 text-ink-3">{created.code}</p>
        <h1 className="mt-1 text-display font-semibold">Обращение зарегистрировано</h1>
        <dl className="mt-6 divide-y divide-line border-y border-line text-ui">
          <div className="grid grid-cols-[160px_1fr] gap-3 py-3">
            <dt className="text-ink-3">Ответственный</dt>
            <dd>
              {created.route.assigneeName ?? "Будет назначен руководителем"}
              {created.route.via === "backup" && <span className="block text-meta text-ink-3">Основной ответственный сейчас отсутствует — назначен резервный</span>}
              {created.route.via === "manager_queue" && <span className="block text-meta text-ink-3">Передано в общую очередь руководителя направления</span>}
            </dd>
          </div>
          <div className="grid grid-cols-[160px_1fr] gap-3 py-3">
            <dt className="text-ink-3">Что дальше</dt>
            <dd className="text-ink-2">Ответственный получил уведомление. Об изменении статуса и итоге рассмотрения вы узнаете в PULSE.</dd>
          </div>
          {anonymous && (
            <div className="grid grid-cols-[160px_1fr] gap-3 py-3">
              <dt className="text-ink-3">Конфиденциальность</dt>
              <dd className="text-ink-2">Ваше имя скрыто от обработчиков. Уточняющие вопросы придут вам в PULSE.</dd>
            </div>
          )}
        </dl>
        <div className="mt-8 flex flex-wrap gap-2">
          <Link href={`/issues/${created.code}`} className="inline-flex h-9 items-center rounded-ctl bg-accent px-4 text-ui font-semibold text-accent-ink hover:bg-accent-hover">
            Открыть обращение
          </Link>
          <Link href="/my" className="inline-flex h-9 items-center rounded-ctl border border-line-strong bg-raised px-4 text-ui font-medium hover:bg-subtle">
            Мои обращения
          </Link>
          <button
            onClick={() => {
              setStep(1);
              setTitle("");
              setDescription("");
              setSolution("");
              setFiles([]);
              setCategoryId("");
              setCreated(null);
              setSupported(new Set());
              // флаги конфиденциальности не переносятся незаметно на следующее обращение
              setAnonymous(false);
              setPrivate(false);
              setErrors({});
              assist.reset();
            }}
            className="inline-flex h-9 items-center px-3 text-ui text-ink-2 hover:text-ink"
          >
            Подать ещё одно
          </button>
        </div>
      </div>
    );
  }

  const a = assist.data;
  const duplicates = a?.data.similar.filter((s) => s.relation === "duplicate") ?? [];

  return (
    <div className="pb-20">
      <header className="flex h-12 items-center gap-3 border-b border-line px-4 sm:px-8">
        <Link href="/my" className="grid size-7 place-items-center rounded-ctl text-ink-2 hover:bg-subtle" aria-label="Отмена">
          <X className="size-4" />
        </Link>
        <span className="text-ui font-medium">Новое обращение</span>
        <ol className="ml-auto flex items-center gap-4 text-label" aria-label="Шаги">
          {["Описание", "Проверка и отправка"].map((s, n) => (
            <li key={s} className={cn("flex items-center gap-1.5", step === n + 1 ? "font-medium text-ink" : "text-ink-3")} aria-current={step === n + 1 ? "step" : undefined}>
              <span className={cn("mono-num grid size-5 place-items-center rounded-full text-micro", step > n + 1 ? "bg-ink text-surface" : step === n + 1 ? "border border-ink" : "border border-line-strong")}>
                {step > n + 1 ? <Check className="size-3" /> : n + 1}
              </span>
              <span className="hidden sm:inline">{s}</span>
            </li>
          ))}
        </ol>
      </header>

      {step === 1 && (
        <form
          className="mx-auto max-w-[680px] px-4 pt-8 sm:px-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (validateStep1()) assist.mutate();
          }}
        >
          <h1 className="text-title-xl font-semibold">Что произошло или что можно улучшить?</h1>
          <p className="mt-1 text-body text-ink-2">Пишите как коллеге: что мешает, где и как часто. Обращение увидит ответственный по теме.</p>

          <fieldset className="mt-7">
            <legend className="mb-2 text-label font-medium text-ink-2">Тип обращения</legend>
            <div className="grid gap-2 sm:grid-cols-3" role="radiogroup">
              {(Object.keys(TYPE_LABEL) as IssueType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={type === t}
                  onClick={() => setType(t)}
                  className={cn(
                    "rounded-ctl border px-3 py-2.5 text-left transition-colors-fast",
                    type === t ? "border-ink bg-raised shadow-[inset_0_0_0_1px_var(--ink)]" : "border-line-strong bg-raised hover:border-ink-3",
                  )}
                >
                  <span className="block text-ui font-medium text-ink">{TYPE_LABEL[t]}</span>
                  <span className="mt-0.5 block text-meta text-ink-3">{TYPE_HINT[t]}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="mt-6">
            <Label htmlFor="title" required hint={`${title.length}/${LIMITS.titleMax}`}>
              Коротко, в одной фразе
            </Label>
            <Input
              id="title"
              value={title}
              maxLength={LIMITS.titleMax}
              onChange={(e) => { setTitle(e.target.value); clearError("title"); }}
              placeholder={type === "PRAISE" ? "Например: Учебные встречи помогают работать вместе" : "Например: В заявках не хватает параметров оборудования"}
              aria-invalid={!!errors.title || undefined}
              aria-describedby="title-err"
            />
            <FieldError id="title-err">{errors.title}</FieldError>
          </div>

          <div className="mt-5">
            <Label htmlFor="description" required hint={`${description.length}/${LIMITS.descriptionMax}`}>
              Подробности
            </Label>
            <Textarea
              id="description"
              rows={6}
              value={description}
              maxLength={LIMITS.descriptionMax}
              onChange={(e) => { setDescription(e.target.value); clearError("description"); }}
              placeholder="Опишите ситуацию: что происходит, в каком процессе, к чему это приводит. Не указывайте персональные и коммерческие данные."
              aria-invalid={!!errors.description || undefined}
              aria-describedby="desc-err"
            />
            <FieldError id="desc-err">{errors.description}</FieldError>
          </div>

          {type !== "PRAISE" && (
            <div className="mt-5">
              <Label htmlFor="solution" hint="необязательно">
                Как это можно решить
              </Label>
              <Textarea id="solution" rows={3} value={solution} maxLength={LIMITS.solutionMax} onChange={(e) => setSolution(e.target.value)} placeholder="Если есть идея решения — опишите её." />
            </div>
          )}

          <div className="mt-5">
            <Label hint="PDF, изображения, Office, TXT/CSV · до 10 МБ">Материалы</Label>
            <input ref={fileRef} id="files" type="file" multiple aria-label="Прикрепить файлы к обращению" className="sr-only" accept={Object.keys(ALLOWED_MIME).join(",")} onChange={(e) => addFiles(e.target.files)} />
            <div className="flex flex-wrap items-center gap-2">
              {files.map((f, n) => (
                <span key={n} className="inline-flex h-8 items-center gap-2 rounded-ctl border border-line bg-raised pl-2.5 pr-1 text-label">
                  <FileText className="size-3.5 text-ink-3" />
                  <span className="max-w-48 truncate">{f.name}</span>
                  <span className="text-ink-3">{fmtBytes(f.size)}</span>
                  <button type="button" aria-label={`Убрать ${f.name}`} onClick={() => setFiles(files.filter((_, k) => k !== n))} className="grid size-6 place-items-center rounded text-ink-3 hover:bg-subtle hover:text-ink">
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              <Button type="button" size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>
                <Paperclip className="size-3.5" /> Прикрепить файл
              </Button>
            </div>
          </div>

          <div className="mt-8 flex items-center justify-between gap-3 border-t border-line pt-5">
            <p className="text-meta text-ink-3">Дальше PULSE подберёт категорию и проверит, нет ли похожих обращений.</p>
            <Button type="submit" variant="primary" size="lg" loading={assist.isPending}>
              Далее <CornerDownLeft className="size-3.5" />
            </Button>
          </div>
        </form>
      )}

      {step === 2 && (
        <div className="mx-auto grid max-w-[1040px] gap-8 px-4 pt-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0">
            <button onClick={() => setStep(1)} className="mb-4 inline-flex items-center gap-1.5 text-meta text-ink-2 hover:text-ink">
              <ArrowLeft className="size-3.5" /> Изменить описание
            </button>
            <h1 className="text-title-xl font-semibold">Проверьте и отправьте</h1>

            {duplicates.length > 0 && (
              <div className="mt-5 rounded-ctl px-4 py-3" style={{ background: "var(--st-new-bg)" }}>
                <p className="text-ui font-medium" style={{ color: "var(--st-new)" }}>
                  Похоже, об этом уже сообщали
                </p>
                <p className="mt-0.5 text-meta text-ink-2">Поддержите существующее обращение — руководитель увидит, что проблема касается многих. Или отправьте своё, если ситуация отличается.</p>
              </div>
            )}

            {!!a?.data.similar.length && (
              <section className="mt-5" aria-label="Похожие обращения">
                <h2 className="mb-2 flex items-center gap-2 text-label font-semibold uppercase tracking-[0.08em] text-ink-3">
                  Похожие обращения <SourceBadge source={a.source} model={a.model} notice={a.notice} />
                </h2>
                <ul className="divide-y divide-line rounded-ctl border border-line">
                  {a.data.similar.map((s) => (
                    <li key={s.code} className="flex items-start gap-3 px-3 py-3">
                      <StatusIcon status={s.status as IssueStatus} className="mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="mono-id text-ink-3">{s.code}</span>
                          <span className="text-ui font-medium text-ink">{s.title}</span>
                        </div>
                        <p className="mt-0.5 text-meta text-ink-3">
                          {s.relation === "duplicate" ? "Та же тема" : "Смежная тема"} · {s.reason} · {STATUS_LABEL[s.status as IssueStatus]}
                          {s.supportersCount > 0 && <> · поддержали {s.supportersCount}</>}
                        </p>
                      </div>
                      <Button size="sm" variant={supported.has(s.code) ? "secondary" : "ghost"} onClick={() => support.mutate(s.code)} loading={support.isPending && support.variables === s.code}>
                        {supported.has(s.code) ? (
                          <>
                            <Check className="size-3.5" /> Поддержано
                          </>
                        ) : (
                          <>
                            <ThumbsUp className="size-3.5" /> Поддержать
                          </>
                        )}
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="mt-6 rounded-ctl border border-line bg-raised px-4 py-4" aria-label="Ваше обращение">
              <div className="flex items-center gap-2 text-meta text-ink-3">
                <span>{TYPE_LABEL[type]}</span>
              </div>
              <h2 className="mt-1 text-title-md font-semibold">{title}</h2>
              {a && a.data.suggestedTitle && a.data.suggestedTitle.trim() !== title.trim() && (
                <p className="mt-1 text-meta text-ink-3">
                  Вариант заголовка: «{a.data.suggestedTitle}»{" "}
                  <button className="text-accent-text underline underline-offset-2" onClick={() => setTitle(a.data.suggestedTitle)}>
                    использовать
                  </button>
                </p>
              )}
              <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-body text-ink-2">{description}</p>
              {files.length > 0 && <p className="mt-2 text-meta text-ink-3">Файлов: {files.length}</p>}
            </section>
          </div>

          <aside className="space-y-6 lg:pt-10">
            <section>
              <Label htmlFor="category" required>
                Категория
              </Label>
              <Select id="category" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); clearError("categoryId"); }} aria-invalid={!!errors.categoryId || undefined}>
                <option value="">Выберите категорию</option>
                {meta.data?.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <FieldError>{errors.categoryId}</FieldError>
              {a && (
                <div className="mt-2 rounded-ctl border border-dashed border-line-strong px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <SourceBadge source={a.source} model={a.model} notice={a.notice} />
                    <span className="text-micro text-ink-3">уверенность: {CONFIDENCE[a.data.confidence]}</span>
                  </div>
                  {a.data.categoryName ? (
                    <p className="mt-1.5 text-meta text-ink-2">
                      Предложено: <b className="font-medium text-ink">{a.data.categoryName}</b>. {a.data.reasoning}
                    </p>
                  ) : (
                    <p className="mt-1.5 text-meta text-ink-2">{a.data.reasoning}</p>
                  )}
                  {a.source === "fallback" && a.notice && <p className="mt-1.5 text-micro text-ink-3">{a.notice}</p>}
                </div>
              )}
            </section>

            {a?.route && categoryId === a.data.categoryId && (
              <section>
                <div className="text-label font-medium text-ink-2">Кто рассмотрит</div>
                <p className="mt-1 text-ui text-ink">{a.route.assigneeName ?? "Руководитель направления"}</p>
                <p className="text-meta text-ink-3">{a.route.note}</p>
              </section>
            )}

            <section>
              <div className="mb-1 text-label font-medium text-ink-2">Конфиденциальность</div>
              <Checkbox id="anon" checked={anonymous} onChange={setAnonymous} label="Скрыть моё имя от обработчиков" description="Ответственный увидит только текст. Вопросы придут вам в PULSE." />
              <Checkbox id="private" checked={isPrivate} onChange={setPrivate} label="Не показывать коллегам" description="Не попадёт в похожие и на доску результатов." />
            </section>

            <div className="border-t border-line pt-5">
              <Button
                variant="primary"
                size="lg"
                className="w-full"
                loading={submit.isPending}
                onClick={() => {
                  if (!categoryId) {
                    setErrors({ categoryId: "Выберите категорию" });
                    return;
                  }
                  submit.mutate();
                }}
              >
                Отправить обращение
              </Button>
              <p className="mt-2 text-micro text-ink-3">
                Сейчас {fmtDateTime(new Date().toISOString())}. Срок первой реакции рассчитывается автоматически по приоритету.
              </p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
