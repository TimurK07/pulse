/**
 * Регрессии E2E-аудита рабочего стенда: срок решения в прошлом, текст ошибки 404.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createIssue, getIssue, updateIssue } from "@/lib/services/issues";
import type { CurrentUser } from "@/lib/auth/current-user";

const sel = { id: true, name: true, email: true, title: true, role: true, departmentId: true, isActive: true, department: { select: { id: true, name: true } }, headOf: { select: { id: true } } } as const;
const u = (email: string) => db.user.findUniqueOrThrow({ where: { email }, select: sel }) as Promise<CurrentUser>;
let manager: CurrentUser, employee: CurrentUser, itCategory: string;

beforeAll(async () => {
  [manager, employee] = await Promise.all([u("manager@pulse.demo"), u("employee@pulse.demo")]);
  itCategory = (await db.category.findFirstOrThrow({ where: { name: "Интеграции и IT" } })).id;
});
afterAll(() => db.$disconnect());

async function fresh(title: string) {
  const r = await createIssue(employee, {
    type: "PROBLEM",
    categoryId: itCategory,
    title,
    description: `${title}: подробное описание ситуации для регрессионного теста аудита.`,
    isAnonymous: false,
    isPrivate: false,
    proposedSolution: undefined,
  });
  return r.code;
}

describe("срок решения руководителем", () => {
  it("срок в прошлом (после подачи, но раньше текущего момента) не принимается", async () => {
    const code = await fresh("Аудит: срок в прошлом");
    // обращение подано два дня назад: час назад — после подачи, но уже в прошлом
    await db.issue.update({ where: { code }, data: { createdAt: new Date(Date.now() - 2 * 24 * 3600_000) } });
    const before = await db.issue.findUniqueOrThrow({ where: { code } });
    await expect(updateIssue(manager, code, { dueAt: new Date(Date.now() - 3600_000).toISOString() })).rejects.toThrow(/позже текущего момента/);
    const after = await db.issue.findUniqueOrThrow({ where: { code } });
    expect(after.dueAt.getTime()).toBe(before.dueAt.getTime());
  });
  it("будущий срок сохраняется", async () => {
    const code = await fresh("Аудит: срок в будущем");
    const due = new Date(Date.now() + 3 * 24 * 3600_000);
    await updateIssue(manager, code, { dueAt: due.toISOString() });
    expect((await db.issue.findUniqueOrThrow({ where: { code } })).dueAt.getTime()).toBe(due.getTime());
  });
});

describe("сообщения об ошибках", () => {
  it("несуществующее обращение: «Обращение не найдено»", async () => {
    await expect(getIssue(manager, "A-99999")).rejects.toThrow("Обращение не найдено");
  });
});
