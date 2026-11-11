import { route, readJson } from "@/lib/api";
import { themeDecisionSchema } from "@/lib/validation";
import { decideTheme } from "@/lib/services/themes";

/** Системное решение по повторяющейся теме — сразу по всем её открытым обращениям */
export const POST = route(
  async ({ req, user }) => decideTheme(user, themeDecisionSchema.parse(await readJson(req))),
  { roles: ["MANAGER", "ADMIN"] },
);
