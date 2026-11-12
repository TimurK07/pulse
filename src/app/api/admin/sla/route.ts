import { route, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { slaPolicySchema as schema } from "@/lib/validation";

// Новые сроки применяются к обращениям, поданным после изменения
export const PUT = route(
  async ({ req }) => {
    const s = schema.parse(await readJson(req));
    return { sla: await db.slaPolicy.upsert({ where: { priority: s.priority }, create: s, update: s }) };
  },
  { roles: ["ADMIN"] },
);
