import { route, readJson } from "@/lib/api";
import { updateIssueSchema } from "@/lib/validation";
import { getIssue, updateIssue } from "@/lib/services/issues";

type Ctx = RouteContext<"/api/issues/[code]">;

export const GET = route<Ctx>(async ({ user, ctx }) => {
  const { code } = await ctx.params;
  return getIssue(user, decodeURIComponent(code));
});

export const PATCH = route<Ctx>(async ({ req, user, ctx }) => {
  const { code } = await ctx.params;
  const patch = updateIssueSchema.parse(await readJson(req));
  return updateIssue(user, decodeURIComponent(code), patch);
});
