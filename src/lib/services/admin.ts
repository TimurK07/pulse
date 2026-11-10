import "server-only";
import { db } from "@/lib/db";

export async function adminOverview() {
  const [categories, users, departments, sla] = await Promise.all([
    db.category.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        rules: {
          include: {
            primary: { select: { id: true, name: true, isAvailable: true, isActive: true } },
            backup: { select: { id: true, name: true, isAvailable: true, isActive: true } },
          },
        },
        _count: { select: { issues: true } },
      },
    }),
    db.user.findMany({
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        title: true,
        role: true,
        isActive: true,
        isAvailable: true,
        department: { select: { id: true, name: true } },
        headOf: { select: { id: true, name: true } },
        _count: { select: { assignedIssues: { where: { status: { in: ["NEW", "IN_REVIEW", "NEEDS_INFO", "IN_PROGRESS"] } } } } },
      },
    }),
    db.department.findMany({ orderBy: { sortOrder: "asc" }, include: { head: { select: { id: true, name: true } } } }),
    db.slaPolicy.findMany(),
  ]);
  return { categories, users, departments, sla };
}
