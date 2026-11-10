import { route, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().trim().min(3).max(60).optional(),
  description: z.string().trim().max(300).optional(),
  keywords: z.array(z.string().trim().min(2).max(40)).max(30).optional(),
  isActive: z.boolean().optional(),
});

export const PATCH = route<RouteContext<"/api/admin/categories/[id]">>(
  async ({ req, ctx }) => {
    const { id } = await ctx.params;
    const input = patchSchema.parse(await readJson(req));
    return { category: await db.category.update({ where: { id }, data: input }) };
  },
  { roles: ["ADMIN"] },
);
