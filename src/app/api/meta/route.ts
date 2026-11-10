import { route } from "@/lib/api";
import { db } from "@/lib/db";
import { isStaff } from "@/lib/permissions";
import { slaPolicy } from "@/lib/services/issues";

export const GET = route(async ({ user }) => {
  const [categories, departments, staff, sla] = await Promise.all([
    db.category.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true, description: true } }),
    db.department.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    isStaff(user.role)
      ? db.user.findMany({
          where: { isActive: true, role: { in: ["HANDLER", "MANAGER", "ADMIN"] } },
          orderBy: { name: "asc" },
          select: { id: true, name: true, title: true, isAvailable: true },
        })
      : Promise.resolve([]),
    slaPolicy(),
  ]);
  return { categories, departments, staff, sla };
});
