import { route, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { z } from "zod";

export const GET = route(async ({ user }) => {
  const items = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { issue: { select: { code: true } } },
  });
  return {
    items: items.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      code: n.issue?.code ?? null,
      read: !!n.readAt,
      createdAt: n.createdAt.toISOString(),
    })),
    unread: items.filter((n) => !n.readAt).length,
  };
});

const markSchema = z.object({ ids: z.array(z.string()).max(100).optional(), all: z.boolean().optional() });

export const POST = route(async ({ req, user }) => {
  const { ids, all } = markSchema.parse(await readJson(req));
  await db.notification.updateMany({
    where: { userId: user.id, readAt: null, ...(all ? {} : { id: { in: ids ?? [] } }) },
    data: { readAt: new Date() },
  });
  return { ok: true };
});
