import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { OPEN_STATUSES, RESOLVED_STATUSES, STATUS_ORDER, type IssueStatus, type IssueType } from "@/lib/domain";
import { loadCorpus } from "@/lib/ai/features";
import { localThemes } from "@/lib/ai/local";

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** Начало недели (понедельник 00:00) */
function weekStart(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  return x;
}

export interface AnalyticsFilters {
  periodDays?: number; // 0 — всё время
  departmentId?: string;
  categoryId?: string;
}

/**
 * Все метрики считаются из реальных записей БД. Определения:
 *  - «рассмотрено» — получена первая реакция ответственного (firstResponseAt);
 *  - «с результатом» — финальный статус + зафиксированный текст решения;
 *  - «время первой реакции» — firstResponseAt − createdAt, календарные часы;
 *  - «в срок» — первая реакция не позже firstResponseDueAt;
 *  - «просрочено» — открытое обращение с истёкшим сроком реакции или решения.
 */
export async function computeAnalytics(f: AnalyticsFilters = {}, scope: Prisma.IssueWhereInput = {}) {
  const now = new Date();
  const since = f.periodDays ? new Date(now.getTime() - f.periodDays * DAY) : null;
  const issues = await db.issue.findMany({
    where: {
      AND: [scope],
      ...(since ? { createdAt: { gte: since } } : {}),
      ...(f.departmentId ? { departmentId: f.departmentId, isAnonymous: false } : {}),
      ...(f.categoryId ? { categoryId: f.categoryId } : {}),
    },
    select: {
      id: true,
      code: true,
      title: true,
      type: true,
      status: true,
      priority: true,
      createdAt: true,
      firstResponseAt: true,
      firstResponseDueAt: true,
      dueAt: true,
      resolvedAt: true,
      decision: true,
      decisionAt: true,
      supportersCount: true,
      isAnonymous: true,
      category: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true, title: true } },
    },
  });

  const total = issues.length;
  const open = issues.filter((i) => OPEN_STATUSES.includes(i.status));
  const responded = issues.filter((i) => i.firstResponseAt);
  const resolvedWithDecision = issues.filter((i) => RESOLVED_STATUSES.includes(i.status) && i.decision);
  const overdue = open.filter((i) => i.dueAt < now || (!i.firstResponseAt && i.firstResponseDueAt < now));
  const responseHours = responded.map((i) => (i.firstResponseAt!.getTime() - i.createdAt.getTime()) / HOUR);
  const avgFirstResponseHours = responseHours.length ? responseHours.reduce((a, b) => a + b, 0) / responseHours.length : null;
  const sortedRH = [...responseHours].sort((a, b) => a - b);
  const medianFirstResponseHours = sortedRH.length ? sortedRH[Math.floor(sortedRH.length / 2)] : null;
  const onTime = responded.filter((i) => i.firstResponseAt! <= i.firstResponseDueAt).length;
  const resolutionDays = issues
    .filter((i) => i.resolvedAt)
    .map((i) => (i.resolvedAt!.getTime() - i.createdAt.getTime()) / DAY);

  const byType = (["PROBLEM", "IDEA", "PRAISE"] as IssueType[]).map((t) => ({ type: t, count: issues.filter((i) => i.type === t).length }));
  const byStatus = STATUS_ORDER.map((s: IssueStatus) => ({ status: s, count: issues.filter((i) => i.status === s).length }));

  const group = (key: (i: (typeof issues)[number]) => { id: string; name: string } | null) => {
    const m = new Map<string, { id: string; name: string; total: number; open: number; overdue: number; resolved: number }>();
    for (const i of issues) {
      const g = key(i);
      if (!g) continue;
      const row = m.get(g.id) ?? { id: g.id, name: g.name, total: 0, open: 0, overdue: 0, resolved: 0 };
      row.total++;
      if (OPEN_STATUSES.includes(i.status)) row.open++;
      if (RESOLVED_STATUSES.includes(i.status)) row.resolved++;
      if (overdue.includes(i)) row.overdue++;
      m.set(g.id, row);
    }
    return [...m.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, "ru"));
  };

  const byCategory = group((i) => i.category);
  const byDepartment = group((i) => (i.isAnonymous ? { id: "anon", name: "Анонимно" } : i.department));

  const byAssignee = (() => {
    const m = new Map<string, { id: string; name: string; title: string; open: number; overdue: number; resolved: number; responseHours: number[] }>();
    for (const i of issues) {
      if (!i.assignee) continue;
      const r = m.get(i.assignee.id) ?? { ...i.assignee, open: 0, overdue: 0, resolved: 0, responseHours: [] };
      if (OPEN_STATUSES.includes(i.status)) r.open++;
      if (RESOLVED_STATUSES.includes(i.status)) r.resolved++;
      if (overdue.includes(i)) r.overdue++;
      if (i.firstResponseAt) r.responseHours.push((i.firstResponseAt.getTime() - i.createdAt.getTime()) / HOUR);
      m.set(i.assignee.id, r);
    }
    return [...m.values()]
      .map(({ responseHours: rh, ...r }) => ({ ...r, avgResponseHours: rh.length ? rh.reduce((a, b) => a + b, 0) / rh.length : null }))
      .sort((a, b) => b.overdue - a.overdue || b.open - a.open);
  })();

  // Поток: поступило / решено по неделям (последние 10 недель)
  const weeks: { week: string; created: number; resolved: number }[] = [];
  const start = weekStart(new Date(now.getTime() - 9 * 7 * DAY));
  for (let w = 0; w < 10; w++) {
    const from = new Date(start.getTime() + w * 7 * DAY);
    const to = new Date(from.getTime() + 7 * DAY);
    weeks.push({
      week: from.toISOString(),
      created: issues.filter((i) => i.createdAt >= from && i.createdAt < to).length,
      resolved: issues.filter((i) => i.resolvedAt && i.resolvedAt >= from && i.resolvedAt < to).length,
    });
  }

  const implemented = issues
    .filter((i) => i.status === "IMPLEMENTED")
    .sort((a, b) => (b.decisionAt?.getTime() ?? 0) - (a.decisionAt?.getTime() ?? 0))
    .map((i) => ({
      code: i.code,
      title: i.title,
      decision: i.decision,
      decisionAt: i.decisionAt?.toISOString() ?? null,
      category: i.category.name,
      daysToResult: i.resolvedAt ? Math.round((i.resolvedAt.getTime() - i.createdAt.getTime()) / DAY) : null,
    }));

  const corpus = await loadCorpus({ id: { in: issues.map((i) => i.id) } });
  const themes = localThemes(corpus).map((t) => ({
    ...t,
    statuses: t.issueIds.map((id) => issues.find((i) => i.id === id)?.status),
  }));

  return {
    generatedAt: now.toISOString(),
    filters: f,
    totals: {
      total,
      open: open.length,
      overdue: overdue.length,
      reactionOverdue: open.filter((i) => !i.firstResponseAt && i.firstResponseDueAt < now).length,
      responded: responded.length,
      respondedShare: total ? responded.length / total : 0,
      resolved: issues.filter((i) => RESOLVED_STATUSES.includes(i.status)).length,
      resolvedWithDecision: resolvedWithDecision.length,
      resolvedWithDecisionShare: total ? resolvedWithDecision.length / total : 0,
      implemented: implemented.length,
      rejected: issues.filter((i) => i.status === "REJECTED").length,
      avgFirstResponseHours,
      medianFirstResponseHours,
      firstResponseOnTimeShare: responded.length ? onTime / responded.length : null,
      avgResolutionDays: resolutionDays.length ? resolutionDays.reduce((a, b) => a + b, 0) / resolutionDays.length : null,
      supporters: issues.reduce((s, i) => s + i.supportersCount, 0),
    },
    byType,
    byStatus,
    byCategory,
    byDepartment,
    byAssignee,
    weeks,
    implemented,
    themes,
  };
}
export type Analytics = Awaited<ReturnType<typeof computeAnalytics>>;
