import { describe, expect, it } from "vitest";
import { bitrixConfig, formatBitrixMessage, maskWebhook, postBitrixMessage, shareableProblems } from "@/lib/integrations/bitrix24";

const HOOK = "https://pulse-demo.bitrix24.ru/rest/1/abcdef1234567890/";

describe("Битрикс24: конфигурация", () => {
  it("без настроек — выключено, без ошибки", () => {
    expect(bitrixConfig({} as NodeJS.ProcessEnv)).toMatchObject({ enabled: false, problem: "Не настроено" });
  });
  it("корректные настройки включают интеграцию", () => {
    const c = bitrixConfig({ BITRIX24_WEBHOOK_URL: HOOK, BITRIX24_DIALOG_ID: "chat42", PULSE_PUBLIC_URL: "https://pulse.example.ru/" } as unknown as NodeJS.ProcessEnv);
    expect(c).toMatchObject({ enabled: true, dialogId: "chat42", publicUrl: "https://pulse.example.ru" });
  });
  it("отклоняет http, чужой формат адреса и неверный ID чата; выключатель окружения сильнее настроек", () => {
    const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;
    expect(bitrixConfig(env({ BITRIX24_WEBHOOK_URL: HOOK.replace("https", "http"), BITRIX24_DIALOG_ID: "chat1" })).enabled).toBe(false);
    expect(bitrixConfig(env({ BITRIX24_WEBHOOK_URL: "https://evil.example/hook", BITRIX24_DIALOG_ID: "chat1" })).enabled).toBe(false);
    expect(bitrixConfig(env({ BITRIX24_WEBHOOK_URL: HOOK, BITRIX24_DIALOG_ID: "общий чат" })).problem).toMatch(/chat123/);
    expect(bitrixConfig(env({ BITRIX24_WEBHOOK_URL: HOOK, BITRIX24_DIALOG_ID: "chat1", BITRIX24_ENABLED: "false" })).enabled).toBe(false);
  });
  it("секрет вебхука маскируется", () => {
    expect(maskWebhook(HOOK)).toBe("https://pulse-demo.bitrix24.ru/rest/1/ab…90/");
    expect(maskWebhook(HOOK)).not.toContain("cdef12345678");
  });
});

describe("Битрикс24: текст сообщений", () => {
  const base = { code: "A-021", title: "Не видно этап согласования", isPrivate: false };
  it("новое обращение: код, тип, категория, ответственный, резервный и ссылка", () => {
    const m = formatBitrixMessage({ kind: "created", ...base, type: "PROBLEM", category: "Документооборот", assignee: "Анна Ковалёва", backup: true }, "https://pulse.example.ru");
    expect(m).toContain("[B]A-021 · Проблема[/B]");
    expect(m).toContain("ответственный: Анна Ковалёва (резервный");
    expect(m).toContain("[URL=https://pulse.example.ru/issues/A-021]Открыть в PULSE[/URL]");
  });
  it("без публичного адреса — без ссылки", () => {
    expect(formatBitrixMessage({ kind: "assigned", ...base, to: "Роман Козлов" }, null)).not.toContain("[URL");
  });
  it("конфиденциальное обращение: ни заголовка, ни текста решения", () => {
    const m = formatBitrixMessage({ kind: "decision", ...base, isPrivate: true, status: "REJECTED", text: "Секретная причина отказа", by: "Андрей Соколов" }, null);
    expect(m).not.toContain("Не видно этап");
    expect(m).not.toContain("Секретная причина");
    expect(m).toContain("конфиденциальное обращение");
  });
  it("BB-коды из текста пользователя не становятся разметкой", () => {
    const m = formatBitrixMessage({ kind: "escalated", ...base, title: "Ок [URL=https://evil]клик[/URL] [USER=all]", note: "Просрочен срок решения", assignee: null }, null);
    expect(m).not.toMatch(/\[URL=https:\/\/evil|\[USER/i);
    expect(m).toContain("⟦URL=https://evil⟧");
    expect(m).toContain("просрочен срок решения");
  });
  it("регрессия: вложенные теги не собираются в ссылку после очистки", () => {
    for (const title of ["[[b]URL=https://evil.example/login]Срочно войдите[/[b]URL]", "[[i]USER=1]x[/[i]USER]", "[[u]SEND=/do]кнопка[/[u]SEND]", "[QUOTE]x[/QUOTE] [ATTACH=1]"]) {
      const m = formatBitrixMessage({ kind: "created", ...base, title, type: "PROBLEM", category: "Кат [B]x[/B]", assignee: "Имя [USER=5]", backup: false }, null);
      // единственные теги в сообщении — служебные [B]…[/B] заголовка
      expect(m.match(/\[[^\]]*\]/g)).toEqual(["[B]", "[/B]"]);
    }
  });
  it("нестандартный адрес вебхука маскируется целиком", () => {
    expect(maskWebhook("https://portal.bitrix24.ru/rest/secretcode/")).toBe("https://portal.bitrix24.ru/…");
    expect(maskWebhook("not a url secret")).toBe("…");
  });
});

describe("Битрикс24: отправка", () => {
  const target = { webhook: HOOK, dialogId: "chat42" };
  const json = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })) as unknown as typeof fetch;

  it("успех: im.message.add с DIALOG_ID и MESSAGE, без превью ссылок", async () => {
    let url = "";
    let sent: Record<string, string> = {};
    const f = (async (u: string, init: RequestInit) => {
      url = u;
      sent = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ result: 777 }), { status: 200 });
    }) as unknown as typeof fetch;
    const r = await postBitrixMessage(target, "Привет", f);
    expect(r).toEqual({ ok: true, messageId: 777 });
    expect(url).toBe("https://pulse-demo.bitrix24.ru/rest/1/abcdef1234567890/im.message.add.json");
    expect(sent).toEqual({ DIALOG_ID: "chat42", MESSAGE: "Привет", URL_PREVIEW: "N" });
  });
  it("неверный вебхук — понятная причина, без повтора", async () => {
    const r = await postBitrixMessage(target, "x", json(401, { error: "INVALID_CREDENTIALS", error_description: "Invalid request credentials" }));
    expect(r).toEqual({ ok: false, reason: "Вебхук не найден или отключён — проверьте адрес", retryable: false });
  });
  it("лимит запросов и 5xx — повторяемые ошибки", async () => {
    expect(await postBitrixMessage(target, "x", json(503, { error: "QUERY_LIMIT_EXCEEDED" }))).toMatchObject({ ok: false, retryable: true });
    expect(await postBitrixMessage(target, "x", json(500, {}))).toMatchObject({ ok: false, retryable: true });
  });
  it("нет сети — повторяемая ошибка", async () => {
    const r = await postBitrixMessage(target, "x", (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch);
    expect(r).toMatchObject({ ok: false, reason: "Нет соединения с Битрикс24", retryable: true });
  });
});

describe("Битрикс24: системное решение и сводка", () => {
  it("тема — одно сообщение с кодами, владельцем и числом уведомлённых; BB-коды из текста вырезаются", () => {
    const m = formatBitrixMessage(
      { kind: "theme", title: "Прозрачность [B]статусов[/B]", status: "IMPLEMENTED", text: "Лента этапов [URL=http://evil]тут[/URL] во всех заявках", codes: ["A-002", "A-005", "A-011"], owner: "Олег Петров", by: "Андрей Соколов", notified: 9 },
      "https://pulse.example.ru",
    );
    expect(m).toContain("[B]Системное решение · реализовано[/B]");
    expect(m).toContain("«Прозрачность ⟦B⟧статусов⟦/B⟧» — 3 обращения: A-002, A-005, A-011");
    expect(m).toContain("Владелец темы: Олег Петров · решение: Андрей Соколов · уведомлено сотрудников: 9");
    expect(m).toContain("[URL=https://pulse.example.ru/issues/A-002]");
    expect(m).not.toContain("[URL=http://evil");
  });
  it("тема с конфиденциальными обращениями: их коды не перечисляются, ссылка на публичное", () => {
    const m = formatBitrixMessage(
      { kind: "theme", title: "Сроки", status: "IN_PROGRESS", text: "План решения по теме", codes: ["A-011"], hidden: 2, owner: null, by: "Андрей Соколов", notified: 3 },
      "https://pulse.example.ru",
    );
    expect(m).toContain("3 обращения: A-011 и ещё 2 конфиденциальных");
    expect(m).toContain("[URL=https://pulse.example.ru/issues/A-011]");
  });
  it("сводка — заголовок, топ-3 проблем с рекомендациями и ссылка на аналитику, не длиннее 2000", () => {
    const problems = Array.from({ length: 5 }, (_, i) => ({ title: `Проблема ${i + 1}`, codes: ["A-002", "A-005"], impact: "high" as const, recommendation: "Назначить владельца ".repeat(30) }));
    const m = formatBitrixMessage({ kind: "digest", headline: "Главное за период", issuesCount: 20, problems, quickWins: 3, risks: 2, by: "Андрей Соколов" }, "https://pulse.example.ru");
    expect(m).toContain("[B]Сводка для руководства[/B] · по 20 обращениям");
    expect(m).toContain("1. Проблема 1 — A-002, A-005 (высокое влияние)");
    expect(m).toContain("3. Проблема 3");
    expect(m).not.toContain("Проблема 4");
    expect(m).toContain("Быстрых улучшений: 3 · рисков: 2");
    expect(m).toContain("[URL=https://pulse.example.ru/analytics]");
    expect(m.length).toBeLessThanOrEqual(2000);
  });
});

describe("Битрикс24: сводка без конфиденциальных обращений", () => {
  it("проблема с любым конфиденциальным обращением не уходит: её заголовок мог пересказать его", () => {
    const r = shareableProblems(
      [
        { title: "Публичная", issueCodes: ["A-002", "A-011"], impact: "high", recommendation: "x" },
        { title: "Смешанная", issueCodes: ["A-002", "A-020"], impact: "high", recommendation: "z" },
        { title: "Только конфиденциальные", issueCodes: ["A-020"], impact: "medium", recommendation: "y" },
      ],
      new Set(["A-020"]),
    );
    expect(r).toEqual([{ title: "Публичная", codes: ["A-002", "A-011"], impact: "high", recommendation: "x" }]);
  });
});
