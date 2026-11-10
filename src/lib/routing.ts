import "server-only";
import type { IssueType } from "@prisma/client";
import { db } from "@/lib/db";

export interface RoutingResult {
  assigneeId: string | null;
  assigneeName: string | null;
  /** Объяснение для истории обращения и для пользователя */
  note: string;
  /** Как найден ответственный — для аналитики и тестов */
  via: "primary" | "backup" | "department_head" | "manager_queue" | "unassigned";
}

type Candidate = { id: string; name: string; isActive: boolean; isAvailable: boolean } | null;

const usable = (u: Candidate): boolean => !!u && u.isActive && u.isAvailable;

/**
 * Маршрутизация обращения:
 * 1. правило для (категория, тип) → иначе правило категории;
 * 2. основной ответственный, если активен и доступен;
 * 3. резервный ответственный;
 * 4. руководитель подразделения автора;
 * 5. общая очередь руководителя направления (MANAGER).
 * Ни одно обращение не остаётся без владельца.
 */
export async function resolveRoute(params: {
  categoryId: string;
  type: IssueType;
  authorDepartmentId: string | null;
  /** анонимное обращение не направляется руководителю подразделения автора */
  isAnonymous?: boolean;
}): Promise<RoutingResult> {
  const rules = await db.routingRule.findMany({
    where: { categoryId: params.categoryId, OR: [{ issueType: params.type }, { issueType: null }] },
    include: {
      primary: { select: { id: true, name: true, isActive: true, isAvailable: true } },
      backup: { select: { id: true, name: true, isActive: true, isAvailable: true } },
    },
  });
  const rule = rules.find((r) => r.issueType === params.type) ?? rules.find((r) => r.issueType === null);

  const deptHead = params.authorDepartmentId && !params.isAnonymous
    ? await db.department.findUnique({
        where: { id: params.authorDepartmentId },
        select: { name: true, head: { select: { id: true, name: true, isActive: true, isAvailable: true } } },
      })
    : null;

  const skipped: string[] = [];

  if (rule?.mode === "AUTHOR_DEPARTMENT_HEAD") {
    if (usable(deptHead?.head ?? null)) {
      return {
        assigneeId: deptHead!.head!.id,
        assigneeName: deptHead!.head!.name,
        note: `По правилу категории: руководитель подразделения автора (${deptHead!.name})`,
        via: "department_head",
      };
    }
    if (deptHead?.head) skipped.push(`${deptHead.head.name} недоступен`);
  }

  if (rule && rule.mode === "FIXED") {
    if (usable(rule.primary)) {
      return {
        assigneeId: rule.primary!.id,
        assigneeName: rule.primary!.name,
        note: `По правилу категории: основной ответственный`,
        via: "primary",
      };
    }
    if (rule.primary) skipped.push(`${rule.primary.name} ${rule.primary.isActive ? "отсутствует" : "неактивен"}`);
    if (usable(rule.backup)) {
      return {
        assigneeId: rule.backup!.id,
        assigneeName: rule.backup!.name,
        note: `Основной ответственный недоступен (${skipped.join(", ")}) — назначен резервный`,
        via: "backup",
      };
    }
    if (rule.backup) skipped.push(`резервный ${rule.backup.name} недоступен`);
  }

  if (rule?.mode !== "AUTHOR_DEPARTMENT_HEAD" && usable(deptHead?.head ?? null)) {
    return {
      assigneeId: deptHead!.head!.id,
      assigneeName: deptHead!.head!.name,
      note: `${rule ? `Ответственные по категории недоступны (${skipped.join(", ")})` : "Для категории нет правила"} — передано руководителю подразделения автора`,
      via: "department_head",
    };
  }

  const manager = await db.user.findFirst({
    where: { role: "MANAGER", isActive: true, isAvailable: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  if (manager) {
    return {
      assigneeId: manager.id,
      assigneeName: manager.name,
      note: `Нет доступного ответственного${skipped.length ? ` (${skipped.join(", ")})` : ""} — обращение в общей очереди руководителя направления`,
      via: "manager_queue",
    };
  }
  return { assigneeId: null, assigneeName: null, note: "Нет доступных ответственных — требуется ручное назначение", via: "unassigned" };
}

/** Категории, где пользователь — основной или резервный ответственный */
export async function handledCategoryIds(userId: string) {
  const rules = await db.routingRule.findMany({
    where: { OR: [{ primaryId: userId }, { backupId: userId }] },
    select: { categoryId: true },
  });
  return [...new Set(rules.map((r) => r.categoryId))];
}
