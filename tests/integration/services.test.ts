/** Сервисный слой на тестовой БД: гонки, эскалации, анонимность, права на сроки */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createIssue, getIssue, listIssues, sweepSla, updateIssue } from "@/lib/services/issues";
import type { CurrentUser } from "@/lib/auth/current-user";
import { resolveRoute } from "@/lib/routing";

const sel = { id: true, name: true, email: true, title: true, role: true, departmentId: true, isActive: true, department: { select: { id: true, name: true } }, headOf: { select: { id: true } } } as const;
let manager: CurrentUser, handler: CurrentUser, employee: CurrentUser, admin: CurrentUser;

beforeAll(async () => {
  manager = await db.user.findUniqueOrThrow({ where: { email: "manager@pulse.demo" }, select: sel });
  handler = await db.user.findUniqueOrThrow({ where: { email: "handler@pulse.demo" }, select: sel });
  employee = await db.user.findUniqueOrThrow({ where: { email: "employee@pulse.demo" }, select: sel });
  admin = await db.user.findUniqueOrThrow({ where: { email: "admin@pulse.demo" }, select: sel });
});
afterAll(() => db.$disconnect());

describe("жизненный цикл и права", () => {
  it("одновременная смена статуса: одно изменение проходит, второе получает 409", async () => {
    const results = await Promise.allSettled([
      updateIssue(manager, "A-019", { status: "IN_PROGRESS" }),
      updateIssue(admin, "A-019", { status: "NEEDS_INFO", text: "Уточните, пожалуйста, пример" }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(failed[0].reason.status).toBe(409);
    const events = await db.issueEvent.count({ where: { issue: { code: "A-019" }, type: "STATUS_CHANGED", createdAt: { gte: new Date(Date.now() - 60_000) } } });
    expect(events).toBe(1);
  });

  it("ответственный не может отодвинуть срок решения", async () => {
    await expect(updateIssue(handler, "A-007", { dueAt: new Date(Date.now() + 30 * 864e5).toISOString() })).rejects.toMatchObject({ status: 403 });
  });

  it("нельзя «Реализовано» без описания результата", async () => {
    await expect(updateIssue(manager, "A-002", { status: "IMPLEMENTED", text: "ок" })).rejects.toMatchObject({ status: 400 });
  });
});

describe("эскалации", () => {
  it("идемпотентны при параллельном запуске и различают реакцию и решение", async () => {
    await db.issueEvent.deleteMany({ where: { type: "ESCALATED" } });
    await db.issue.updateMany({ data: { escalatedAt: null, reactionEscalatedAt: null } });
    const [a, b] = await Promise.all([sweepSla(true), sweepSla(true)]);
    const total = a.escalated + b.escalated;
    const events = await db.issueEvent.count({ where: { type: "ESCALATED" } });
    expect(events).toBe(total);
    const again = await sweepSla(true);
    expect(again.escalated).toBe(0);
    // A-003: реакция была вовремя, просрочено решение → одна эскалация «решения»
    const a003 = await db.issueEvent.findMany({ where: { type: "ESCALATED", issue: { code: "A-003" } } });
    expect(a003.map((e) => e.note)).toEqual(["Просрочен срок решения"]);
  });
});

describe("анонимность", () => {
  it("обработчику не раскрываются имя, подразделение и id автора; фильтр по подразделению не вычисляет автора", async () => {
    const res = await createIssue(employee, {
      type: "PROBLEM",
      categoryId: (await db.category.findFirstOrThrow({ where: { name: "Прозрачность результатов" } })).id,
      title: "Анонимная проверка маршрута",
      description: "Проверяем, что анонимное обращение не уходит руководителю подразделения автора.",
      proposedSolution: undefined,
      isAnonymous: true,
      isPrivate: false,
    });
    // правило категории — «руководитель подразделения автора», но анонимное обращение его минует
    const gromov = await db.user.findUniqueOrThrow({ where: { email: "p.gromov@pulse.demo" } });
    const issue = await db.issue.findUniqueOrThrow({ where: { code: res.code } });
    expect(issue.assigneeId).not.toBe(gromov.id);

    const d = await getIssue(manager, res.code);
    expect(d.author).toBeNull();
    expect(d.department).toBeNull();
    expect(JSON.stringify(d.timeline)).not.toContain(employee.id);
    expect(JSON.stringify(d)).not.toContain("Закупки");

    const list = await listIssues(manager, { view: "all", sort: "created_desc", limit: 200, departmentId: employee.departmentId! });
    expect(list.map((i) => i.code)).not.toContain(res.code);
    const all = await listIssues(manager, { view: "all", sort: "created_desc", limit: 200 });
    expect(all.find((i) => i.code === res.code)?.department).toBeNull();
  });

  it("автор видит своё анонимное обращение полностью", async () => {
    const mine = await listIssues(employee, { view: "mine", sort: "created_desc", limit: 50 });
    const anon = mine.find((i) => i.isAnonymous)!;
    expect(anon.department?.name).toBe("Закупки");
  });

  it("маршрут: отсутствующий основной → резервный, затем руководитель", async () => {
    const cat = await db.category.findFirstOrThrow({ where: { name: "Обучение" } });
    const r = await resolveRoute({ categoryId: cat.id, type: "IDEA", authorDepartmentId: employee.departmentId });
    expect(r.via).toBe("backup");
    expect(r.assigneeName).toBe("Анна Ковалёва");
  });
});
