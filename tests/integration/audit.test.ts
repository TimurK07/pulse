/**
 * Регрессии аудита: сроки (пауза, приоритет, переоткрытие), гонки ответа автора,
 * поддержка без раскрытия автора, маршрутизация, хранение файлов, конфиденциальность разбора.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { addComment, createIssue, getIssue, listIssues, sweepSla, toggleSupport, updateIssue } from "@/lib/services/issues";
import { resolveRoute } from "@/lib/routing";
import { readStoredFile, saveFile } from "@/lib/storage";
import { triageIssue } from "@/lib/ai/features";
import { computeAnalytics } from "@/lib/services/analytics";
import { createIssueSchema } from "@/lib/validation";
import type { CurrentUser } from "@/lib/auth/current-user";

const sel = { id: true, name: true, email: true, title: true, role: true, departmentId: true, isActive: true, department: { select: { id: true, name: true } }, headOf: { select: { id: true } } } as const;
const u = (email: string) => db.user.findUniqueOrThrow({ where: { email }, select: sel }) as Promise<CurrentUser>;
const DAY = 24 * 3600_000;

let manager: CurrentUser, handler: CurrentUser, employee: CurrentUser, colleague: CurrentUser, gromov: CurrentUser;
let itCategory: string;

async function fresh(author: CurrentUser, title: string, extra: Partial<{ isPrivate: boolean; isAnonymous: boolean; categoryId: string }> = {}) {
  const r = await createIssue(author, {
    type: "PROBLEM",
    categoryId: extra.categoryId ?? itCategory,
    title,
    description: `${title}: подробное описание ситуации для регрессионного теста аудита.`,
    isAnonymous: extra.isAnonymous ?? false,
    isPrivate: extra.isPrivate ?? false,
    proposedSolution: undefined,
  });
  return r.code;
}
const row = (code: string) => db.issue.findUniqueOrThrow({ where: { code } });

beforeAll(async () => {
  [manager, handler, employee, colleague, gromov] = await Promise.all([
    u("manager@pulse.demo"),
    u("handler@pulse.demo"),
    u("employee@pulse.demo"),
    u("e.smirnova@pulse.demo"),
    u("p.gromov@pulse.demo"),
  ]);
  itCategory = (await db.category.findFirstOrThrow({ where: { name: "Интеграции и IT" } })).id;
});
afterAll(() => db.$disconnect());

describe("сроки: приоритет не отодвигает просрочку ответственного", () => {
  it("ответственный понижает приоритет — срок решения не сдвигается позже", async () => {
    const code = await fresh(employee, "Аудит: понижение приоритета");
    await updateIssue(manager, code, { priority: "HIGH" });
    const before = await row(code);
    await updateIssue(handler, code, { priority: "LOW" });
    const after = await row(code);
    expect(after.priority).toBe("LOW");
    expect(after.dueAt.getTime()).toBe(before.dueAt.getTime());
  });
  it("руководитель меняет приоритет — срок пересчитывается и это видно в истории", async () => {
    const code = await fresh(employee, "Аудит: приоритет руководителем");
    const before = await row(code);
    await updateIssue(manager, code, { priority: "LOW" });
    const after = await row(code);
    expect(after.dueAt.getTime()).toBeGreaterThan(before.dueAt.getTime());
    expect(await db.issueEvent.count({ where: { issueId: after.id, type: "DUE_CHANGED" } })).toBe(1);
  });
});

describe("пауза на время уточнения", () => {
  it("ответ автора возвращает обращение туда, откуда спросили, и продлевает срок на время ожидания", async () => {
    const code = await fresh(employee, "Аудит: пауза и возврат в работу");
    await updateIssue(handler, code, { status: "IN_PROGRESS" });
    await updateIssue(handler, code, { status: "NEEDS_INFO", text: "Уточните, пожалуйста, в каких системах дублируется ввод" });
    const paused = await row(code);
    expect(paused.pausedAt).not.toBeNull();
    // автор ответил через 3 дня
    await db.issue.update({ where: { id: paused.id }, data: { pausedAt: new Date(Date.now() - 3 * DAY) } });
    const r = await addComment(employee, code, { body: "В 1С и в CRM", kind: "COMMENT" });
    expect(r.statusChanged).toBe(true);
    const after = await row(code);
    expect(after.status).toBe("IN_PROGRESS");
    expect(after.pausedAt).toBeNull();
    expect(after.dueAt.getTime() - paused.dueAt.getTime()).toBeGreaterThanOrEqual(3 * DAY - 5000);
  });

  it("эскалация не срабатывает, пока обращение ждёт ответа автора", async () => {
    const code = await fresh(employee, "Аудит: нет эскалации на паузе");
    await updateIssue(handler, code, { status: "NEEDS_INFO", text: "Уточните, пожалуйста, пример документа" });
    const r0 = await row(code);
    await db.issue.update({ where: { id: r0.id }, data: { dueAt: new Date(Date.now() - DAY) } });
    await sweepSla(true);
    const r1 = await row(code);
    expect(r1.escalatedAt).toBeNull();
    expect((await listIssues(manager, { view: "overdue", sort: "created_desc", limit: 200 })).some((i) => i.code === code)).toBe(false);
  });

  it("гонка: ответственный отклонил, ответ автора не переоткрывает обращение", async () => {
    const code = await fresh(employee, "Аудит: гонка ответа и отказа");
    await updateIssue(handler, code, { status: "NEEDS_INFO", text: "Уточните, пожалуйста, детали" });
    await updateIssue(handler, code, { status: "REJECTED", text: "Отклонено: задача решается в рамках другого проекта внедрения" });
    await expect(addComment(employee, code, { body: "Ответ", kind: "COMMENT" })).rejects.toMatchObject({ status: 400 });
    expect((await row(code)).status).toBe("REJECTED");
  });

  it("двойная отправка ответа: статус меняется один раз", async () => {
    const code = await fresh(employee, "Аудит: двойной ответ");
    await updateIssue(handler, code, { status: "NEEDS_INFO", text: "Уточните, пожалуйста, детали" });
    const res = await Promise.allSettled([
      addComment(employee, code, { body: "Ответ", kind: "COMMENT" }),
      addComment(employee, code, { body: "Ответ", kind: "COMMENT" }),
    ]);
    const changed = res.filter((r) => r.status === "fulfilled" && r.value.statusChanged).length;
    expect(changed).toBe(1);
    const id = (await row(code)).id;
    expect(await db.issueEvent.count({ where: { issueId: id, type: "STATUS_CHANGED", fromValue: "NEEDS_INFO" } })).toBe(1);
  });
});

describe("переоткрытие", () => {
  it("срок отсчитывается заново, прежнее решение больше не действует", async () => {
    const code = await fresh(employee, "Аудит: переоткрытие");
    await updateIssue(handler, code, { status: "REJECTED", text: "Отклонено: решается в рамках общего проекта автоматизации" });
    const closed = await row(code);
    await db.issue.update({ where: { id: closed.id }, data: { dueAt: new Date(Date.now() - DAY) } });
    await updateIssue(manager, code, { status: "IN_REVIEW" });
    const r = await row(code);
    expect(r.dueAt.getTime()).toBeGreaterThan(Date.now());
    expect(r.decision).toBeNull();
    expect(r.resolvedAt).toBeNull();
  });
  it("закрытое обращение нельзя менять без переоткрытия", async () => {
    const code = await fresh(employee, "Аудит: правка закрытого");
    await updateIssue(handler, code, { status: "REJECTED", text: "Отклонено: решается в рамках общего проекта автоматизации" });
    await expect(updateIssue(manager, code, { priority: "HIGH" })).rejects.toMatchObject({ status: 400 });
  });
});

describe("поддержка коллег", () => {
  it("список «Вы поддержали» не раскрывает автора, повтор не засоряет историю", async () => {
    const code = await fresh(colleague, "Аудит: поддержка без автора");
    await toggleSupport(employee, code);
    await toggleSupport(employee, code);
    await toggleSupport(employee, code);
    const items = await listIssues(employee, { view: "supported", sort: "created_desc", limit: 200 });
    const it = items.find((i) => i.code === code)!;
    expect(it.author).toBeNull();
    expect(it.department).toBeNull();
    const id = (await row(code)).id;
    expect(await db.issueEvent.count({ where: { issueId: id, type: "SUPPORTED" } })).toBe(1);
  });
  it("обработчик и руководитель не «поддерживают» обращения", async () => {
    const code = await fresh(colleague, "Аудит: поддержка не сотрудником");
    await expect(toggleSupport(handler, code)).rejects.toMatchObject({ status: 403 });
    await expect(toggleSupport(manager, code)).rejects.toMatchObject({ status: 403 });
  });
});

describe("маршрутизация", () => {
  it("автор не назначается ответственным за своё обращение", async () => {
    const r = await resolveRoute({ categoryId: itCategory, type: "PROBLEM", authorId: handler.id, authorDepartmentId: handler.departmentId });
    expect(r.assigneeId).not.toBe(handler.id);
    expect(r.via).toBe("backup");
  });
  it("руководитель подразделения без прав обработки пропускается", async () => {
    const cat = await db.category.findFirstOrThrow({ where: { name: "Прозрачность результатов" } });
    await db.user.update({ where: { id: gromov.id }, data: { role: "EMPLOYEE" } });
    try {
      const r = await resolveRoute({ categoryId: cat.id, type: "PROBLEM", authorId: employee.id, authorDepartmentId: employee.departmentId });
      expect(r.assigneeId).not.toBe(gromov.id);
      // в режиме «руководитель подразделения» сначала резервный из правила
      expect(r.via).toBe("backup");
    } finally {
      await db.user.update({ where: { id: gromov.id }, data: { role: "HANDLER" } });
    }
  });
  it("руководитель в общей очереди получает одно уведомление о новом обращении", async () => {
    const cat = await db.category.findFirstOrThrow({ where: { name: "Оперативность" } });
    const rule = await db.routingRule.findFirstOrThrow({ where: { categoryId: cat.id, issueType: null } });
    await db.routingRule.update({ where: { id: rule.id }, data: { primaryId: null, backupId: null } });
    try {
      const anon = await createIssue(colleague, {
        type: "PROBLEM",
        categoryId: cat.id,
        title: "Аудит: общая очередь",
        description: "Аудит: подробное описание ситуации для проверки уведомлений.",
        isAnonymous: true,
        isPrivate: false,
        proposedSolution: undefined,
      });
      const n = await db.notification.count({ where: { issueId: anon.id, userId: anon.route.assigneeId! } });
      expect(anon.route.via).toBe("manager_queue");
      expect(n).toBe(1);
    } finally {
      await db.routingRule.update({ where: { id: rule.id }, data: { primaryId: rule.primaryId, backupId: rule.backupId } });
    }
  });
});

describe("вложения в БД", () => {
  it("файл сохраняется в PostgreSQL и читается без диска", async () => {
    const key = await saveFile(Buffer.from("проверка"));
    expect((await readStoredFile(key)).toString()).toBe("проверка");
    await expect(readStoredFile("../../etc/passwd")).rejects.toThrow();
  });
});

describe("конфиденциальность AI-разбора", () => {
  it("похожие в разборе не включают конфиденциальные обращения", async () => {
    const title = "Аудит: дублирование ввода данных в учётных системах";
    const priv = await fresh(colleague, title, { isPrivate: true });
    const pub = await fresh(employee, title);
    const t = await triageIssue(manager, pub, { generate: true });
    expect(t?.data.related.map((r) => r.code)).not.toContain(priv);
    // разбор, сохранённый раньше со ссылкой на конфиденциальное, при чтении очищается
    const id = (await row(pub)).id;
    const stored = (await row(pub)).aiTriage as { data: { related: { code: string; title: string; status: string }[] } };
    stored.data.related.push({ code: priv, title, status: "NEW" });
    await db.issue.update({ where: { id }, data: { aiTriage: stored } });
    const again = await triageIssue(manager, pub, { generate: false });
    expect(again?.data.related.map((r) => r.code)).not.toContain(priv);
  });
});

describe("аналитика", () => {
  it("«реакция в срок» учитывает обращения, оставшиеся без ответа после норматива", async () => {
    const code = await fresh(employee, "Аудит: без реакции");
    await db.issue.update({ where: { code }, data: { firstResponseDueAt: new Date(Date.now() - DAY) } });
    const a = await computeAnalytics();
    const t = a.totals;
    expect(t.firstResponseOnTimeShare).not.toBeNull();
    expect(t.firstResponseOnTimeShare!).toBeLessThan(1);
    const issue = await getIssue(manager, code);
    expect(issue.status).toBe("NEW");
  });
});

describe("валидация", () => {
  it("нулевой байт в тексте не роняет запись, коды похожих проверяются", () => {
    const ok = createIssueSchema.parse({
      type: "IDEA",
      categoryId: itCategory,
      title: "Нулевой\u0000 байт",
      description: "Описание\u0000 с нулевым байтом внутри для проверки",
      proposedSolution: "Решение\u0000",
    });
    expect(ok.proposedSolution).toBe("Решение");
    expect(() => createIssueSchema.parse({ type: "IDEA", categoryId: itCategory, title: "Заголовок теста", description: "Описание длиной больше двадцати символов", acknowledgedSimilar: ["x".repeat(5000)] })).toThrow();
  });
});
