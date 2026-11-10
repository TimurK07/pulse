import { route, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { z } from "zod";
import { aiStatus } from "@/lib/ai/runtime";

export const GET = route(async () => aiStatus(), { roles: ["ADMIN", "MANAGER"] });

export const PATCH = route(
  async ({ req }) => {
    const { enabled } = z.object({ enabled: z.boolean() }).parse(await readJson(req));
    await db.setting.upsert({ where: { key: "ai.enabled" }, create: { key: "ai.enabled", value: enabled }, update: { value: enabled } });
    return aiStatus();
  },
  { roles: ["ADMIN"] },
);
