import { route } from "@/lib/api";
import { toggleSupport } from "@/lib/services/issues";

export const POST = route<RouteContext<"/api/issues/[code]/support">>(async ({ user, ctx }) => {
  const { code } = await ctx.params;
  return toggleSupport(user, decodeURIComponent(code));
});
