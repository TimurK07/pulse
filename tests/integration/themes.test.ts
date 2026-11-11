/**
 * Системное решение по теме: настоящие сервисы и тестовая БД, сеть Битрикс24 подменена.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { createIssue, getIssue, toggleSupport, updateIssue } from "@/lib/services/issues";
import { decideTheme, themePath } from "@/lib/services/themes";
import { __flushBitrixQueue, __resetBitrixForTests } from "@/lib/integrations/bitrix24";
import type { CurrentUser } from "@/lib/auth/current-user";

const sel = { id: true, name: true, email: true, title: true, role: true, departmentId: true, isActive: true, department: { select: { id: true, name: true } }, headOf: { select: { id: true } } } as const;
let employee: CurrentUser, manager: CurrentUser, handler: CurrentUser, colleagues: CurrentUser[];
const sent: string[] = [];

beforeAll(async () => {
  process.env.BITRIX24_WEBHOOK_URL = "https://pulse-test.bitrix24.ru/rest/1/testsecret123/";
  process.env.BITRIX24_DIALOG_ID = "chat7";
  process.env.PULSE_PUBLIC_URL = "https://pulse.example.ru";
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)).MESSAGE);
    return new Response(JSON.stringify({ result: 1 }), { status: 200 });
  });
  employee = await db.user.findUniqueOrThrow({ where: { email: "employee@pulse.demo" }, select: sel });
  manager = await db.user.findUniqueOrThrow({ where: { email: "manager@pulse.demo" }, select: sel });
  handler = await db.user.findUniqueOrThrow({ where: { email: "handler@pulse.demo" }, select: sel });
  colleagues = await db.user.findMany({ where: { role: "EMPLOYEE", isActive: true, id: { not: employee.id } }, select: sel, take: 2 });
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
  __resetBitrixForTests();
});

async function newIssue(title: string, opts: { isPrivate?: boolean } = {}) {
  const cat = await db.category.findFirstOrThrow({ where: { name: "Документооборот" } });
  return createIssue(employee, {
    type: "PROBLEM",
    categoryId: cat.id,
    title,
    description: "Не видно, на каком этапе согласование документа и кто сейчас его держит.",
    proposedSolution: undefined,
    isAnonymous: false,
    isPrivate: opts.isPrivate ?? false,
  });
}

describe("themePath", () => {
  it("прямой переход или через «В работе»", () => {
    expect(themePath("IN_REVIEW", "PROBLEM", "IMPLEMENTED")).toEqual(["IMPLEMENTED"]);
    expect(themePath("NEW", "PROBLEM", "IMPLEMENTED")).toEqual(["IN_PROGRESS", "IMPLEMENTED"]);
    expect(themePath("NEEDS_INFO", "IDEA", "IMPLEMENTED")).toEqual(["IN_PROGRESS", "IMPLEMENTED"]);
    expect(themePath("IN_PROGRESS", "PROBLEM", "IN_PROGRESS")).toEqual([]);
    expect(themePath("NEW", "PROBLEM", "REJECTED")).toEqual(["REJECTED"]);
  });
});

describe("Системное решение по теме", () => {
  it("одним действием реализует все обращения, уведомляет авторов и поддержавших, одно сообщение в Битрикс24", async () => {
    const a = await newIssue("Тема: статус согласования договора");
    const b = await newIssue("Тема: статус согласования счёта");
    await updateIssue(manager, b.code, { status: "IN_REVIEW" });
    for (const c of colleagues) await toggleSupport(c, a.code);
    await __flushBitrixQueue();
    sent.length = 0;

    const r = await decideTheme(manager, {
      title: "Прозрачность статусов согласования",
      codes: [a.code, b.code],
      status: "IMPLEMENTED",
      text: "Во всех заявках появилась лента этапов согласования с текущим исполнителем и сроком.",
    });
    expect(r.codes).toEqual([a.code, b.code].sort());
    expect(r.notified).toBe(1 + colleagues.length); // автор один на обе + поддержавшие

    const rows = await db.issue.findMany({ where: { code: { in: [a.code, b.code] } }, include: { events: { orderBy: { createdAt: "asc" } } } });
    for (const i of rows) {
      expect(i.status).toBe("IMPLEMENTED");
      expect(i.themeDecisionId).toBe(r.id);
      expect(i.decision).toContain("лента этапов");
      expect(i.decidedById).toBe(manager.id);
      expect(i.resolvedAt).not.toBeNull();
      expect(i.firstResponseAt).not.toBeNull();
    }
    // «Новое» прошло через «В работе» — это видно в истории
    const ea = rows.find((i) => i.code === a.code)!.events.filter((e) => e.type === "STATUS_CHANGED").map((e) => `${e.fromValue}>${e.toValue}`);
    expect(ea.slice(-2)).toEqual(["NEW>IN_PROGRESS", "IN_PROGRESS>IMPLEMENTED"]);

    const notes = await db.notification.findMany({ where: { issueId: a.id, title: { contains: "системное решение" } } });
    expect(notes.map((n) => n.userId).sort()).toEqual([employee.id, ...colleagues.map((c) => c.id)].sort());

    await __flushBitrixQueue();
    const theme = sent.filter((m) => m.includes("Системное решение"));
    expect(theme).toHaveLength(1);
    expect(theme[0]).toContain("[B]Системное решение · реализовано[/B]");
    expect(theme[0]).toContain(`2 обращения: ${[a.code, b.code].sort().join(", ")}`);
    expect(theme[0]).toContain(`уведомлено сотрудников: ${r.notified}`);
    expect(theme[0]).not.toContain(employee.name);
    // по отдельному сообщению на каждое обращение не дублируется
    expect(sent.filter((m) => m.includes(`${a.code} · реализовано`))).toHaveLength(0);

    // автор видит в карточке, что решено вместе с другим обращением
    const detail = await getIssue(employee, a.code);
    expect(detail.themeDecision?.title).toBe("Прозрачность статусов согласования");
    expect(detail.themeDecision?.related).toEqual([b.code]);
    expect(detail.themeDecision?.total).toBe(2);
  });

  it("«Взять в работу» с владельцем: переназначает, пишет план автору; конфиденциальные не раскрываются", async () => {
    const a = await newIssue("Тема: этап согласования не виден");
    const p = await newIssue("Тема: конфиденциальное про согласование", { isPrivate: true });
    const r = await decideTheme(manager, {
      title: "Статусы согласования",
      codes: [a.code, p.code],
      status: "IN_PROGRESS",
      text: "Делаем единую ленту этапов во всех заявках, срок — конец месяца.",
      ownerId: handler.id,
    });
    const rows = await db.issue.findMany({ where: { code: { in: [a.code, p.code] } }, include: { comments: true } });
    for (const i of rows) {
      expect(i.status).toBe("IN_PROGRESS");
      expect(i.assigneeId).toBe(handler.id);
      expect(i.decision).toBeNull();
      expect(i.comments.some((c) => c.kind === "COMMENT" && c.body.includes("единую ленту"))).toBe(true);
    }
    const detail = await getIssue(employee, a.code);
    expect(detail.themeDecision?.related).toEqual([]); // конфиденциальное не показываем даже кодом
    expect(detail.themeDecision?.owner).toBe(handler.name);
    expect(r.status).toBe("IN_PROGRESS");
    await __flushBitrixQueue();
    const m = sent.find((x) => x.includes("Системное решение"))!;
    expect(m).toContain("в работе");
    expect(m).toContain(`Владелец темы: ${handler.name}`);
    expect(m).not.toContain("конфиденциальное про согласование");
  });

  it("проверки: права, закрытые обращения, короткий текст", async () => {
    const a = await newIssue("Тема: проверка ограничений");
    const text = "Достаточно подробное описание принятого решения по теме.";
    await expect(decideTheme(handler, { title: "Тема", codes: [a.code], status: "IN_PROGRESS", text })).rejects.toMatchObject({ status: 403 });
    await expect(decideTheme(manager, { title: "Тема", codes: [a.code], status: "REJECTED", text: "Коротко" })).rejects.toMatchObject({ status: 400 });
    await expect(decideTheme(manager, { title: "Тема", codes: [a.code, "A-999"], status: "IN_PROGRESS", text })).rejects.toThrow(/не найдены: A-999/);
    await decideTheme(manager, { title: "Тема", codes: [a.code], status: "REJECTED", text: "Решается в рамках общего проекта по электронному документообороту." });
    await expect(decideTheme(manager, { title: "Тема", codes: [a.code], status: "IN_PROGRESS", text })).rejects.toThrow(/Уже закрыты/);
  });
});
