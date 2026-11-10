import { route } from "@/lib/api";
import { db } from "@/lib/db";

// Доска результатов: реализованные улучшения и принятые решения, видны всем сотрудникам.
// Автор не раскрывается; приватные обращения не показываются.
export const GET = route(async () => {
  const [items, stats] = await Promise.all([
    db.issue.findMany({
      where: { status: { in: ["IMPLEMENTED", "IN_PROGRESS"] }, isPrivate: false },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      select: {
        code: true,
        title: true,
        type: true,
        status: true,
        decision: true,
        decisionAt: true,
        createdAt: true,
        resolvedAt: true,
        supportersCount: true,
        category: { select: { name: true } },
        department: { select: { name: true } },
        isAnonymous: true,
      },
    }),
    db.issue.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  return {
    items: items.map((i) => ({
      ...i,
      department: i.isAnonymous ? null : i.department,
      decisionAt: i.decisionAt?.toISOString() ?? null,
      createdAt: i.createdAt.toISOString(),
      resolvedAt: i.resolvedAt?.toISOString() ?? null,
    })),
    stats: Object.fromEntries(stats.map((s) => [s.status, s._count._all])),
  };
});
