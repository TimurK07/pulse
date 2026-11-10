import { route, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { z } from "zod";
import { adminOverview } from "@/lib/services/admin";

export const GET = route(async () => adminOverview(), { roles: ["ADMIN"] });

const createSchema = z.object({
  name: z.string().trim().min(3, "Название: минимум 3 символа").max(60),
  description: z.string().trim().max(300).default(""),
  keywords: z.array(z.string().trim().min(2).max(40)).max(30).default([]),
});

export const POST = route(
  async ({ req }) => {
    const input = createSchema.parse(await readJson(req));
    const max = await db.category.aggregate({ _max: { sortOrder: true } });
    const cat = await db.category.create({ data: { ...input, sortOrder: (max._max.sortOrder ?? 0) + 1 } });
    return { category: cat };
  },
  { roles: ["ADMIN"] },
);
