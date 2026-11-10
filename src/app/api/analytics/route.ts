import { route } from "@/lib/api";
import { computeAnalytics } from "@/lib/services/analytics";
import { sweepSla, visibilityWhere } from "@/lib/services/issues";

export const GET = route(
  async ({ req, user }) => {
    const sp = req.nextUrl.searchParams;
    const period = Number(sp.get("period") ?? 0);
    await sweepSla();
    // Ответственный видит аналитику только по обращениям, к которым у него есть доступ
    const scope = user.role === "HANDLER" ? await visibilityWhere(user) : {};
    return {
      ...(await computeAnalytics(
        {
          periodDays: Number.isFinite(period) && period > 0 ? Math.min(period, 3650) : undefined,
          departmentId: sp.get("departmentId") || undefined,
          categoryId: sp.get("categoryId") || undefined,
        },
        scope,
      )),
      scope: user.role === "HANDLER" ? "own" : "all",
    };
  },
  { roles: ["HANDLER", "MANAGER", "ADMIN"] },
);
