import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Единая точка вызова Claude в PULSE.
 *
 * Защита расходов и устойчивость:
 *  - ключ читается только на сервере (ANTHROPIC_API_KEY), в браузер не попадает;
 *  - кэш результатов по хэшу входа (AiCache) — повторный запрос не тратит токены;
 *  - дедупликация одновременных одинаковых запросов (in-flight map);
 *  - дневной бюджет в USD (AI_DAILY_BUDGET_USD) по журналу AiUsage;
 *  - лимит запросов на пользователя (AI_USER_LIMIT_PER_10MIN);
 *  - таймаут и не более 1 повтора;
 *  - «предохранитель»: после 3 ошибок подряд AI отключается на 60 секунд;
 *  - при любой проблеме — прозрачный fallback на локальные алгоритмы.
 */

export type AiSource = "ai" | "cache" | "fallback";

export interface AiResult<T> {
  data: T;
  source: AiSource;
  model: string | null;
  /** Почему использован fallback — показывается пользователю честно */
  notice?: string;
  generatedAt: string;
}

export const MODELS = {
  fast: process.env.AI_MODEL_FAST || "claude-haiku-5-5",
  smart: process.env.AI_MODEL_SMART || "claude-sonnet-5-5",
};

/** Цены за 1M токенов (USD), первая сторона Anthropic API */
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
};

export function estimateCost(model: string, inputTokens: number, outputTokens: number) {
  const p = PRICING[model] ?? { input: 4, output: 20 }; // неизвестная модель — считаем по верхней цене
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : d;
};

export const AI_LIMITS = {
  dailyBudgetUsd: () => num(process.env.AI_DAILY_BUDGET_USD, 1),
  userPer10Min: () => num(process.env.AI_USER_LIMIT_PER_10MIN, 20),
  timeoutMs: () => num(process.env.AI_TIMEOUT_MS, 20000),
};

let client: Anthropic | null = null;
export function hasApiKey() {
  return !!process.env.ANTHROPIC_API_KEY?.trim();
}
export function getClient() {
  if (!hasApiKey()) return null;
  if (!client) {
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      maxRetries: 1,
      timeout: AI_LIMITS.timeoutMs(),
    });
  }
  return client;
}

export async function aiEnabledSetting() {
  if (process.env.AI_ENABLED === "false") return false;
  const s = await db.setting.findUnique({ where: { key: "ai.enabled" } });
  return s ? s.value !== false : true;
}

// ── предохранитель ──
const breaker = { failures: 0, openUntil: 0 };
function breakerOpen() {
  return Date.now() < breaker.openUntil;
}
function recordFailure() {
  breaker.failures += 1;
  if (breaker.failures >= 3) {
    breaker.openUntil = Date.now() + 60_000;
    breaker.failures = 0;
  }
}
function recordSuccess() {
  breaker.failures = 0;
}

/** Только для тестов: сброс предохранителя и незавершённых запросов */
export function __resetAiRuntimeForTests() {
  breaker.failures = 0;
  breaker.openUntil = 0;
  inflight.clear();
}

const inflight = new Map<string, Promise<unknown>>();

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Расход за сегодня, включая резервы незавершённых запросов (зависшие резервы старше 10 минут не считаются) */
function budgetWhere(): Prisma.AiUsageWhereInput {
  return {
    createdAt: { gte: startOfToday() },
    OR: [{ outcome: { not: "pending" } }, { createdAt: { gte: new Date(Date.now() - 10 * 60_000) } }],
  };
}

export async function spentToday() {
  const agg = await db.aiUsage.aggregate({ _sum: { costUsd: true }, where: budgetWhere() });
  return agg._sum.costUsd ?? 0;
}

const AI_LOCK_ID = 724411;

/**
 * Атомарное резервирование бюджета и лимита пользователя. Под advisory-lock PostgreSQL
 * проверка и запись резерва выполняются как одна операция, поэтому параллельные
 * запросы (в т. ч. из нескольких экземпляров приложения) не превысят бюджет.
 * Резерв — верхняя оценка стоимости; после ответа заменяется фактической.
 */
async function reserve(feature: string, model: string, userId: string | null, estimateUsd: number) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AI_LOCK_ID})`;
    const agg = await tx.aiUsage.aggregate({ _sum: { costUsd: true }, where: budgetWhere() });
    if ((agg._sum.costUsd ?? 0) + estimateUsd > AI_LIMITS.dailyBudgetUsd()) return { blocked: "budget" as const };
    if (userId) {
      const recent = await tx.aiUsage.count({
        where: { userId, outcome: { in: ["ai", "error", "pending"] }, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } },
      });
      if (recent >= AI_LIMITS.userPer10Min()) return { blocked: "user_rate_limit" as const };
    }
    const row = await tx.aiUsage.create({ data: { feature, model, outcome: "pending", costUsd: estimateUsd, userId } });
    return { id: row.id };
  });
}

async function log(entry: {
  feature: string;
  model: string;
  outcome: "ai" | "cache" | "fallback" | "blocked" | "error";
  reason?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  latencyMs?: number;
  userId?: string | null;
}) {
  try {
    await db.aiUsage.create({ data: { ...entry, userId: entry.userId ?? null } });
  } catch (e) {
    console.error("[ai] не удалось записать журнал", e);
  }
}

export function hashInput(...parts: unknown[]) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

export interface CallOutput<T> {
  data: T;
  usage: { input_tokens: number; output_tokens: number };
}

function describeError(err: unknown): { reason: string; notice: string } {
  if (err instanceof Anthropic.AuthenticationError) return { reason: "auth", notice: "Ключ Anthropic недействителен — использован локальный алгоритм" };
  if (err instanceof Anthropic.PermissionDeniedError) return { reason: "permission", notice: "Нет доступа к модели — использован локальный алгоритм" };
  if (err instanceof Anthropic.RateLimitError) return { reason: "rate_limit_api", notice: "Anthropic API ограничил частоту запросов — использован локальный алгоритм" };
  if (err instanceof Anthropic.BadRequestError) return { reason: `bad_request: ${err.message.slice(0, 160)}`, notice: "AI не смог обработать запрос — использован локальный алгоритм" };
  if (err instanceof Anthropic.APIConnectionTimeoutError) return { reason: "timeout", notice: "AI не ответил вовремя — использован локальный алгоритм" };
  if (err instanceof Anthropic.APIConnectionError) return { reason: "connection", notice: "Нет соединения с AI — использован локальный алгоритм" };
  if (err instanceof Anthropic.InternalServerError) return { reason: `server_${err.status}`, notice: "AI временно недоступен — использован локальный алгоритм" };
  if (err instanceof Anthropic.APIError) return { reason: `api_${err.status}`, notice: "Ошибка AI — использован локальный алгоритм" };
  if (err instanceof AiRefusal) return { reason: "refusal", notice: "Модель отказалась обрабатывать текст — использован локальный алгоритм" };
  if (err instanceof AiInvalidOutput) return { reason: "invalid_output", notice: "AI вернул некорректный ответ — использован локальный алгоритм" };
  return { reason: "unknown", notice: "AI недоступен — использован локальный алгоритм" };
}

export class AiRefusal extends Error {}
export class AiInvalidOutput extends Error {}

/**
 * Одинаковые одновременные запросы объединяются ещё до первого обращения к БД,
 * поэтому двойной клик или параллельные вкладки не порождают два вызова модели.
 */
export function runAi<T>(opts: RunOpts<T>): Promise<AiResult<T>> {
  const key = hashInput(opts.feature, opts.model, opts.cacheInput);
  const existing = inflight.get(key) as Promise<AiResult<T>> | undefined;
  if (existing) return existing;
  const task = runAiInner(key, opts).finally(() => inflight.delete(key));
  inflight.set(key, task);
  return task;
}

type RunOpts<T> = {
  /** оценка для резерва бюджета: длина промпта в символах и лимит выходных токенов */
  estimate?: { promptChars: number; maxTokens: number };
  feature: string;
  model: string;
  userId: string | null;
  /** всё, что влияет на результат — для ключа кэша */
  cacheInput: unknown;
  cacheTtlHours: number;
  call: (client: Anthropic) => Promise<CallOutput<T>>;
  fallback: () => Promise<T> | T;
};

async function runAiInner<T>(key: string, opts: RunOpts<T>): Promise<AiResult<T>> {
  const now = new Date();

  const fallback = async (notice: string, outcome: "fallback" | "blocked", reason: string): Promise<AiResult<T>> => {
    await log({ feature: opts.feature, model: opts.model, outcome, reason, userId: opts.userId });
    return { data: await opts.fallback(), source: "fallback", model: null, notice, generatedAt: now.toISOString() };
  };

  const cached = await db.aiCache.findUnique({ where: { key } });
  if (cached && cached.expiresAt > now) {
    await log({ feature: opts.feature, model: cached.model, outcome: "cache", userId: opts.userId });
    return { data: cached.value as T, source: "cache", model: cached.model, generatedAt: cached.createdAt.toISOString() };
  }

  const anthropic = getClient();
  if (!anthropic) return fallback("AI не подключён (нет ANTHROPIC_API_KEY) — работает локальный алгоритм", "fallback", "no_key");
  if (!(await aiEnabledSetting())) return fallback("AI отключён администратором — работает локальный алгоритм", "fallback", "disabled");
  if (breakerOpen()) return fallback("AI временно недоступен после серии ошибок — локальный алгоритм", "blocked", "circuit_open");

  // Верхняя оценка: кириллица ≈ 2 символа на токен, выход — весь лимит max_tokens
  const est = opts.estimate ?? { promptChars: 8000, maxTokens: 4000 };
  const estimateUsd = estimateCost(opts.model, Math.ceil(est.promptChars / 2) + 600, est.maxTokens);
  const reservation = await reserve(opts.feature, opts.model, opts.userId, estimateUsd);
  if ("blocked" in reservation) {
    return reservation.blocked === "budget"
      ? fallback("Дневной бюджет AI исчерпан — работает локальный алгоритм", "blocked", "budget")
      : fallback("Слишком много AI-запросов за 10 минут — временно работает локальный алгоритм", "blocked", "user_rate_limit");
  }

  {
    const started = Date.now();
    try {
      const out = await opts.call(anthropic);
      const latencyMs = Date.now() - started;
      const costUsd = estimateCost(opts.model, out.usage.input_tokens, out.usage.output_tokens);
      recordSuccess();
      await db.aiUsage.update({
        where: { id: reservation.id },
        data: { outcome: "ai", inputTokens: out.usage.input_tokens, outputTokens: out.usage.output_tokens, costUsd, latencyMs },
      });
      await db.aiCache.upsert({
        where: { key },
        create: {
          key,
          feature: opts.feature,
          model: opts.model,
          value: out.data as Prisma.InputJsonValue,
          expiresAt: new Date(Date.now() + opts.cacheTtlHours * 3600_000),
        },
        update: {
          value: out.data as Prisma.InputJsonValue,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + opts.cacheTtlHours * 3600_000),
        },
      });
      return { data: out.data, source: "ai", model: opts.model, generatedAt: new Date().toISOString() };
    } catch (err) {
      const { reason, notice } = describeError(err);
      if (!(err instanceof AiRefusal) && !(err instanceof Anthropic.BadRequestError)) recordFailure();
      console.warn(`[ai] ${opts.feature}: ${reason}`);
      await db.aiUsage.update({ where: { id: reservation.id }, data: { outcome: "error", reason, costUsd: 0, latencyMs: Date.now() - started } });
      return { data: await opts.fallback(), source: "fallback", model: null, notice, generatedAt: new Date().toISOString() };
    }
  }
}

/** Состояние AI для админки (без раскрытия ключа) */
export async function aiStatus() {
  const since = startOfToday();
  const [spent, byOutcome, byFeature, recentErrors, enabled] = await Promise.all([
    spentToday(),
    db.aiUsage.groupBy({ by: ["outcome"], _count: { _all: true }, where: { createdAt: { gte: since } } }),
    db.aiUsage.groupBy({
      by: ["feature"],
      _count: { _all: true },
      _sum: { costUsd: true, inputTokens: true, outputTokens: true },
      where: { createdAt: { gte: since } },
    }),
    db.aiUsage.findMany({
      where: { outcome: { in: ["error", "blocked"] } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { feature: true, reason: true, createdAt: true, outcome: true },
    }),
    aiEnabledSetting(),
  ]);
  return {
    keyConfigured: hasApiKey(),
    enabled,
    envDisabled: process.env.AI_ENABLED === "false",
    models: MODELS,
    budgetUsd: AI_LIMITS.dailyBudgetUsd(),
    spentTodayUsd: spent,
    userLimitPer10Min: AI_LIMITS.userPer10Min(),
    circuitOpen: breakerOpen(),
    outcomesToday: Object.fromEntries(byOutcome.map((o) => [o.outcome, o._count._all])),
    featuresToday: byFeature.map((f) => ({
      feature: f.feature,
      calls: f._count._all,
      costUsd: f._sum.costUsd ?? 0,
      inputTokens: f._sum.inputTokens ?? 0,
      outputTokens: f._sum.outputTokens ?? 0,
    })),
    recentProblems: recentErrors.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
  };
}
