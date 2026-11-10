import { route, readJson, badRequest } from "@/lib/api";
import { aiTextSchema } from "@/lib/validation";
import { assistDraft } from "@/lib/ai/features";

export const POST = route(async ({ req, user }) => {
  const input = aiTextSchema.parse(await readJson(req));
  if (input.description.trim().length < 20) throw badRequest("Опишите ситуацию подробнее — минимум 20 символов");
  return assistDraft(user, input);
});
