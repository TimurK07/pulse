import "server-only";
import { STATUS_LABEL, TYPE_LABEL, type IssueStatus, type IssueType } from "@/lib/domain";

/**
 * Интеграция с Битрикс24: уведомления о ключевых событиях PULSE в групповой чат
 * через входящий вебхук (метод im.message.add, право «im»).
 *
 *  - Включается переменными BITRIX24_WEBHOOK_URL и BITRIX24_DIALOG_ID; без них — выключена.
 *  - Никогда не блокирует и не ломает работу PULSE: отправка в фоне, ошибки только в статусе.
 *  - Сообщения уходят по одному (у портала лимит ~2 запроса/с), таймаут 5 с, один повтор.
 *  - Конфиденциальность: имена авторов не передаются никогда; у конфиденциальных
 *    обращений вместо заголовка и текста решения — только код и ссылка.
 *  - Адрес вебхука содержит секрет: он не выводится в интерфейс и журналы целиком.
 */

export type BitrixEvent =
  | { kind: "created"; code: string; title: string; type: IssueType; category: string; assignee: string | null; backup: boolean; isPrivate: boolean }
  | { kind: "assigned"; code: string; title: string; to: string | null; isPrivate: boolean }
  | { kind: "escalated"; code: string; title: string; note: string; assignee: string | null; isPrivate: boolean }
  | { kind: "decision"; code: string; title: string; status: IssueStatus; text: string; by: string; isPrivate: boolean }
  | { kind: "info_answered"; code: string; title: string; assignee: string | null; isPrivate: boolean }
  | { kind: "test" };

export interface BitrixConfig {
  enabled: boolean;
  /** почему выключено или почему конфигурация неверна */
  problem: string | null;
  webhookMasked: string | null;
  dialogId: string | null;
  publicUrl: string | null;
}

const TIMEOUT_MS = 5000;
const MAX_LEN = 2000;

export function bitrixConfig(env: NodeJS.ProcessEnv = process.env): BitrixConfig {
  const webhook = env.BITRIX24_WEBHOOK_URL?.trim() || "";
  const dialogId = env.BITRIX24_DIALOG_ID?.trim() || "";
  const publicUrl = env.PULSE_PUBLIC_URL?.trim().replace(/\/+$/, "") || null;
  const base = { webhookMasked: webhook ? maskWebhook(webhook) : null, dialogId: dialogId || null, publicUrl };
  if (env.BITRIX24_ENABLED === "false") return { enabled: false, problem: "Выключено в настройках окружения", ...base };
  if (!webhook && !dialogId) return { enabled: false, problem: "Не настроено", ...base };
  if (!/^https:\/\/[^/\s]+\/rest\/\d+\/[^/\s]+\/?$/.test(webhook)) {
    return { enabled: false, problem: "Адрес вебхука должен иметь вид https://<портал>/rest/<id>/<код>/", ...base };
  }
  if (!/^(chat|sg)?\d+$/.test(dialogId)) return { enabled: false, problem: "ID чата должен иметь вид chat123 или sg123", ...base };
  return { enabled: true, problem: null, ...base };
}

/** https://portal.bitrix24.ru/rest/1/abcdef123456/ → https://portal.bitrix24.ru/rest/1/ab…56/ */
export function maskWebhook(url: string) {
  return url.replace(/(\/rest\/\d+\/)([^/]+)/, (_m, p: string, code: string) => `${p}${code.length > 4 ? `${code.slice(0, 2)}…${code.slice(-2)}` : "…"}`);
}

/** Текст BB-кода Битрикс24 не должен ломаться пользовательским текстом */
function clean(s: string, max = 300) {
  const t = s.replace(/\[(\/?)(b|i|u|s|url|user|chat|send|put|call|img|icon|code|size|color|br)[^\]]*\]/gi, "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function formatBitrixMessage(e: BitrixEvent, publicUrl: string | null): string {
  if (e.kind === "test") {
    return "[B]PULSE подключён к Битрикс24[/B]\nСюда будут приходить новые обращения, переназначения, просрочки и принятые решения.";
  }
  const title = e.isPrivate ? "конфиденциальное обращение" : clean(e.title, 160);
  const link = publicUrl ? `\n[URL=${publicUrl}/issues/${e.code}]Открыть в PULSE[/URL]` : "";
  let head: string;
  let body: string;
  switch (e.kind) {
    case "created":
      head = `${e.code} · ${TYPE_LABEL[e.type]}`;
      body = `${title}\nКатегория: ${clean(e.category, 80)} · ответственный: ${e.assignee ?? "не назначен"}${e.backup ? " (резервный — основной отсутствует)" : ""}`;
      break;
    case "assigned":
      head = `${e.code} · переназначено`;
      body = `${title}\nНовый ответственный: ${e.to ?? "не назначен"}`;
      break;
    case "escalated":
      head = `${e.code} · ${e.note.toLowerCase()}`;
      body = `${title}\nОтветственный: ${e.assignee ?? "не назначен"}`;
      break;
    case "decision":
      head = `${e.code} · ${STATUS_LABEL[e.status].toLowerCase()}`;
      body = e.isPrivate ? `${title}\nРешение: ${e.by}` : `${title}\n${clean(e.text, 300)}\nРешение: ${e.by}`;
      break;
    case "info_answered":
      head = `${e.code} · автор ответил на уточнение`;
      body = `${title}\nОтветственный: ${e.assignee ?? "не назначен"}`;
      break;
  }
  const msg = `[B]${head}[/B]\n${body}${link}`;
  return msg.length > MAX_LEN ? `${msg.slice(0, MAX_LEN - 1)}…` : msg;
}

// ───────── отправка ─────────

export type SendResult = { ok: true; messageId: number } | { ok: false; reason: string; retryable: boolean };

const ERRORS: Record<string, string> = {
  INVALID_CREDENTIALS: "Вебхук не найден или отключён — проверьте адрес",
  NO_AUTH_FOUND: "В адресе вебхука нет кода доступа",
  insufficient_scope: "У вебхука нет права «im» (Чат и уведомления)",
  ACCESS_DENIED: "REST API недоступен на тарифе портала",
  ERROR_METHOD_NOT_FOUND: "Метод недоступен: у вебхука нет права «im»",
  CHAT_ID: "Чат не найден — проверьте BITRIX24_DIALOG_ID",
  ACCESS_ERROR: "Владелец вебхука не может писать в этот чат",
  PORTAL_DELETED: "Портал удалён",
  QUERY_LIMIT_EXCEEDED: "Превышен лимит запросов портала",
  OPERATION_TIME_LIMIT: "Превышен лимит времени операций портала",
};

export async function postBitrixMessage(cfg: { webhook: string; dialogId: string }, message: string, fetchImpl: typeof fetch = fetch): Promise<SendResult> {
  const url = `${cfg.webhook.replace(/\/+$/, "")}/im.message.add.json`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ DIALOG_ID: cfg.dialogId, MESSAGE: message, URL_PREVIEW: "N" }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const timeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return { ok: false, reason: timeout ? "Битрикс24 не ответил за 5 секунд" : "Нет соединения с Битрикс24", retryable: true };
  }
  let body: { result?: unknown; error?: string; error_description?: string } = {};
  try {
    body = await res.json();
  } catch {
    /* не JSON — разберём по статусу */
  }
  if (res.ok && typeof body.result === "number") return { ok: true, messageId: body.result };
  const code = body.error ?? "";
  const retryable = res.status >= 500 || res.status === 429 || code === "QUERY_LIMIT_EXCEEDED";
  return { ok: false, reason: ERRORS[code] ?? `Ошибка Битрикс24 (${res.status}${code ? `, ${code}` : ""})`, retryable };
}

// ───────── фоновая очередь и статус ─────────

const status = { sent: 0, failed: 0, lastSuccessAt: null as string | null, lastError: null as { at: string; reason: string } | null };
let queue: Promise<unknown> = Promise.resolve();

async function deliver(message: string): Promise<SendResult> {
  const cfg = bitrixConfig();
  if (!cfg.enabled) return { ok: false, reason: cfg.problem ?? "Не настроено", retryable: false };
  const target = { webhook: process.env.BITRIX24_WEBHOOK_URL!.trim(), dialogId: cfg.dialogId! };
  let r = await postBitrixMessage(target, message);
  if (!r.ok && r.retryable) {
    await new Promise((ok) => setTimeout(ok, 1200));
    r = await postBitrixMessage(target, message);
  }
  if (r.ok) {
    status.sent++;
    status.lastSuccessAt = new Date().toISOString();
  } else {
    status.failed++;
    status.lastError = { at: new Date().toISOString(), reason: r.reason };
    console.warn(`[bitrix24] ${r.reason}`);
  }
  return r;
}

/** Фоновая отправка события. Никогда не бросает и не задерживает ответ пользователю. */
export function notifyBitrix(e: BitrixEvent) {
  const cfg = bitrixConfig();
  if (!cfg.enabled) return;
  const message = formatBitrixMessage(e, cfg.publicUrl);
  queue = queue.then(() => deliver(message)).catch(() => undefined);
}

/** Тестовое сообщение из настроек: ждём результат, чтобы показать его администратору */
export function sendBitrixTest(): Promise<SendResult> {
  const cfg = bitrixConfig();
  const message = formatBitrixMessage({ kind: "test" }, cfg.publicUrl);
  const run = queue.then(() => deliver(message));
  queue = run.catch(() => undefined);
  return run;
}

export function bitrixStatus() {
  const cfg = bitrixConfig();
  return { ...cfg, ...status };
}

/** Только для тестов */
export function __resetBitrixForTests() {
  status.sent = 0;
  status.failed = 0;
  status.lastSuccessAt = null;
  status.lastError = null;
  queue = Promise.resolve();
}

/** Дождаться отправки уже поставленных в очередь сообщений (тесты) */
export function __flushBitrixQueue() {
  return queue;
}
