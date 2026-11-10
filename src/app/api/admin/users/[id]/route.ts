import { route, readJson, badRequest } from "@/lib/api";
import { db } from "@/lib/db";
import { z } from "zod";
import { resolveRoute } from "@/lib/routing";
import { notify } from "@/lib/services/notifications";

async function rerouteOpenIssues(userId: string, userName: string, actorId: string) {
  const open = await db.issue.findMany({
    where: { assigneeId: userId, status: { in: ["NEW", "IN_REVIEW", "NEEDS_INFO", "IN_PROGRESS"] } },
    select: { id: true, code: true, title: true, categoryId: true, type: true, departmentId: true, isAnonymous: true },
  });
  for (const i of open) {
    const route = await resolveRoute({ categoryId: i.categoryId, type: i.type, authorDepartmentId: i.departmentId, isAnonymous: i.isAnonymous });
    const next = route.assigneeId !== userId ? route.assigneeId : null;
    await db.$transaction([
      db.issue.update({ where: { id: i.id }, data: { assigneeId: next, routingNote: `${userName} деактивирован. ${route.note}` } }),
      db.issueEvent.create({ data: { issueId: i.id, actorId, type: "ASSIGNED", fromValue: userName, toValue: next ? route.assigneeName : null, note: "Ответственный деактивирован — обращение перемаршрутизировано" } }),
    ]);
    await notify([next], { issueId: i.id, title: `Вам передано обращение ${i.code}`, body: i.title });
  }
  return open.length;
}

const schema = z.object({
  role: z.enum(["EMPLOYEE", "HANDLER", "MANAGER", "ADMIN"]).optional(),
  isActive: z.boolean().optional(),
  isAvailable: z.boolean().optional(),
});

export const PATCH = route<RouteContext<"/api/admin/users/[id]">>(
  async ({ req, user, ctx }) => {
    const { id } = await ctx.params;
    const input = schema.parse(await readJson(req));
    if (id === user.id && (input.role && input.role !== "ADMIN" || input.isActive === false)) {
      throw badRequest("Нельзя лишить себя прав администратора или деактивировать себя");
    }
    if (input.role === "EMPLOYEE") {
      const rules = await db.routingRule.count({ where: { OR: [{ primaryId: id }, { backupId: id }] } });
      if (rules) throw badRequest("Пользователь указан в правилах маршрутизации — сначала замените его там");
    }
    const updated = await db.user.update({ where: { id }, data: input, select: { id: true, role: true, isActive: true, isAvailable: true, name: true } });
    // Открытые обращения деактивированного сотрудника (или лишённого роли обработчика) не должны «зависнуть»
    let rerouted = 0;
    if (input.isActive === false || input.role === "EMPLOYEE") rerouted = await rerouteOpenIssues(id, updated.name, user.id);
    return { user: updated, rerouted };
  },
  { roles: ["ADMIN"] },
);
