import { route, badRequest, forbidden, notFound, ApiError } from "@/lib/api";
import { db } from "@/lib/db";
import { ALLOWED_MIME, LIMITS, RESOLVED_STATUSES } from "@/lib/domain";
import { accessContext } from "@/lib/services/issues";
import { issueAccess } from "@/lib/permissions";
import { saveFile, sniffOk } from "@/lib/storage";
import { notify } from "@/lib/services/notifications";

export const POST = route<RouteContext<"/api/issues/[code]/attachments">>(async ({ req, user, ctx }) => {
  const { code } = await ctx.params;
  const issue = await db.issue.findUnique({ where: { code: decodeURIComponent(code) }, include: { _count: { select: { attachments: true } } } });
  if (!issue) throw notFound("Обращение");
  const access = issueAccess(user, issue, await accessContext(user));
  if (access !== "handler" && access !== "author") throw notFound("Обращение");
  if (RESOLVED_STATUSES.includes(issue.status)) throw forbidden("Обращение закрыто — файлы добавить нельзя");

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > LIMITS.attachmentMaxBytes * LIMITS.attachmentsPerIssue + 1024 * 1024) {
    throw new ApiError(413, "Слишком большой запрос: не больше 10 МБ на файл", "too_large");
  }
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (!files.length) throw badRequest("Файл не передан");
  if (issue._count.attachments + files.length > LIMITS.attachmentsPerIssue) {
    throw badRequest(`Не больше ${LIMITS.attachmentsPerIssue} файлов на обращение`);
  }
  const saved = [];
  for (const f of files) {
    if (f.size > LIMITS.attachmentMaxBytes) throw badRequest(`«${f.name}»: файл больше 10 МБ`);
    if (!ALLOWED_MIME[f.type]) throw badRequest(`«${f.name}»: формат не поддерживается (PDF, изображения, Office, TXT, CSV)`);
    const buf = Buffer.from(await f.arrayBuffer());
    if (!sniffOk(buf, f.type)) throw badRequest(`«${f.name}»: содержимое не соответствует формату`);
    const storageKey = await saveFile(buf);
    const name = f.name.replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 180);
    const a = await db.attachment.create({
      data: { issueId: issue.id, uploaderId: user.id, fileName: name, mimeType: f.type, size: f.size, storageKey },
    });
    await db.issueEvent.create({ data: { issueId: issue.id, actorId: user.id, type: "ATTACHMENT_ADDED", toValue: name } });
    saved.push({ id: a.id, fileName: a.fileName, size: a.size, mimeType: a.mimeType });
  }
  if (access === "author") {
    await notify([issue.assigneeId], { issueId: issue.id, title: `${issue.code}: автор добавил материалы`, body: saved.map((s) => s.fileName).join(", ") }, { exclude: user.id });
  }
  return { files: saved };
});
