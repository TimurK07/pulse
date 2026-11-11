import { route, badRequest } from "@/lib/api";
import { latestDigest } from "@/lib/ai/features";
import type { DigestContent } from "@/lib/ai/local";
import { bitrixConfig, sendBitrixNow } from "@/lib/integrations/bitrix24";

/** Отправить последнюю сводку для руководства в рабочий чат Битрикс24 */
export const POST = route(
  async ({ user }) => {
    const cfg = bitrixConfig();
    if (!cfg.enabled) throw badRequest(`Битрикс24 не подключён: ${cfg.problem}`);
    const d = await latestDigest();
    if (!d) throw badRequest("Сначала сформируйте сводку");
    const c = d.content as unknown as DigestContent;
    const result = await sendBitrixNow({
      kind: "digest",
      headline: c.headline,
      issuesCount: d.issuesCount,
      problems: (c.systemicProblems ?? []).map((p) => ({ title: p.title, codes: p.issueCodes, impact: p.impact, recommendation: p.recommendation })),
      quickWins: c.quickWins?.length ?? 0,
      risks: c.risks?.length ?? 0,
      by: user.name,
    });
    if (!result.ok) throw badRequest(`Не удалось отправить: ${result.reason}`);
    return { ok: true };
  },
  { roles: ["MANAGER", "ADMIN"] },
);
