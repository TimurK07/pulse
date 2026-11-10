import { route, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { z } from "zod";

const schema = z.object({
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]),
  firstResponseHours: z.number().int().min(1).max(24 * 30),
  resolutionDays: z.number().int().min(1).max(365),
});

// Новые сроки применяются к обращениям, поданным после изменения
export const PUT = route(
  async ({ req }) => {
    const s = schema.parse(await readJson(req));
    return { sla: await db.slaPolicy.upsert({ where: { priority: s.priority }, create: s, update: s }) };
  },
  { roles: ["ADMIN"] },
);
