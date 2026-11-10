"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { cn } from "@/lib/cn";
import { api, errorMessage } from "@/lib/client/api";
import { PRIORITY_LABEL, PRIORITY_ORDER, ROLE_DESCRIPTION, ROLE_LABEL, type Priority, type Role } from "@/lib/domain";
import { fmtDateTime } from "@/lib/client/format";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/field";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { Tip } from "@/components/ui/tooltip";

type U = { id: string; name: string; isAvailable: boolean; isActive: boolean };
interface Overview {
  categories: {
    id: string;
    name: string;
    description: string;
    keywords: string[];
    isActive: boolean;
    _count: { issues: number };
    rules: { id: string; issueType: "PROBLEM" | "IDEA" | "PRAISE" | null; mode: "FIXED" | "AUTHOR_DEPARTMENT_HEAD"; primary: U | null; backup: U | null }[];
  }[];
  users: {
    id: string;
    name: string;
    email: string;
    title: string;
    role: Role;
    isActive: boolean;
    isAvailable: boolean;
    department: { name: string } | null;
    headOf: { name: string } | null;
    _count: { assignedIssues: number };
  }[];
  sla: { priority: Priority; firstResponseHours: number; resolutionDays: number }[];
}

const TABS = [
  ["routing", "Категории и маршрутизация"],
  ["users", "Пользователи и роли"],
  ["sla", "Сроки"],
  ["ai", "AI"],
] as const;

export function AdminView() {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("routing");
  const q = useQuery({ queryKey: ["admin"], queryFn: () => api.get<Overview>("/api/admin/categories") });
  return (
    <div className="pb-16">
      <header className="px-4 pt-6 sm:px-8">
        <h1 className="text-title-lg font-semibold">Настройки</h1>
        <p className="text-meta text-ink-3">Изменения применяются сразу к новым обращениям. Все действия проверяются на сервере.</p>
        <nav className="-mx-1 mt-4 flex gap-0.5 overflow-x-auto border-b border-line" aria-label="Разделы настроек">
          {TABS.map(([k, l]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              aria-current={tab === k ? "page" : undefined}
              className={cn("-mb-px h-9 shrink-0 border-b-2 px-3 text-ui text-ink-2 hover:text-ink", tab === k ? "border-ink font-medium text-ink" : "border-transparent")}
            >
              {l}
            </button>
          ))}
        </nav>
      </header>
      {q.isLoading && (
        <div className="space-y-2 p-8">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      )}
      {q.isError && <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
      {q.data && tab === "routing" && <Routing data={q.data} />}
      {q.data && tab === "users" && <Users data={q.data} />}
      {q.data && tab === "sla" && <Sla data={q.data} />}
      {tab === "ai" && <AiSettings />}
    </div>
  );
}

function useAdminMutation<T>(fn: (v: T) => Promise<unknown>, ok = "Сохранено") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      qc.invalidateQueries({ queryKey: ["meta"] });
      toast.success(ok);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

const cellSelect = "h-8 w-full min-w-0 rounded-ctl border border-line bg-raised px-2 text-label outline-none hover:border-line-strong focus:border-focus";

function Routing({ data }: { data: Overview }) {
  const handlers = data.users.filter((u) => u.role !== "EMPLOYEE" && u.isActive);
  const saveRule = useAdminMutation((body: Record<string, unknown>) => api.put("/api/admin/routing", body), "Правило маршрутизации сохранено");
  const toggleCat = useAdminMutation(({ id, isActive }: { id: string; isActive: boolean }) => api.patch(`/api/admin/categories/${id}`, { isActive }));
  const [adding, setAdding] = useState(false);

  const userOpt = (u: (typeof handlers)[number]) => (
    <option key={u.id} value={u.id}>
      {u.name}
      {!u.isAvailable ? " — отсутствует" : ""}
    </option>
  );

  return (
    <div className="px-4 pt-6 sm:px-8">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-[720px] text-meta text-ink-2">
          Обращение направляется основному ответственному категории. Если он отсутствует или деактивирован — резервному, затем руководителю подразделения автора и, в крайнем
          случае, в общую очередь руководителя направления. Так ни одно обращение не остаётся без владельца.
        </p>
        <Button onClick={() => setAdding((v) => !v)}>
          <Plus className="size-3.5" /> Категория
        </Button>
      </div>
      {adding && <NewCategory onDone={() => setAdding(false)} />}
      <div className="overflow-x-auto rounded-pop border border-line">
        <table className="w-full min-w-[880px] text-left text-meta">
          <thead className="bg-canvas/60">
            <tr className="text-micro uppercase tracking-[0.06em] text-ink-3">
              <th className="px-3 py-2 font-medium">Категория</th>
              <th className="px-3 py-2 font-medium">Режим</th>
              <th className="px-3 py-2 font-medium">Основной</th>
              <th className="px-3 py-2 font-medium">Резервный</th>
              <th className="px-3 py-2 text-right font-medium">Обращ.</th>
              <th className="px-3 py-2 font-medium">Активна</th>
            </tr>
          </thead>
          <tbody>
            {data.categories.map((c) => {
              const rule = c.rules.find((r) => r.issueType === null);
              const overrides = c.rules.filter((r) => r.issueType !== null);
              const primaryAway = rule?.primary && !rule.primary.isAvailable;
              return (
                <tr key={c.id} className={cn("border-t border-line align-top", !c.isActive && "opacity-55")}>
                  <td className="px-3 py-2.5">
                    <span className="block text-ui font-medium text-ink">{c.name}</span>
                    <span className="block text-micro text-ink-3">{c.description}</span>
                    {overrides.map((o) => (
                      <span key={o.id} className="mt-1 block text-micro text-ink-2">
                        Положительные отзывы → {o.primary?.name}
                      </span>
                    ))}
                  </td>
                  <td className="px-3 py-2.5">
                    <select
                      aria-label={`Режим для ${c.name}`}
                      className={cellSelect}
                      value={rule?.mode ?? "FIXED"}
                      onChange={(e) =>
                        saveRule.mutate({ categoryId: c.id, issueType: null, mode: e.target.value, primaryId: rule?.primary?.id ?? handlers[0]?.id, backupId: rule?.backup?.id ?? null })
                      }
                    >
                      <option value="FIXED">Ответственный</option>
                      <option value="AUTHOR_DEPARTMENT_HEAD">Рук. подразделения автора</option>
                    </select>
                  </td>
                  <td className="px-3 py-2.5">
                    {rule?.mode === "AUTHOR_DEPARTMENT_HEAD" ? (
                      <span className="text-ink-3">определяется автором</span>
                    ) : (
                      <>
                        <select
                          aria-label={`Основной ответственный для ${c.name}`}
                          className={cn(cellSelect, primaryAway && "border-warn")}
                          value={rule?.primary?.id ?? ""}
                          onChange={(e) => saveRule.mutate({ categoryId: c.id, issueType: null, mode: "FIXED", primaryId: e.target.value, backupId: rule?.backup?.id ?? null })}
                        >
                          {!rule?.primary && <option value="">—</option>}
                          {handlers.map(userOpt)}
                        </select>
                        {primaryAway && <span className="mt-1 block text-micro text-warn">отсутствует — работает резервный</span>}
                      </>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <select
                      aria-label={`Резервный ответственный для ${c.name}`}
                      className={cellSelect}
                      value={rule?.backup?.id ?? ""}
                      onChange={(e) =>
                        saveRule.mutate({ categoryId: c.id, issueType: null, mode: rule?.mode ?? "FIXED", primaryId: rule?.primary?.id ?? null, backupId: e.target.value || null })
                      }
                    >
                      <option value="">Нет</option>
                      {handlers.filter((u) => u.id !== rule?.primary?.id).map(userOpt)}
                    </select>
                  </td>
                  <td className="mono-num px-3 py-2.5 text-right text-ink-2">{c._count.issues}</td>
                  <td className="px-3 py-2.5">
                    <Switch checked={c.isActive} onChange={(v) => toggleCat.mutate({ id: c.id, isActive: v })} label={`Категория ${c.name} активна`} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function NewCategory({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [keywords, setKeywords] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: () => api.post("/api/admin/categories", { name, description, keywords: keywords.split(",").map((k) => k.trim()).filter((k) => k.length >= 2) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      qc.invalidateQueries({ queryKey: ["meta"] });
      toast.success("Категория создана. Назначьте ответственного — до этого обращения пойдут руководителю подразделения автора.");
      onDone();
    },
    onError: (e) => setErr(errorMessage(e)),
  });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
      className="mb-4 grid gap-3 rounded-pop border border-line bg-raised p-4 md:grid-cols-[1fr_1.4fr_1.4fr_auto] md:items-end"
    >
      <div>
        <Label htmlFor="cat-name" required>Название</Label>
        <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="cat-desc">Описание</Label>
        <Input id="cat-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="cat-kw" hint="через запятую">Ключевые слова для локального классификатора</Label>
        <Input id="cat-kw" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="склад, отгрузк, накладн" />
      </div>
      <Button type="submit" variant="primary" loading={create.isPending}>Создать</Button>
      <FieldError>{err}</FieldError>
    </form>
  );
}

function Users({ data }: { data: Overview }) {
  const save = useAdminMutation(({ id, ...body }: { id: string; role?: Role; isAvailable?: boolean; isActive?: boolean }) => api.patch(`/api/admin/users/${id}`, body));
  return (
    <div className="px-4 pt-6 sm:px-8">
      <dl className="mb-5 grid gap-3 text-meta sm:grid-cols-2 xl:grid-cols-4">
        {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
          <div key={r} className="border-l-2 border-line-strong pl-3">
            <dt className="font-medium text-ink">{ROLE_LABEL[r]}</dt>
            <dd className="text-ink-3">{ROLE_DESCRIPTION[r]}</dd>
          </div>
        ))}
      </dl>
      <div className="overflow-x-auto rounded-pop border border-line">
        <table className="w-full min-w-[820px] text-left text-meta">
          <thead className="bg-canvas/60">
            <tr className="text-micro uppercase tracking-[0.06em] text-ink-3">
              <th className="px-3 py-2 font-medium">Пользователь</th>
              <th className="px-3 py-2 font-medium">Подразделение</th>
              <th className="px-3 py-2 font-medium">Роль</th>
              <th className="px-3 py-2 text-right font-medium">Открытых</th>
              <th className="px-3 py-2 font-medium">
                <Tip content="Выключите на время отпуска — новые обращения уйдут резервному ответственному">
                  <span className="underline decoration-dotted underline-offset-2">На месте</span>
                </Tip>
              </th>
              <th className="px-3 py-2 font-medium">Активен</th>
            </tr>
          </thead>
          <tbody>
            {data.users.map((u) => (
              <tr key={u.id} className={cn("border-t border-line", !u.isActive && "opacity-55")}>
                <td className="px-3 py-2">
                  <span className="block text-ui text-ink">{u.name}</span>
                  <span className="block text-micro text-ink-3">
                    {u.title} · {u.email}
                  </span>
                </td>
                <td className="px-3 py-2 text-ink-2">
                  {u.department?.name ?? "—"}
                  {u.headOf && <span className="block text-micro text-ink-3">руководитель</span>}
                </td>
                <td className="px-3 py-2">
                  <select aria-label={`Роль ${u.name}`} className={cn(cellSelect, "w-40")} value={u.role} onChange={(e) => save.mutate({ id: u.id, role: e.target.value as Role })}>
                    {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="mono-num px-3 py-2 text-right text-ink-2">{u._count.assignedIssues}</td>
                <td className="px-3 py-2">
                  {u.role !== "EMPLOYEE" && <Switch checked={u.isAvailable} onChange={(v) => save.mutate({ id: u.id, isAvailable: v })} label={`${u.name} на месте`} />}
                </td>
                <td className="px-3 py-2">
                  <Switch checked={u.isActive} onChange={(v) => save.mutate({ id: u.id, isActive: v })} label={`${u.name} активен`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Sla({ data }: { data: Overview }) {
  return (
    <div className="max-w-[720px] px-4 pt-6 sm:px-8">
      <p className="mb-4 text-meta text-ink-2">
        Нормативы считаются в календарных часах от момента подачи. При смене приоритета сроки пересчитываются. Просроченные обращения эскалируются ответственному и
        руководителям направления.
      </p>
      <div className="divide-y divide-line rounded-pop border border-line">
        {PRIORITY_ORDER.map((p) => {
          const row = data.sla.find((s) => s.priority === p) ?? { priority: p, firstResponseHours: 48, resolutionDays: 14 };
          return <SlaRow key={p} row={row} />;
        })}
      </div>
    </div>
  );
}

function SlaRow({ row }: { row: Overview["sla"][number] }) {
  const [h, setH] = useState(String(row.firstResponseHours));
  const [d, setD] = useState(String(row.resolutionDays));
  const save = useAdminMutation(() => api.put("/api/admin/sla", { priority: row.priority, firstResponseHours: Number(h), resolutionDays: Number(d) }), "Норматив сохранён");
  const dirty = h !== String(row.firstResponseHours) || d !== String(row.resolutionDays);
  return (
    <form
      className="grid grid-cols-2 items-end gap-3 p-4 sm:grid-cols-[120px_1fr_1fr_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(undefined);
      }}
    >
      <div className="col-span-2 text-ui font-medium sm:col-span-1 sm:pb-2">{PRIORITY_LABEL[row.priority]}</div>
      <div>
        <Label htmlFor={`h-${row.priority}`}>Первая реакция, ч</Label>
        <Input id={`h-${row.priority}`} type="number" min={1} max={720} value={h} onChange={(e) => setH(e.target.value)} />
      </div>
      <div>
        <Label htmlFor={`d-${row.priority}`}>Решение, дней</Label>
        <Input id={`d-${row.priority}`} type="number" min={1} max={365} value={d} onChange={(e) => setD(e.target.value)} />
      </div>
      <Button type="submit" disabled={!dirty} loading={save.isPending}>
        Сохранить
      </Button>
    </form>
  );
}

interface AiStatus {
  keyConfigured: boolean;
  enabled: boolean;
  envDisabled: boolean;
  models: { fast: string; smart: string };
  budgetUsd: number;
  spentTodayUsd: number;
  userLimitPer10Min: number;
  circuitOpen: boolean;
  outcomesToday: Record<string, number>;
  featuresToday: { feature: string; calls: number; costUsd: number; inputTokens: number; outputTokens: number }[];
  recentProblems: { feature: string; reason: string | null; createdAt: string; outcome: string }[];
}

const FEATURE: Record<string, string> = { assist: "Помощник подачи", triage: "Разбор для ответственного", digest: "Сводка для руководства" };
const OUTCOME: Record<string, string> = { ai: "запросов к модели", cache: "из кэша", fallback: "локальный алгоритм", blocked: "заблокировано лимитом", error: "ошибок" };

function AiSettings() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["ai-status"], queryFn: () => api.get<AiStatus>("/api/admin/ai"), refetchInterval: 30_000 });
  const toggle = useMutation({
    mutationFn: (enabled: boolean) => api.patch<AiStatus>("/api/admin/ai", { enabled }),
    onSuccess: (d) => {
      qc.setQueryData(["ai-status"], d);
      toast.success(d.enabled ? "AI включён" : "AI выключен — работают локальные алгоритмы");
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (q.isLoading) return <div className="p-8"><Skeleton className="h-24 w-full" /></div>;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  const s = q.data!;
  const pct = Math.min(1, s.spentTodayUsd / Math.max(s.budgetUsd, 0.0001));
  return (
    <div className="max-w-[880px] space-y-8 px-4 pt-6 sm:px-8">
      <section className="flex flex-wrap items-start gap-6">
        <div className="min-w-0 flex-1">
          <h2 className="text-title-md font-semibold">Интеграция с Claude (Anthropic API)</h2>
          <p className="mt-1 text-meta text-ink-2">
            Ключ хранится только на сервере в переменной ANTHROPIC_API_KEY и не передаётся в браузер. Во внешнюю модель уходят тексты обращений без имён и контактов авторов;
            email и телефоны маскируются.
          </p>
          <dl className="mt-4 grid grid-cols-[180px_1fr] gap-y-2 text-meta">
            <dt className="text-ink-3">Ключ</dt>
            <dd className={s.keyConfigured ? "text-ok" : "text-warn"}>{s.keyConfigured ? "настроен" : "не задан — работают локальные алгоритмы"}</dd>
            <dt className="text-ink-3">Быстрые функции</dt>
            <dd className="font-mono text-ink">{s.models.fast} <span className="font-sans text-ink-3">— подача, разбор</span></dd>
            <dt className="text-ink-3">Аналитическая сводка</dt>
            <dd className="font-mono text-ink">{s.models.smart}</dd>
            <dt className="text-ink-3">Лимит на пользователя</dt>
            <dd className="text-ink">{s.userLimitPer10Min} запросов за 10 минут</dd>
            {s.circuitOpen && (
              <>
                <dt className="text-ink-3">Предохранитель</dt>
                <dd className="text-warn">после серии ошибок AI отключён на минуту</dd>
              </>
            )}
          </dl>
        </div>
        <div className="flex items-center gap-3 rounded-pop border border-line px-4 py-3">
          <Switch checked={s.enabled && !s.envDisabled} onChange={(v) => toggle.mutate(v)} label="AI включён" disabled={s.envDisabled} />
          <span className="text-ui">{s.envDisabled ? "Выключен в .env" : s.enabled ? "AI включён" : "AI выключен"}</span>
        </div>
      </section>

      <section>
        <h2 className="text-title-md font-semibold">Расходы сегодня</h2>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="mono-num text-[22px] text-ink">${s.spentTodayUsd.toFixed(4)}</span>
          <span className="text-meta text-ink-3">из дневного бюджета ${s.budgetUsd.toFixed(2)}</span>
        </div>
        <div className="mt-2 h-1.5 max-w-md overflow-hidden rounded-full bg-subtle" role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full" style={{ width: `${pct * 100}%`, background: pct > 0.85 ? "var(--danger)" : "var(--chart-1)" }} />
        </div>
        <p className="mt-2 text-micro text-ink-3">При исчерпании бюджета AI-функции автоматически переключаются на локальные алгоритмы до конца суток.</p>
        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-meta text-ink-2">
          {Object.entries(OUTCOME).map(([k, l]) => (
            <li key={k}>
              <span className="mono-num text-ink">{s.outcomesToday[k] ?? 0}</span> {l}
            </li>
          ))}
        </ul>
        {s.featuresToday.length > 0 && (
          <table className="mt-4 w-full max-w-xl text-left text-meta">
            <thead>
              <tr className="text-micro uppercase tracking-[0.06em] text-ink-3">
                <th className="py-1.5 font-medium">Функция</th>
                <th className="py-1.5 text-right font-medium">Вызовов</th>
                <th className="py-1.5 text-right font-medium">Токены вход/выход</th>
                <th className="py-1.5 text-right font-medium">$</th>
              </tr>
            </thead>
            <tbody>
              {s.featuresToday.map((f) => (
                <tr key={f.feature} className="border-t border-line">
                  <td className="py-1.5">{FEATURE[f.feature] ?? f.feature}</td>
                  <td className="mono-num py-1.5 text-right">{f.calls}</td>
                  <td className="mono-num py-1.5 text-right text-ink-2">
                    {f.inputTokens} / {f.outputTokens}
                  </td>
                  <td className="mono-num py-1.5 text-right">{f.costUsd.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {s.recentProblems.length > 0 && (
        <section>
          <h2 className="text-title-md font-semibold">Последние отказы и ошибки</h2>
          <ul className="mt-2 divide-y divide-line border-y border-line text-meta">
            {s.recentProblems.map((p, n) => (
              <li key={n} className="flex gap-3 py-2">
                <span className="w-36 shrink-0 text-ink-3">{fmtDateTime(p.createdAt)}</span>
                <span className="text-ink">{FEATURE[p.feature] ?? p.feature}</span>
                <span className="text-ink-2">{p.reason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors-fast disabled:opacity-50", checked ? "bg-ink" : "bg-subtle-2")}
    >
      <span className={cn("absolute left-0 top-0.5 size-4 rounded-full bg-surface shadow-sm transition-transform duration-150", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
    </button>
  );
}
