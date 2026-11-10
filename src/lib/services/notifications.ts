import "server-only";
import { db } from "@/lib/db";

export async function notify(
  userIds: (string | null | undefined)[],
  data: { issueId?: string; title: string; body?: string },
  opts: { exclude?: string } = {},
) {
  const ids = [...new Set(userIds.filter((x): x is string => !!x && x !== opts.exclude))];
  if (!ids.length) return;
  await db.notification.createMany({
    data: ids.map((userId) => ({ userId, issueId: data.issueId, title: data.title, body: data.body ?? "" })),
  });
}

export async function managerIds() {
  const managers = await db.user.findMany({ where: { role: "MANAGER", isActive: true }, select: { id: true } });
  return managers.map((m) => m.id);
}
