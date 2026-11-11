import { route, badRequest } from "@/lib/api";
import { bitrixConfig, bitrixStatus, sendBitrixTest } from "@/lib/integrations/bitrix24";

export const POST = route(
  async () => {
    const cfg = bitrixConfig();
    if (!cfg.enabled) throw badRequest(`Битрикс24 не подключён: ${cfg.problem}`);
    const result = await sendBitrixTest();
    return { result, bitrix24: bitrixStatus() };
  },
  { roles: ["ADMIN"] },
);
