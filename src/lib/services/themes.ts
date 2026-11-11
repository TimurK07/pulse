import "server-only";
import type { IssueStatus, IssueType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError, badRequest, forbidden } from "@/lib/api";
import type { CurrentUser } from "@/lib/auth/current-user";
import { OPEN_STATUSES, RESOLVED_STATUSES, STATUS_LABEL, STATUS_REQUIRES_TEXT, allowedTransitions, pluralRu } from "@/lib/domain";
import { isManagerial } from "@/lib/permissions";
import { notify } from "./notifications";
import { bitrixConfig, notifyBitrix } from "@/lib/integrations/bitrix24";

/**
 * Системное решение по теме: руководитель одним действием берёт в работу,
 * реализует или отклоняет все открытые обращения повторяющейся темы.
 *
 *  - Каждое обращение проходит обычные переходы статусов. Если прямого перехода нет
 *    («Новое» → «Реализовано»), обращение проходит через «В работе», и это видно в истории.
 *  - Решение сохраняется отдельной записью и связывается с обращениями: автор видит,
 *    что его вопрос решён вместе с похожими.
 *  - Уведомляются авторы и все поддержавшие; в Битрикс24 уходит одно сообщение на всю тему.
 */

export const THEME_TARGETS = ["IN_PROGRESS", "IMPLEMENTED", "REJECTED"] as const;
export type ThemeTarget = (typeof THEME_TARGETS)[number];

/** Минимальная длина текста: для «В работу» — план решения */
export function themeTextMin(target: ThemeTarget) {
  return STATUS_REQUIRES_TEXT[target]?.min ?? 20;
}

/** Цепочка статусов от текущего до целевого: прямой переход или через «В работе» */
export function themePath(from: IssueStatus, type: IssueType, target: ThemeTarget): IssueStatus[] | null {
  if (from === target) return [];
  const direct = allowedTransitions(from, type);
  if (direct.includes(target)) return [target];
  if (direct.includes("IN_PROGRESS") && allowedTransitions("IN_PROGRESS", type).includes(target)) return ["IN_PROGRESS", target];
  return null;
}

export interface ThemeDecisionInput {
  title: string;
  codes: string[];
  status: ThemeTarget;
  text: string;
  ownerId?: string | null;
}

export async function decideTheme(user: CurrentUser, input: ThemeDecisionInput) {
  if (!isManagerial(user.role)) throw forbidden("Системное решение принимает руководитель");
  const codes = [...new Set(input.codes)];
  const text = input.text.trim();
  const title = input.title.trim();
  const min = themeTextMin(input.status);
  if (text.length < min) {
    throw badRequest(`${input.status === "IN_PROGRESS" ? "План решения" : STATUS_REQUIRES_TEXT[input.status]!.label}: минимум ${min} символов`, [
      { path: "text", message: `минимум ${min} символов` },
    ]);
  }

  const issues = await db.issue.findMany({
    where: { code: { in: codes } },
    select: {
      id: true,
      code: true,
      title: true,
      type: true,
      status: true,
      authorId: true,
      assigneeId: true,
      isPrivate: true,
      firstResponseAt: true,
      assignee: { select: { name: true } },
      supporters: { select: { userId: true } },
    },
  });
  const missing = codes.filter((c) => !issues.some((i) => i.code === c));
  if (missing.length) throw badRequest(`Обращения не найдены: ${missing.join(", ")}`);
  const closed = issues.filter((i) => !OPEN_STATUSES.includes(i.status));
  if (closed.length) throw badRequest(`Уже закрыты: ${closed.map((i) => i.code).join(", ")}. Уберите их из решения.`);

  const plans = issues.map((i) => ({ issue: i, path: themePath(i.status, i.type, input.status) }));
  const stuck = plans.filter((p) => p.path === null);
  if (stuck.length) {
    throw badRequest(
      `Нельзя перевести в «${STATUS_LABEL[input.status]}»: ${stuck.map((p) => `${p.issue.code} (${STATUS_LABEL[p.issue.status]})`).join(", ")}`,
    );
  }

  let owner: { id: string; name: string } | null = null;
  if (input.ownerId) {
    const u = await db.user.findUnique({ where: { id: input.ownerId }, select: { id: true, name: true, role: true, isActive: true } });
    if (!u || !u.isActive || u.role === "EMPLOYEE") throw badRequest("Нельзя назначить этого пользователя владельцем темы");
    owner = { id: u.id, name: u.name };
  }

  const now = new Date();
  const resolved = RESOLVED_STATUSES.includes(input.status);
  const recipients = new Set<string>();
  for (const { issue } of plans) {
    for (const id of [issue.authorId, ...issue.supporters.map((s) => s.userId)]) if (id !== user.id) recipients.add(id);
  }

  const decision = await db.$transaction(async (tx) => {
    const d = await tx.themeDecision.create({
      data: { title, text, status: input.status, ownerId: owner?.id ?? null, decidedById: user.id, notifiedCount: recipients.size, createdAt: now },
    });
    const note = `Системное решение «${title}» по ${codes.length} ${pluralRu(codes.length, "обращению", "обращениям", "обращениям")}: ${codes.join(", ")}`;
    for (const { issue, path } of plans) {
      const data: Prisma.IssueUncheckedUpdateManyInput = { themeDecisionId: d.id, status: input.status, updatedAt: now };
      if (!issue.firstResponseAt) data.firstResponseAt = now;
      if (owner) data.assigneeId = owner.id;
      if (resolved) {
        data.decision = text;
        data.decisionAt = now;
        data.decidedById = user.id;
        data.resolvedAt = now;
      }
      // оптимистичная блокировка: статус не должен был измениться, пока руководитель писал решение
      const r = await tx.issue.updateMany({ where: { id: issue.id, status: issue.status }, data });
      if (r.count === 0) throw new ApiError(409, `${issue.code} только что изменил другой сотрудник. Обновите страницу и повторите.`, "conflict");

      const events: Prisma.IssueEventCreateManyInput[] = [];
      let from = issue.status;
      path!.forEach((to, n) => {
        events.push({ issueId: issue.id, actorId: user.id, type: "STATUS_CHANGED", fromValue: from, toValue: to, note: n === path!.length - 1 ? note : null, createdAt: now });
        from = to;
      });
      if (owner && owner.id !== issue.assigneeId) {
        events.push({ issueId: issue.id, actorId: user.id, type: "ASSIGNED", fromValue: issue.assignee?.name ?? null, toValue: owner.name, createdAt: now });
      }
      if (resolved) events.push({ issueId: issue.id, actorId: user.id, type: "DECISION", toValue: input.status, note: text, createdAt: now });
      if (events.length) await tx.issueEvent.createMany({ data: events });
      if (!resolved) await tx.comment.create({ data: { issueId: issue.id, authorId: user.id, kind: "COMMENT", body: `${note}.\n\n${text}`, createdAt: now } });
    }
    return d;
  });

  for (const { issue } of plans) {
    await notify(
      [issue.authorId, ...issue.supporters.map((s) => s.userId)],
      { issueId: issue.id, title: `${issue.code}: ${STATUS_LABEL[input.status].toLowerCase()} — системное решение`, body: `«${title}». ${text}`.slice(0, 500) },
      { exclude: user.id },
    );
    if (owner && owner.id !== issue.assigneeId) {
      await notify([owner.id], { issueId: issue.id, title: `Вы владелец темы «${title}»: ${issue.code}`, body: issue.title }, { exclude: user.id });
    }
  }

  notifyBitrix({
    kind: "theme",
    title,
    status: input.status,
    text,
    codes: plans.map((p) => p.issue.code).sort(),
    owner: owner?.name ?? null,
    by: user.name,
    notified: recipients.size,
  });

  return { id: decision.id, codes: plans.map((p) => p.issue.code).sort(), status: input.status, notified: recipients.size, bitrix: bitrixConfig().enabled };
}

/** Что показать в карточке обращения: решение и другие обращения, решённые вместе с ним */
export async function themeDecisionFor(themeDecisionId: string, issueId: string) {
  const d = await db.themeDecision.findUnique({
    where: { id: themeDecisionId },
    include: {
      owner: { select: { name: true } },
      decidedBy: { select: { name: true } },
      issues: { select: { id: true, code: true, isPrivate: true }, orderBy: { number: "asc" } },
    },
  });
  if (!d) return null;
  const others = d.issues.filter((i) => i.id !== issueId);
  return {
    title: d.title,
    text: d.text,
    status: d.status,
    owner: d.owner?.name ?? null,
    decidedBy: d.decidedBy.name,
    createdAt: d.createdAt.toISOString(),
    notified: d.notifiedCount,
    total: d.issues.length,
    // конфиденциальные обращения не раскрываем даже кодом
    related: others.filter((i) => !i.isPrivate).map((i) => i.code),
  };
}
