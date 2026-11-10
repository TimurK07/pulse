import { route } from "@/lib/api";
import { db } from "@/lib/db";
import { issueCounters } from "@/lib/services/issues";

export const GET = route(async ({ user }) => {
  const [counters, unread] = await Promise.all([
    issueCounters(user),
    db.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  return { user, counters, unread };
});
