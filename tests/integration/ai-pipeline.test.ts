/**
 * Проверка AI-конвейера без реальных запросов: локальный HTTP-сервер имитирует
 * Anthropic Messages API (ANTHROPIC_BASE_URL). Проверяются: разбор структурированного
 * ответа через официальный SDK, учёт токенов и стоимости, кэш, fallback при ошибке
 * сервера и при отказе модели, блокировка по бюджету.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import http from "node:http";
import { db } from "@/lib/db";
import { assistDraft, generateDigest, triageIssue } from "@/lib/ai/features";
import type { CurrentUser } from "@/lib/auth/current-user";
import { __resetAiRuntimeForTests } from "@/lib/ai/runtime";

type Mode = "ok" | "500" | "refusal" | "badjson" | "incomplete" | "slow";
let mode: Mode = "ok";
let delayMs = 0;
let calls = 0;
let lastBody: { model: string; output_config?: unknown; messages: { content: string }[] } | null = null;

function reply(body: typeof lastBody) {
  const prompt = body!.messages[0].content;
  let json: unknown;
  if (prompt.includes("Новое обращение сотрудника")) {
    json = {
      type: "PROBLEM",
      category: "Документооборот",
      priority: "MEDIUM",
      suggestedTitle: "Не видно этап согласования документов",
      summary: "Сотрудники не видят, на каком этапе пакет документов.",
      reasoning: "Речь о движении документов между подразделениями.",
      confidence: "high",
      similar: [{ code: "A-005", relation: "duplicate", reason: "Та же проблема со статусом пакета" }],
    };
  } else if (prompt.includes("Подготовь разбор обращения")) {
    json = {
      summary: "Повторный ввод данных отнимает время.",
      keyPoints: ["Ввод одних данных в разных системах"],
      suggestedNextStep: "Собрать примеры операций",
      suggestedPriority: "HIGH",
      priorityReason: "Регулярные потери времени",
      clarifyingQuestion: null,
      suggestedCategory: "Интеграции и IT",
      categoryReason: "Речь о рабочих системах",
    };
  } else {
    json = {
      headline: "Главная проблема — прозрачность статусов",
      overview: "Тестовая сводка.",
      systemicProblems: [{ title: "Статусы", description: "…", issueCodes: ["A-002", "A-005", "A-999"], impact: "high", recommendation: "Назначить владельца" }],
      quickWins: [],
      risks: [],
      positiveSignals: [],
    };
  }
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: body!.model,
    content: [{ type: "text", text: JSON.stringify(json) }],
    stop_reason: mode === "refusal" ? "refusal" : "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 1000, output_tokens: 200 },
  };
}

const server = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", async () => {
    calls++;
    lastBody = JSON.parse(raw);
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    if (mode === "slow") await new Promise((r) => setTimeout(r, 4000));
    if (mode === "badjson" || mode === "incomplete") {
      const text = mode === "badjson" ? "Конечно! Вот ответ: категория — документооборот" : JSON.stringify({ type: "PROBLEM" });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "m", type: "message", role: "assistant", model: lastBody!.model, content: [{ type: "text", text }], stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 10, output_tokens: 5 } }));
      return;
    }
    if (mode === "500") {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ type: "error", error: { type: "api_error", message: "boom" } }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(reply(lastBody)));
  });
});

let user: CurrentUser;

beforeAll(async () => {
  await new Promise<void>((r) => server.listen(4599, "127.0.0.1", r));
  const u = await db.user.findUniqueOrThrow({
    where: { email: "manager@pulse.demo" },
    select: { id: true, name: true, email: true, title: true, role: true, departmentId: true, isActive: true, department: { select: { id: true, name: true } }, headOf: { select: { id: true } } },
  });
  user = u;
});
afterAll(async () => {
  server.close();
  await db.$disconnect();
});
beforeEach(async () => {
  mode = "ok";
  delayMs = 0;
  calls = 0;
  process.env.ANTHROPIC_API_KEY = "test-key-not-real";
  __resetAiRuntimeForTests();
  await db.aiCache.deleteMany();
  await db.aiUsage.deleteMany();
  await db.setting.deleteMany();
});

const draft = { title: "Где мой пакет документов", description: "Непонятно, на каком этапе согласования находится пакет документов и кто ответственный." };

describe("AI-конвейер (имитация Anthropic API)", () => {
  it("классифицирует обращение, оценивает похожие и рекомендует маршрут", async () => {
    const r = await assistDraft(user, { ...draft, type: "PROBLEM" });
    expect(r.source).toBe("ai");
    expect(r.model).toBe("claude-haiku-5-5");
    expect(r.data.categoryName).toBe("Документооборот");
    expect(r.data.similar[0]?.code).toBe("A-005");
    expect(r.route?.assigneeName).toBe("Татьяна Морозова");
    expect(lastBody?.model).toBe("claude-haiku-5-5");
    expect(JSON.stringify(lastBody?.output_config)).toContain("json_schema");
    const usage = await db.aiUsage.findFirstOrThrow({ where: { outcome: "ai" } });
    expect(usage.inputTokens).toBe(1000);
    expect(usage.costUsd).toBeCloseTo((1000 * 0.1 + 200 * 0.5) / 1e6, 10);
  });

  it("повторный запрос берётся из кэша без обращения к API", async () => {
    await assistDraft(user, draft);
    const before = calls;
    const r = await assistDraft(user, draft);
    expect(r.source).toBe("cache");
    expect(calls).toBe(before);
  });

  it("ошибка сервера → локальный алгоритм с честным пояснением", async () => {
    mode = "500";
    const r = await assistDraft(user, draft);
    expect(r.source).toBe("fallback");
    expect(r.notice).toMatch(/локальный алгоритм/);
    expect(r.data.similar.length).toBeGreaterThan(0); // кандидаты от TF-IDF
    expect(await db.aiUsage.count({ where: { outcome: "error" } })).toBe(1);
  });

  it("отказ модели (stop_reason=refusal) → fallback", async () => {
    mode = "refusal";
    const r = await triageIssue(user, "A-007", { generate: true });
    expect(r?.source).toBe("fallback");
    expect(r?.notice).toMatch(/отказалась/);
  });

  it("разбор для ответственного сохраняется в обращении", async () => {
    const r = await triageIssue(user, "A-007", { generate: true });
    expect(r?.source).toBe("ai");
    const cached = await triageIssue(user, "A-007", { generate: false });
    expect(cached?.data.suggestedNextStep).toBe("Собрать примеры операций");
  });

  it("сводка для руководства: Sonnet, коды обращений проверяются по базе", async () => {
    const r = await generateDigest(user);
    expect(lastBody?.model).toBe("claude-sonnet-5-5");
    const content = r!.digest.content as { systemicProblems: { issueCodes: string[] }[] };
    expect(content.systemicProblems[0].issueCodes).toEqual(["A-002", "A-005"]); // выдуманный A-999 отброшен
    expect(r!.digest.source).toBe("ai");
  });

  it("исчерпан дневной бюджет → запрос не отправляется", async () => {
    await db.aiUsage.create({ data: { feature: "assist", model: "claude-haiku-5-5", outcome: "ai", costUsd: 5 } });
    const r = await assistDraft(user, { ...draft, title: "другое" });
    expect(r.source).toBe("fallback");
    expect(r.notice).toMatch(/бюджет/);
    expect(calls).toBe(0);
  });

  it("ответ модели не JSON → локальный алгоритм, не ошибка пользователю", async () => {
    mode = "badjson";
    const r = await assistDraft(user, { ...draft, title: "битый ответ" });
    expect(r.source).toBe("fallback");
    expect(r.data.categoryName).not.toBeUndefined();
  });

  it("неполный ответ (нарушает схему) → fallback", async () => {
    mode = "incomplete";
    const r = await triageIssue(user, "A-012", { generate: true });
    expect(r?.source).toBe("fallback");
  });

  it("таймаут модели → fallback с пояснением", async () => {
    mode = "slow";
    const r = await assistDraft(user, { ...draft, title: "медленный ответ" });
    expect(r.source).toBe("fallback");
    expect(r.notice).toMatch(/вовремя|недоступен|соединения/);
  }, 20_000);

  it("нет ключа → без обращения к сети", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const r = await assistDraft(user, { ...draft, title: "без ключа" });
    expect(r.source).toBe("fallback");
    expect(r.notice).toMatch(/ANTHROPIC_API_KEY/);
    expect(calls).toBe(0);
  });

  it("одинаковые одновременные запросы → один вызов модели", async () => {
    delayMs = 300;
    const rs = await Promise.all(Array.from({ length: 5 }, () => assistDraft(user, { ...draft, title: "двойной клик" })));
    expect(calls).toBe(1);
    expect(rs.every((r) => r.source === "ai")).toBe(true);
  });

  it("бюджет соблюдается при параллельных запросах", async () => {
    delayMs = 200;
    // оставляем запас примерно на два резерва помощника подачи
    await db.aiUsage.create({ data: { feature: "assist", model: "claude-haiku-5-5", outcome: "ai", costUsd: 0.995 } });
    const rs = await Promise.all(Array.from({ length: 8 }, (_, n) => assistDraft(user, { ...draft, title: `параллельный ${n}` })));
    const viaAi = rs.filter((r) => r.source === "ai").length;
    expect(viaAi).toBeGreaterThanOrEqual(1);
    expect(viaAi).toBeLessThanOrEqual(2);
    expect(calls).toBe(viaAi);
    const spent = await db.aiUsage.aggregate({ _sum: { costUsd: true } });
    expect(spent._sum.costUsd!).toBeLessThanOrEqual(1);
  });

  it("лимит запросов пользователя", async () => {
    await db.aiUsage.createMany({ data: Array.from({ length: 50 }, () => ({ feature: "assist", model: "claude-haiku-5-5", outcome: "ai", costUsd: 0, userId: user.id })) });
    const r = await assistDraft(user, { ...draft, title: "лимит" });
    expect(r.source).toBe("fallback");
    expect(r.notice).toMatch(/10 минут/);
    expect(calls).toBe(0);
  });

  it("AI ничего не меняет в обращении сам", async () => {
    const before = await db.issue.findUniqueOrThrow({ where: { code: "A-007" } });
    await triageIssue(user, "A-007", { generate: true }); // модель предлагает другой приоритет
    const after = await db.issue.findUniqueOrThrow({ where: { code: "A-007" } });
    expect([after.priority, after.categoryId, after.status, after.assigneeId]).toEqual([before.priority, before.categoryId, before.status, before.assigneeId]);
  });

  it("предохранитель: после 3 сбоев подряд запросы к API временно не отправляются", async () => {
    mode = "500";
    for (let n = 0; n < 3; n++) await assistDraft(user, { ...draft, title: `сбой ${n}` });
    const before = calls;
    mode = "ok";
    const r = await assistDraft(user, { ...draft, title: "после сбоев" });
    expect(r.source).toBe("fallback");
    expect(r.notice).toMatch(/серии ошибок/);
    expect(calls).toBe(before);
  });

  it("администратор выключил AI → запросов нет", async () => {
    await db.setting.create({ data: { key: "ai.enabled", value: false } });
    const r = await assistDraft(user, { ...draft, title: "третье" });
    expect(r.source).toBe("fallback");
    expect(calls).toBe(0);
  });
});
