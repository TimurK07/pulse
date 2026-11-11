import { route } from "@/lib/api";
import { bitrixStatus } from "@/lib/integrations/bitrix24";

// Состояние интеграций без раскрытия секретов (адрес вебхука маскируется)
export const GET = route(async () => ({ bitrix24: bitrixStatus() }), { roles: ["ADMIN"] });
