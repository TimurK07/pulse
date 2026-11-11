import { route, readJson, badRequest } from "@/lib/api";
import { db } from "@/lib/db";
import { z } from "zod";

const schema = z.object({
  categoryId: z.string(),
  issueType: z.enum(["PROBLEM", "IDEA", "PRAISE"]).nullable().default(null),
  mode: z.enum(["FIXED", "AUTHOR_DEPARTMENT_HEAD"]),
  primaryId: z.string().nullable().optional(),
  backupId: z.string().nullable().optional(),
});

export const PUT = route(
  async ({ req }) => {
    const r = schema.parse(await readJson(req));
    if (r.mode === "FIXED" && !r.primaryId) throw badRequest("Укажите основного ответственного");
    if (r.primaryId && r.primaryId === r.backupId) throw badRequest("Резервный ответственный должен отличаться от основного");
    const ids = [r.primaryId, r.backupId].filter((x): x is string => !!x);
    if (ids.length) {
      const users = await db.user.findMany({ where: { id: { in: ids } } });
      if (users.length !== ids.length || users.some((u) => u.role === "EMPLOYEE")) throw badRequest("Ответственным может быть только пользователь с ролью обработчика");
    }
    const data = {
      mode: r.mode,
      primaryId: r.mode === "FIXED" ? (r.primaryId ?? null) : null,
      backupId: r.backupId ?? null,
    };
    const category = await db.category.findUnique({ where: { id: r.categoryId }, select: { id: true } });
    if (!category) throw badRequest("Категория не найдена");
    // уникальность (категория, тип) при типе NULL база не гарантирует — сериализуем запись по категории
    const rule = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"routing:" + r.categoryId}))`;
      const existing = await tx.routingRule.findFirst({ where: { categoryId: r.categoryId, issueType: r.issueType } });
      return existing
        ? tx.routingRule.update({ where: { id: existing.id }, data })
        : tx.routingRule.create({ data: { ...data, categoryId: r.categoryId, issueType: r.issueType } });
    });
    return { rule };
  },
  { roles: ["ADMIN"] },
);

export const DELETE = route(
  async ({ req }) => {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) throw badRequest("Не указано правило");
    const rule = await db.routingRule.findUnique({ where: { id } });
    if (!rule?.issueType) throw badRequest("Основное правило категории удалить нельзя — измените его");
    await db.routingRule.delete({ where: { id } });
    return { ok: true };
  },
  { roles: ["ADMIN"] },
);
