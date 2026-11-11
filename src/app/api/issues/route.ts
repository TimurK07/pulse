import { route, readJson } from "@/lib/api";
import { createIssueSchema, listQuerySchema } from "@/lib/validation";
import { createIssue, listIssues, sweepSla } from "@/lib/services/issues";
import { isStaff } from "@/lib/permissions";

export const GET = route(async ({ req, user }) => {
  const sp = req.nextUrl.searchParams;
  const q = listQuerySchema.parse({
    view: sp.get("view") ?? undefined,
    status: sp.getAll("status").length ? sp.getAll("status") : undefined,
    type: sp.get("type") || undefined,
    categoryId: sp.get("categoryId") || undefined,
    departmentId: sp.get("departmentId") || undefined,
    assignee: sp.get("assignee") || undefined,
    priority: sp.get("priority") || undefined,
    q: sp.get("q") || undefined,
    sort: sp.get("sort") || undefined,
    limit: sp.get("limit") || undefined,
    codes: sp.getAll("code").length ? sp.getAll("code") : undefined,
  });
  if (isStaff(user.role)) await sweepSla();
  return { items: await listIssues(user, q) };
});

export const POST = route(async ({ req, user }) => {
  const input = createIssueSchema.parse(await readJson(req));
  return createIssue(user, input);
});
