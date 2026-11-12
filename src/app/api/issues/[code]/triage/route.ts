import { route, notFound, forbidden } from "@/lib/api";
import { db } from "@/lib/db";
import { accessContext } from "@/lib/services/issues";
import { issueAccess } from "@/lib/permissions";
import { triageIssue } from "@/lib/ai/features";
import type { CurrentUser } from "@/lib/auth/current-user";

export const maxDuration = 60;

type Ctx = RouteContext<"/api/issues/[code]/triage">;

async function check(user: CurrentUser, code: string) {
  const issue = await db.issue.findUnique({ where: { code } });
  if (!issue) throw notFound("Обращение не найдено");
  const access = issueAccess(user, issue, await accessContext(user));
  if (access === "none") throw notFound("Обращение не найдено"); // недоступное неотличимо от несуществующего
  if (access !== "handler") throw forbidden("AI-разбор доступен ответственному и руководителю");
}

export const GET = route<Ctx>(async ({ user, ctx }) => {
  const code = decodeURIComponent((await ctx.params).code);
  await check(user, code);
  return { triage: await triageIssue(user, code, { generate: false }) };
});

export const POST = route<Ctx>(async ({ user, ctx }) => {
  const code = decodeURIComponent((await ctx.params).code);
  await check(user, code);
  return { triage: await triageIssue(user, code, { generate: true }) };
});
