import { route } from "@/lib/api";
import { generateDigest, latestDigest } from "@/lib/ai/features";

const serialize = (d: Awaited<ReturnType<typeof latestDigest>>) =>
  d ? { id: d.id, source: d.source, model: d.model, content: d.content, issuesCount: d.issuesCount, createdAt: d.createdAt.toISOString() } : null;

// Сводка охватывает все обращения компании — только для руководителя и администратора
export const GET = route(async () => ({ digest: serialize(await latestDigest()) }), { roles: ["MANAGER", "ADMIN"] });

export const POST = route(
  async ({ user }) => {
    const r = await generateDigest(user);
    return { digest: serialize(r?.digest ?? null), reused: r?.reused ?? false };
  },
  { roles: ["MANAGER", "ADMIN"] },
);
