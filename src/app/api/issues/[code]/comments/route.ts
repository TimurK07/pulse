import { route, readJson } from "@/lib/api";
import { commentSchema } from "@/lib/validation";
import { addComment } from "@/lib/services/issues";

export const POST = route<RouteContext<"/api/issues/[code]/comments">>(async ({ req, user, ctx }) => {
  const { code } = await ctx.params;
  const input = commentSchema.parse(await readJson(req));
  return addComment(user, decodeURIComponent(code), input);
});
