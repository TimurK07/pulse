/**
 * Битрикс24 в связке с сервисами PULSE на тестовой БД. Сетевой вызов Битрикс24
 * подменён (fetch), всё остальное — настоящее: создание, решение, ответ автора, эскалация.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { addComment, createIssue, sweepSla, updateIssue } from "@/lib/services/issues";
import { __flushBitrixQueue, __resetBitrixForTests, bitrixStatus } from "@/lib/integrations/bitrix24";
import type { CurrentUser } from "@/lib/auth/current-user";

const sel = { id: true, name: true, email: true, title: true, role: true, departmentId: true, isActive: true, department: { select: { id: true, name: true } }, headOf: { select: { id: true } } } as const;
let employee: CurrentUser, manager: CurrentUser;
const sent: { url: string; body: { DIALOG_ID: string; MESSAGE: string } }[] = [];
let reply: () => Response = () => new Response(JSON.stringify({ result: 1 }), { status: 200 });

beforeAll(async () => {
  process.env.BITRIX24_WEBHOOK_URL = "https://pulse-test.bitrix24.ru/rest/1/testsecret123/";
  process.env.BITRIX24_DIALOG_ID = "chat7";
  process.env.PULSE_PUBLIC_URL = "https://pulse.example.ru";
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    sent.push({ url, body: JSON.parse(String(init.body)) });
    return reply();
  });
  employee = await db.user.findUniqueOrThrow({ where: { email: "employee@pulse.demo" }, select: sel });
  manager = await db.user.findUniqueOrThrow({ where: { email: "manager@pulse.demo" }, select: sel });
});
afterAll(async () => {
  vi.unstubAllGlobals();
  delete process.env.BITRIX24_WEBHOOK_URL;
  delete process.env.BITRIX24_DIALOG_ID;
  delete process.env.PULSE_PUBLIC_URL;
  await db.$disconnect();
});
beforeEach(() => {
  sent.length = 0;
  reply = () => new Response(JSON.stringify({ result: 1 }), { status: 200 });
  __resetBitrixForTests();
});

const catId = async (name: string) => (await db.category.findFirstOrThrow({ where: { name } })).id;

describe("Битрикс24: события обращений", () => {
  it("новое анонимное обращение: в чат уходит код, категория и ответственный, но не автор", async () => {
    const r = await createIssue(employee, {
      type: "PROBLEM",
      categoryId: await catId("Документооборот"),
      title: "Проверка уведомления в Битрикс24",
      description: "Проверяем, что новое обращение попадает в рабочий чат без имени автора.",
      proposedSolution: undefined,
      isAnonymous: true,
      isPrivate: false,
    });
    await __flushBitrixQueue();
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("https://pulse-test.bitrix24.ru/rest/1/testsecret123/im.message.add.json");
    expect(sent[0].body.DIALOG_ID).toBe("chat7");
    const m = sent[0].body.MESSAGE;
    expect(m).toContain(`[B]${r.code} · Проблема[/B]`);
    expect(m).toContain("Документооборот");
    expect(m).toContain(`[URL=https://pulse.example.ru/issues/${r.code}]`);
    expect(m).not.toContain(employee.name);
    expect(m).not.toContain("Ирина");
  });

  it("решение и ответ автора на уточнение", async () => {
    await updateIssue(manager, "A-001", { status: "NEEDS_INFO", text: "Пришлите пример корректно заполненной заявки" });
    await addComment(employee, "A-001", { body: "Пример приложу, основное — назначение и параметры", kind: "COMMENT" });
    await updateIssue(manager, "A-001", { status: "REJECTED", text: "Решается в рамках обновления шаблона заявки, отдельное изменение не требуется." });
    await __flushBitrixQueue();
    const msgs = sent.map((s) => s.body.MESSAGE);
    expect(msgs.some((m) => m.includes("A-001 · автор ответил на уточнение"))).toBe(true);
    expect(msgs.some((m) => m.includes("A-001 · отклонено") && m.includes("Решение: Андрей Соколов"))).toBe(true);
    // запрос уточнения — дело автора и ответственного, в общий чат не дублируется
    expect(msgs.filter((m) => m.includes("A-001"))).toHaveLength(2);
  });

  it("эскалация просрочки попадает в чат один раз", async () => {
    await db.issueEvent.deleteMany({ where: { type: "ESCALATED" } });
    await db.issue.updateMany({ data: { escalatedAt: null, reactionEscalatedAt: null } });
    const r = await sweepSla(true);
    await __flushBitrixQueue();
    expect(r.escalated).toBeGreaterThan(0);
    expect(sent.filter((s) => /просрочен срок/.test(s.body.MESSAGE))).toHaveLength(r.escalated);
    await sweepSla(true);
    await __flushBitrixQueue();
    expect(sent.filter((s) => /просрочен срок/.test(s.body.MESSAGE))).toHaveLength(r.escalated);
  });

  it("сбой Битрикс24 не ломает работу PULSE и виден в статусе", async () => {
    reply = () => new Response(JSON.stringify({ error: "INVALID_CREDENTIALS" }), { status: 401 });
    const r = await createIssue(employee, {
      type: "IDEA",
      categoryId: await catId("Обучение"),
      title: "Обращение при недоступном Битрикс24",
      description: "Обращение должно сохраниться, даже если Битрикс24 отвечает ошибкой.",
      proposedSolution: undefined,
      isAnonymous: false,
      isPrivate: false,
    });
    await __flushBitrixQueue();
    expect(await db.issue.findUnique({ where: { code: r.code } })).not.toBeNull();
    const st = bitrixStatus();
    expect(st.failed).toBe(1);
    expect(st.lastError?.reason).toMatch(/Вебхук не найден/);
    expect(JSON.stringify(st)).not.toContain("testsecret123");
  });
});
