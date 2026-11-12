import { route, notFound } from "@/lib/api";
import { db } from "@/lib/db";
import { accessContext } from "@/lib/services/issues";
import { issueAccess } from "@/lib/permissions";
import { readStoredFile } from "@/lib/storage";

export const GET = route<RouteContext<"/api/attachments/[id]">>(async ({ user, ctx }) => {
  const { id } = await ctx.params;
  const a = await db.attachment.findUnique({ where: { id }, include: { issue: true } });
  if (!a) throw notFound("Файл не найден");
  const access = issueAccess(user, a.issue, await accessContext(user));
  if (access !== "handler" && access !== "author") throw notFound("Файл не найден");
  let buf: Buffer;
  try {
    buf = await readStoredFile(a.storageKey);
  } catch {
    throw notFound("Файл не найден");
  }
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": a.mimeType,
      "Content-Length": String(buf.length),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(a.fileName)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
});
