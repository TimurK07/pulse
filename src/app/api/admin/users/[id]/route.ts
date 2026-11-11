import { route, readJson, badRequest } from "@/lib/api";
import { db } from "@/lib/db";
import { z } from "zod";
import { resolveRoute } from "@/lib/routing";
import { managerIds, notify } from "@/lib/services/notifications";
import { OPEN_STATUSES } from "@/lib/domain";

async function rerouteOpenIssues(userId: string, userName: string, actorId: string, reason: string) {
  const open = await db.issue.findMany({
    where: { assigneeId: userId, status: { in: OPEN_STATUSES } },
    select: { id: true, code: true, title: true, categoryId: true, type: true, departmentId: true, isAnonymous: true, authorId: true },
  });
  for (const i of open) {
    const route = await resolveRoute({ categoryId: i.categoryId, type: i.type, authorId: i.authorId, authorDepartmentId: i.departmentId, isAnonymous: i.isAnonymous });
    const next = route.assigneeId !== userId ? route.assigneeId : null;
    await db.$transaction([
      // только если обращение всё ещё на этом сотруднике (его могли переназначить параллельно)
      db.issue.updateMany({ where: { id: i.id, assigneeId: userId }, data: { assigneeId: next, routingNote: `${userName}: ${reason}. ${route.note}` } }),
      db.issueEvent.create({ data: { issueId: i.id, actorId, type: "ASSIGNED", fromValue: userName, toValue: next ? route.assigneeName : null, note: `Ответственный ${reason} — обращение перемаршрутизировано` } }),
    ]);
    if (next) await notify([next], { issueId: i.id, title: `Вам передано обращение ${i.code}`, body: i.title }, { exclude: actorId });
    // без ответственного обращение не должно остаться незамеченным
    else await notify(await managerIds(), { issueId: i.id, title: `${i.code}: нет доступного ответственного`, body: route.note }, { exclude: actorId });
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
    const target = await db.user.findUnique({ where: { id }, select: { role: true, isActive: true } });
    if (!target) throw badRequest("Пользователь не найден");
    // в системе всегда остаётся хотя бы один активный администратор
    if (target.role === "ADMIN" && ((input.role && input.role !== "ADMIN") || input.isActive === false)) {
      const admins = await db.user.count({ where: { role: "ADMIN", isActive: true, id: { not: id } } });
      if (!admins) throw badRequest("Это последний активный администратор");
    }
    if (input.role === "EMPLOYEE") {
      const rules = await db.routingRule.count({ where: { OR: [{ primaryId: id }, { backupId: id }] } });
      if (rules) throw badRequest("Пользователь указан в правилах маршрутизации — сначала замените его там");
    }
    const updated = await db.user.update({ where: { id }, data: input, select: { id: true, role: true, isActive: true, isAvailable: true, name: true } });
    // Открытые обращения деактивированного сотрудника (или лишённого роли обработчика) не должны «зависнуть»
    let rerouted = 0;
    if (input.isActive === false) rerouted = await rerouteOpenIssues(id, updated.name, user.id, "деактивирован");
    else if (input.role === "EMPLOYEE") rerouted = await rerouteOpenIssues(id, updated.name, user.id, "больше не обрабатывает обращения");
    return { user: updated, rerouted };
  },
  { roles: ["ADMIN"] },
);
