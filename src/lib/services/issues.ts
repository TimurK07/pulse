import "server-only";
import { Prisma, type Issue, type IssueStatus, type Priority } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiError, badRequest, forbidden, notFound } from "@/lib/api";
import type { CurrentUser } from "@/lib/auth/current-user";
import {
  DEFAULT_SLA,
  OPEN_STATUSES,
  RESOLVED_STATUSES,
  STATUS_LABEL,
  STATUS_REQUIRES_TEXT,
  allowedTransitions,
  formatCode,
} from "@/lib/domain";
import {
  authorVisible,
  canReassign,
  isManagerial,
  issueAccess,
  type AccessContext,
  type IssueAccess,
} from "@/lib/permissions";
import { handledCategoryIds, resolveRoute } from "@/lib/routing";
import { computeDeadlines, type SlaPolicyMap } from "@/lib/sla";
import type { CreateIssueInput, ListQuery } from "@/lib/validation";
import { managerIds, notify } from "./notifications";
import { notifyBitrix, type BitrixEvent } from "@/lib/integrations/bitrix24";

// ───────────────────────── контекст доступа ─────────────────────────

export async function accessContext(user: CurrentUser): Promise<AccessContext> {
  return {
    handledCategoryIds: user.role === "HANDLER" ? await handledCategoryIds(user.id) : [],
    headOfDepartmentId: user.headOf?.id ?? null,
  };
}

/** Where-условие видимости для сотрудников обработки (аналитика ответственного и т. п.) */
export async function visibilityWhere(user: CurrentUser): Promise<Prisma.IssueWhereInput> {
  return staffVisibility(user, await accessContext(user));
}

/** Where-условие видимости очереди для обработчика */
function staffVisibility(user: CurrentUser, ctx: AccessContext): Prisma.IssueWhereInput {
  if (isManagerial(user.role)) return {};
  if (user.role === "HANDLER") {
    const or: Prisma.IssueWhereInput[] = [{ assigneeId: user.id }];
    if (ctx.handledCategoryIds.length) or.push({ categoryId: { in: ctx.handledCategoryIds } });
    if (ctx.headOfDepartmentId) or.push({ departmentId: ctx.headOfDepartmentId, isAnonymous: false });
    return { OR: or };
  }
  return { id: "__none__" };
}

export async function slaPolicy(): Promise<SlaPolicyMap> {
  const rows = await db.slaPolicy.findMany();
  const map = { ...DEFAULT_SLA };
  for (const r of rows) map[r.priority] = { firstResponseHours: r.firstResponseHours, resolutionDays: r.resolutionDays };
  return map;
}

const overdueWhere = (now: Date): Prisma.IssueWhereInput => ({
  status: { in: OPEN_STATUSES },
  OR: [{ dueAt: { lt: now } }, { firstResponseAt: null, firstResponseDueAt: { lt: now } }],
});

// ───────────────────────── список ─────────────────────────

const listInclude = {
  category: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true, title: true } },
  author: { select: { id: true, name: true, title: true } },
  _count: { select: { comments: true, attachments: true } },
} satisfies Prisma.IssueInclude;

type ListRow = Prisma.IssueGetPayload<{ include: typeof listInclude }>;

export function serializeListItem(i: ListRow, viewer: CurrentUser) {
  const own = i.authorId === viewer.id;
  return {
    id: i.id,
    code: i.code,
    type: i.type,
    title: i.title,
    status: i.status,
    priority: i.priority,
    category: i.category,
    assignee: i.assignee,
    author: own || !i.isAnonymous ? { id: i.author.id, name: i.author.name, title: i.author.title } : null,
    // подразделение анонимного автора раскрывает его так же, как имя
    department: own || !i.isAnonymous ? i.department : null,
    isAnonymous: i.isAnonymous,
    isOwn: own,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
    firstResponseDueAt: i.firstResponseDueAt.toISOString(),
    firstResponseAt: i.firstResponseAt?.toISOString() ?? null,
    dueAt: i.dueAt.toISOString(),
    resolvedAt: i.resolvedAt?.toISOString() ?? null,
    supportersCount: i.supportersCount,
    commentsCount: i._count.comments,
    attachmentsCount: i._count.attachments,
  };
}
export type IssueListItem = ReturnType<typeof serializeListItem>;

export async function listIssues(user: CurrentUser, q: ListQuery) {
  const now = new Date();
  const ctx = await accessContext(user);
  const and: Prisma.IssueWhereInput[] = [];

  switch (q.view) {
    case "mine":
      and.push({ authorId: user.id });
      break;
    case "supported":
      and.push({ supporters: { some: { userId: user.id } }, isPrivate: false });
      break;
    default: {
      if (user.role === "EMPLOYEE") {
        and.push({ authorId: user.id });
      } else {
        and.push(staffVisibility(user, ctx));
      }
      if (q.view === "queue") and.push({ assigneeId: user.id, status: { in: OPEN_STATUSES } });
      if (q.view === "open") and.push({ status: { in: OPEN_STATUSES } });
      if (q.view === "resolved") and.push({ status: { in: RESOLVED_STATUSES } });
      if (q.view === "overdue") and.push(overdueWhere(now));
      if (q.view === "no_response") and.push({ status: "NEW", firstResponseAt: null });
      if (q.view === "needs_info") and.push({ status: "NEEDS_INFO" });
      if (q.view === "attention")
        and.push({
          OR: [overdueWhere(now), { status: "NEW" }, { status: "IN_REVIEW", assigneeId: null }],
        });
    }
  }

  if (q.status?.length) and.push({ status: { in: q.status } });
  if (q.type) and.push({ type: q.type });
  if (q.categoryId) and.push({ categoryId: q.categoryId });
  // фильтр по подразделению не должен позволять вычислить анонимного автора
  if (q.departmentId) and.push({ departmentId: q.departmentId, isAnonymous: false });
  if (q.priority) and.push({ priority: q.priority });
  if (q.assignee === "me") and.push({ assigneeId: user.id });
  else if (q.assignee === "none") and.push({ assigneeId: null });
  else if (q.assignee) and.push({ assigneeId: q.assignee });
  if (q.q?.trim()) {
    const s = q.q.trim();
    and.push({
      OR: [
        { code: { contains: s, mode: "insensitive" } },
        { title: { contains: s, mode: "insensitive" } },
        { description: { contains: s, mode: "insensitive" } },
      ],
    });
  }

  const orderBy: Prisma.IssueOrderByWithRelationInput[] =
    q.sort === "created_asc"
      ? [{ createdAt: "asc" }]
      : q.sort === "deadline"
        ? [{ dueAt: "asc" }]
        : q.sort === "priority"
          ? [{ priority: "desc" }, { createdAt: "desc" }]
          : q.sort === "supporters"
            ? [{ supportersCount: "desc" }, { createdAt: "desc" }]
            : [{ createdAt: "desc" }];

  const rows = await db.issue.findMany({ where: { AND: and }, include: listInclude, orderBy, take: q.limit });
  // Prisma сортирует enum по порядку объявления (LOW < MEDIUM < HIGH) — для priority desc это и нужно.
  return rows.map((r) => serializeListItem(r, user));
}

/** Счётчики для бокового меню */
export async function issueCounters(user: CurrentUser) {
  const now = new Date();
  if (user.role === "EMPLOYEE") {
    const [open, needsInfo] = await Promise.all([
      db.issue.count({ where: { authorId: user.id, status: { in: OPEN_STATUSES } } }),
      db.issue.count({ where: { authorId: user.id, status: "NEEDS_INFO" } }),
    ]);
    return { mineOpen: open, needsMyAnswer: needsInfo, queue: 0, overdue: 0, noResponse: 0 };
  }
  const ctx = await accessContext(user);
  const vis = staffVisibility(user, ctx);
  const [queue, overdue, noResponse, mineOpen] = await Promise.all([
    db.issue.count({ where: { assigneeId: user.id, status: { in: OPEN_STATUSES } } }),
    db.issue.count({ where: { AND: [vis, overdueWhere(now)] } }),
    db.issue.count({ where: { AND: [vis, { status: "NEW", firstResponseAt: null }] } }),
    db.issue.count({ where: { authorId: user.id, status: { in: OPEN_STATUSES } } }),
  ]);
  return { mineOpen, needsMyAnswer: 0, queue, overdue, noResponse };
}

// ───────────────────────── карточка ─────────────────────────

const detailInclude = {
  category: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true, title: true } },
  author: { select: { id: true, name: true, title: true } },
  decidedBy: { select: { id: true, name: true, title: true } },
  attachments: { orderBy: { createdAt: "asc" } },
  comments: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, name: true, title: true, role: true } } } },
  events: { orderBy: { createdAt: "asc" }, include: { actor: { select: { id: true, name: true, role: true } } } },
} satisfies Prisma.IssueInclude;

async function loadForAccess(user: CurrentUser, where: Prisma.IssueWhereUniqueInput) {
  const issue = await db.issue.findUnique({ where, include: detailInclude });
  if (!issue) throw notFound("Обращение");
  const ctx = await accessContext(user);
  const supporter =
    user.id !== issue.authorId
      ? await db.supporter.findUnique({ where: { issueId_userId: { issueId: issue.id, userId: user.id } } })
      : null;
  const access = issueAccess(user, issue, { ...ctx, isSupporter: !!supporter });
  // Обращение, которого не видно, неотличимо от несуществующего
  if (access === "none") throw notFound("Обращение");
  return { issue, access, isSupporter: !!supporter };
}

export async function getIssue(user: CurrentUser, code: string) {
  const { issue, access, isSupporter } = await loadForAccess(user, { code });
  return serializeDetail(issue, user, access, isSupporter);
}

type DetailRow = Prisma.IssueGetPayload<{ include: typeof detailInclude }>;

function serializeDetail(i: DetailRow, user: CurrentUser, access: IssueAccess, isSupporter: boolean) {
  const isAuthor = i.authorId === user.id;
  const staff = access === "handler";
  const showAuthor = authorVisible(access, i.isAnonymous, isAuthor);
  const maskName = (id: string | null | undefined, name: string) => (id === i.authorId && !showAuthor ? "Автор обращения" : name);

  const timeline =
    access === "public"
      ? []
      : [
          ...i.comments
            .filter((c) => staff || c.kind !== "INTERNAL")
            .map((c) => ({
              kind: "comment" as const,
              id: c.id,
              commentKind: c.kind,
              body: c.body,
              createdAt: c.createdAt.toISOString(),
              author: {
                id: c.author.id === i.authorId && !showAuthor ? null : c.author.id,
                name: maskName(c.author.id, c.author.name),
                title: c.author.id === i.authorId && !showAuthor ? "" : c.author.title,
                isIssueAuthor: c.author.id === i.authorId,
              },
            })),
          ...i.events
            .filter((e) => staff || !e.internal)
            .map((e) => ({
              kind: "event" as const,
              id: e.id,
              type: e.type,
              fromValue: e.fromValue,
              toValue: e.toValue,
              note: e.note,
              internal: e.internal,
              createdAt: e.createdAt.toISOString(),
              actor: e.actor
                ? { id: e.actor.id === i.authorId && !showAuthor ? null : e.actor.id, name: maskName(e.actor.id, e.actor.name) }
                : null,
            })),
        ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const transitions = staff ? allowedTransitions(i.status, i.type) : [];

  return {
    id: i.id,
    code: i.code,
    type: i.type,
    title: i.title,
    description: i.description,
    proposedSolution: i.proposedSolution,
    status: i.status,
    priority: i.priority,
    category: i.category,
    assignee: i.assignee,
    author: showAuthor ? i.author : null,
    department: showAuthor ? i.department : null,
    isAnonymous: i.isAnonymous,
    isPrivate: i.isPrivate,
    routingNote: staff ? i.routingNote : null,
    createdAt: i.createdAt.toISOString(),
    firstResponseDueAt: i.firstResponseDueAt.toISOString(),
    firstResponseAt: i.firstResponseAt?.toISOString() ?? null,
    dueAt: i.dueAt.toISOString(),
    resolvedAt: i.resolvedAt?.toISOString() ?? null,
    decision: i.decision,
    decisionAt: i.decisionAt?.toISOString() ?? null,
    decidedBy: i.decidedBy,
    supportersCount: i.supportersCount,
    attachments:
      access === "public"
        ? []
        : i.attachments.map((a) => ({ id: a.id, fileName: a.fileName, mimeType: a.mimeType, size: a.size, createdAt: a.createdAt.toISOString() })),
    timeline,
    viewer: {
      access,
      isAuthor,
      isSupporter,
      canProcess: staff,
      canReassign: staff && isManagerial(user.role),
      canTakeOver: staff && user.role === "HANDLER" && i.assigneeId !== user.id,
      transitions,
      canComment: staff || isAuthor,
      canAnswerInfo: isAuthor && i.status === "NEEDS_INFO",
      canSupport: !isAuthor && !i.isPrivate && user.role === "EMPLOYEE",
      canUpload: (staff || isAuthor) && !RESOLVED_STATUSES.includes(i.status),
    },
  };
}
export type IssueDetail = ReturnType<typeof serializeDetail>;

// ───────────────────────── создание ─────────────────────────

export async function createIssue(user: CurrentUser, input: CreateIssueInput) {
  const category = await db.category.findUnique({ where: { id: input.categoryId } });
  if (!category || !category.isActive) throw badRequest("Категория не найдена или отключена");

  const priority: Priority = "MEDIUM"; // приоритет уточняет обработчик; AI может подсказать
  const route = await resolveRoute({ categoryId: category.id, type: input.type, authorDepartmentId: user.departmentId, isAnonymous: input.isAnonymous });
  const now = new Date();
  const deadlines = computeDeadlines(now, priority, await slaPolicy());

  const issue = await db.$transaction(async (tx) => {
    const created = await tx.issue.create({
      data: {
        code: `tmp-${crypto.randomUUID()}`,
        type: input.type,
        title: input.title,
        description: input.description,
        proposedSolution: input.proposedSolution,
        categoryId: category.id,
        departmentId: user.departmentId,
        authorId: user.id,
        isAnonymous: input.isAnonymous,
        isPrivate: input.isPrivate,
        priority,
        assigneeId: route.assigneeId,
        routingNote: route.note,
        ...deadlines,
        createdAt: now,
      },
    });
    const code = formatCode(created.number);
    await tx.issue.update({ where: { id: created.id }, data: { code } });
    await tx.issueEvent.createMany({
      data: [
        { issueId: created.id, actorId: user.id, type: "CREATED", createdAt: now },
        { issueId: created.id, type: "ROUTED", note: route.note, internal: true, createdAt: now },
        ...(route.assigneeId
          ? [{ issueId: created.id, type: "ASSIGNED" as const, toValue: route.assigneeName, createdAt: now }]
          : []),
        ...(input.acknowledgedSimilar?.length
          ? [
              {
                issueId: created.id,
                type: "ROUTED" as const,
                internal: true,
                note: `Автор видел похожие обращения (${input.acknowledgedSimilar.join(", ")}) и подал отдельное`,
                createdAt: now,
              },
            ]
          : []),
      ],
    });
    return { ...created, code };
  });

  await notify([route.assigneeId], {
    issueId: issue.id,
    title: `Новое обращение ${issue.code} назначено вам`,
    body: issue.title,
  });
  if (route.via === "manager_queue" || route.via === "unassigned") {
    await notify(await managerIds(), {
      issueId: issue.id,
      title: `${issue.code}: нет доступного ответственного`,
      body: route.note,
    });
  }
  notifyBitrix({
    kind: "created",
    code: issue.code,
    title: issue.title,
    type: input.type,
    category: category.name,
    assignee: route.assigneeName,
    backup: route.via === "backup",
    isPrivate: input.isPrivate,
  });
  return { code: issue.code, id: issue.id, route };
}

// ───────────────────────── изменение ─────────────────────────

export async function updateIssue(
  user: CurrentUser,
  code: string,
  patch: { status?: IssueStatus; text?: string; priority?: Priority; assigneeId?: string | null; categoryId?: string; dueAt?: string },
) {
  const { issue, access } = await loadForAccess(user, { code });
  if (access !== "handler") throw forbidden("Обрабатывать обращение может только ответственный или руководитель");

  const now = new Date();
  const data: Prisma.IssueUncheckedUpdateManyInput = {};
  const events: Prisma.IssueEventCreateManyInput[] = [];
  const comments: Prisma.CommentCreateManyInput[] = [];
  const notifications: { ids: (string | null)[]; title: string; body?: string }[] = [];
  const bitrix: BitrixEvent[] = [];
  let publicAction = false;

  if (patch.status && patch.status !== issue.status) {
    const allowed = allowedTransitions(issue.status, issue.type);
    if (!allowed.includes(patch.status)) {
      throw badRequest(`Нельзя перевести из «${STATUS_LABEL[issue.status]}» в «${STATUS_LABEL[patch.status]}»`);
    }
    const req = STATUS_REQUIRES_TEXT[patch.status];
    const text = patch.text?.trim() ?? "";
    if (req && text.length < req.min) {
      throw badRequest(`${req.label}: минимум ${req.min} символов`, [{ path: "text", message: `минимум ${req.min} символов` }]);
    }
    data.status = patch.status;
    publicAction = true;
    events.push({ issueId: issue.id, actorId: user.id, type: "STATUS_CHANGED", fromValue: issue.status, toValue: patch.status, createdAt: now });

    if (patch.status === "NEEDS_INFO") {
      comments.push({ issueId: issue.id, authorId: user.id, kind: "INFO_REQUEST", body: text, createdAt: now });
      notifications.push({ ids: [issue.authorId], title: `${issue.code}: нужен ваш ответ`, body: text });
    } else if (RESOLVED_STATUSES.includes(patch.status)) {
      data.decision = text;
      data.decisionAt = now;
      data.decidedById = user.id;
      data.resolvedAt = now;
      events.push({ issueId: issue.id, actorId: user.id, type: "DECISION", toValue: patch.status, note: text, createdAt: now });
      bitrix.push({ kind: "decision", code: issue.code, title: issue.title, status: patch.status, text, by: user.name, isPrivate: issue.isPrivate });
      const supporters = await db.supporter.findMany({ where: { issueId: issue.id }, select: { userId: true } });
      notifications.push({
        ids: [issue.authorId, ...supporters.map((s) => s.userId)],
        title: `${issue.code}: ${STATUS_LABEL[patch.status].toLowerCase()}`,
        body: text,
      });
    } else {
      if (RESOLVED_STATUSES.includes(issue.status)) {
        data.resolvedAt = null; // переоткрытие; прежнее решение остаётся в истории
        data.escalatedAt = null;
        data.reactionEscalatedAt = null;
      }
      if (text) comments.push({ issueId: issue.id, authorId: user.id, kind: "COMMENT", body: text, createdAt: now });
      notifications.push({ ids: [issue.authorId], title: `${issue.code}: статус «${STATUS_LABEL[patch.status]}»`, body: text || issue.title });
    }
  } else if (patch.text?.trim()) {
    throw badRequest("Текст без смены статуса отправляйте комментарием");
  }

  if (patch.priority && patch.priority !== issue.priority) {
    data.priority = patch.priority;
    events.push({ issueId: issue.id, actorId: user.id, type: "PRIORITY_CHANGED", fromValue: issue.priority, toValue: patch.priority, internal: true, createdAt: now });
    // Сроки пересчитываются от даты подачи, если их не меняли вручную
    const d = computeDeadlines(issue.createdAt, patch.priority, await slaPolicy());
    if (!issue.firstResponseAt) data.firstResponseDueAt = d.firstResponseDueAt;
    if (!patch.dueAt) data.dueAt = d.dueAt;
  }

  if (patch.dueAt) {
    // срок решения меняет руководитель: ответственный не может сам «отодвинуть» свою просрочку
    if (!isManagerial(user.role)) throw forbidden("Срок решения может изменить только руководитель");
    const due = new Date(patch.dueAt);
    if (due.getTime() < issue.createdAt.getTime()) throw badRequest("Срок не может быть раньше даты подачи");
    data.dueAt = due;
    data.escalatedAt = null;
    events.push({ issueId: issue.id, actorId: user.id, type: "DUE_CHANGED", fromValue: issue.dueAt.toISOString(), toValue: due.toISOString(), createdAt: now });
  }

  if (patch.categoryId && patch.categoryId !== issue.categoryId) {
    const cat = await db.category.findUnique({ where: { id: patch.categoryId } });
    if (!cat || !cat.isActive) throw badRequest("Категория не найдена");
    data.categoryId = cat.id;
    events.push({ issueId: issue.id, actorId: user.id, type: "CATEGORY_CHANGED", fromValue: issue.category.name, toValue: cat.name, createdAt: now });
  }

  if (patch.assigneeId !== undefined && patch.assigneeId !== issue.assigneeId) {
    if (!canReassign(user, access, patch.assigneeId)) throw forbidden("Переназначать может руководитель; ответственный может только взять обращение себе");
    if (patch.assigneeId === null) {
      data.assigneeId = null;
      events.push({ issueId: issue.id, actorId: user.id, type: "ASSIGNED", fromValue: issue.assignee?.name ?? null, toValue: null, createdAt: now });
      bitrix.push({ kind: "assigned", code: issue.code, title: issue.title, to: null, isPrivate: issue.isPrivate });
    } else {
      const target = await db.user.findUnique({ where: { id: patch.assigneeId } });
      if (!target || !target.isActive || target.role === "EMPLOYEE") throw badRequest("Нельзя назначить этого пользователя");
      data.assigneeId = target.id;
      events.push({ issueId: issue.id, actorId: user.id, type: "ASSIGNED", fromValue: issue.assignee?.name ?? null, toValue: target.name, createdAt: now });
      notifications.push({ ids: [target.id], title: `Вам назначено обращение ${issue.code}`, body: issue.title });
      bitrix.push({ kind: "assigned", code: issue.code, title: issue.title, to: target.name, isPrivate: issue.isPrivate });
    }
  }

  if (publicAction && !issue.firstResponseAt) data.firstResponseAt = now;

  if (!events.length) return { ok: true, unchanged: true };
  data.updatedAt = now;

  // Оптимистичная блокировка: если статус успели изменить параллельно — 409, а не тихая перезапись
  await db.$transaction(async (tx) => {
    const r = await tx.issue.updateMany({ where: { id: issue.id, ...(patch.status ? { status: issue.status } : {}) }, data });
    if (r.count === 0) throw new ApiError(409, "Обращение только что изменил другой сотрудник. Обновите страницу и повторите.", "conflict");
    await tx.issueEvent.createMany({ data: events });
    if (comments.length) await tx.comment.createMany({ data: comments });
  });
  for (const n of notifications) await notify(n.ids, { issueId: issue.id, title: n.title, body: n.body }, { exclude: user.id });
  bitrix.forEach(notifyBitrix); // только после успешной записи в БД
  return { ok: true };
}

// ───────────────────────── комментарии ─────────────────────────

export async function addComment(user: CurrentUser, code: string, input: { body: string; kind: "COMMENT" | "INTERNAL" }) {
  const { issue, access } = await loadForAccess(user, { code });
  const now = new Date();
  const isAuthor = issue.authorId === user.id;

  if (access === "handler") {
    await db.$transaction([
      db.comment.create({ data: { issueId: issue.id, authorId: user.id, kind: input.kind, body: input.body, createdAt: now } }),
      ...(input.kind === "COMMENT" && !issue.firstResponseAt
        ? [db.issue.update({ where: { id: issue.id }, data: { firstResponseAt: now } })]
        : [db.issue.update({ where: { id: issue.id }, data: { updatedAt: now } })]),
    ]);
    if (input.kind === "COMMENT") {
      await notify([issue.authorId], { issueId: issue.id, title: `${issue.code}: новый ответ`, body: input.body.slice(0, 200) }, { exclude: user.id });
    }
    return { ok: true };
  }

  if (!isAuthor) throw forbidden("Комментировать может автор обращения или ответственный");
  if (input.kind === "INTERNAL") throw forbidden("Внутренние заметки доступны только обработчикам");
  if (RESOLVED_STATUSES.includes(issue.status)) throw badRequest("Обращение закрыто. Если вопрос остался — создайте новое обращение.");

  const answeringInfo = issue.status === "NEEDS_INFO";
  await db.$transaction([
    db.comment.create({
      data: { issueId: issue.id, authorId: user.id, kind: answeringInfo ? "INFO_RESPONSE" : "COMMENT", body: input.body, createdAt: now },
    }),
    ...(answeringInfo
      ? [
          db.issue.update({ where: { id: issue.id }, data: { status: "IN_REVIEW" } }),
          db.issueEvent.create({
            data: { issueId: issue.id, actorId: user.id, type: "STATUS_CHANGED", fromValue: "NEEDS_INFO", toValue: "IN_REVIEW", note: "Автор ответил на уточнение", createdAt: now },
          }),
        ]
      : [db.issue.update({ where: { id: issue.id }, data: { updatedAt: now } })]),
  ]);
  await notify(
    [issue.assigneeId],
    {
      issueId: issue.id,
      title: answeringInfo ? `${issue.code}: автор ответил на уточнение` : `${issue.code}: комментарий автора`,
      body: input.body.slice(0, 200),
    },
    { exclude: user.id },
  );
  if (answeringInfo) {
    notifyBitrix({ kind: "info_answered", code: issue.code, title: issue.title, assignee: issue.assignee?.name ?? null, isPrivate: issue.isPrivate });
  }
  return { ok: true, statusChanged: answeringInfo };
}

// ───────────────────────── поддержка ─────────────────────────

export async function toggleSupport(user: CurrentUser, code: string) {
  const issue = await db.issue.findUnique({ where: { code } });
  if (!issue || issue.isPrivate) throw notFound("Обращение");
  if (issue.authorId === user.id) throw badRequest("Нельзя поддержать собственное обращение");
  const existing = await db.supporter.findUnique({ where: { issueId_userId: { issueId: issue.id, userId: user.id } } });
  if (existing) {
    await db.$transaction([
      db.supporter.delete({ where: { issueId_userId: { issueId: issue.id, userId: user.id } } }),
      db.issue.update({ where: { id: issue.id }, data: { supportersCount: { decrement: 1 } } }),
    ]);
    return { supported: false };
  }
  await db.$transaction([
    db.supporter.create({ data: { issueId: issue.id, userId: user.id } }),
    db.issue.update({ where: { id: issue.id }, data: { supportersCount: { increment: 1 } } }),
    db.issueEvent.create({ data: { issueId: issue.id, actorId: user.id, type: "SUPPORTED", internal: true } }),
  ]);
  return { supported: true };
}

// ───────────────────────── контроль сроков ─────────────────────────

let lastSweep = 0;

/**
 * Эскалация просроченных обращений: событие в истории + уведомление
 * ответственному и руководителям. Вызывается лениво (не чаще раза в 2 минуты)
 * при открытии очереди/пульса и доступна как POST /api/cron/sla для планировщика.
 */
export async function sweepSla(force = false) {
  if (!force && Date.now() - lastSweep < 120_000) return { escalated: 0 };
  lastSweep = Date.now();
  const now = new Date();
  const candidates = await db.issue.findMany({
    where: {
      status: { in: OPEN_STATUSES },
      OR: [
        { firstResponseAt: null, firstResponseDueAt: { lt: now }, reactionEscalatedAt: null },
        { dueAt: { lt: now }, escalatedAt: null },
      ],
    },
  });
  if (!candidates.length) return { escalated: 0 };
  const managers = await managerIds();
  const assigneeIds = [...new Set(candidates.map((c) => c.assigneeId).filter((x): x is string => !!x))];
  const assigneeNames = new Map(
    (await db.user.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]),
  );
  let escalated = 0;
  for (const i of candidates) {
    const kinds: { field: "reactionEscalatedAt" | "escalatedAt"; note: string }[] = [];
    if (!i.firstResponseAt && i.firstResponseDueAt < now && !i.reactionEscalatedAt) kinds.push({ field: "reactionEscalatedAt", note: "Просрочен срок первой реакции" });
    if (i.dueAt < now && !i.escalatedAt) kinds.push({ field: "escalatedAt", note: "Просрочен срок решения" });
    for (const k of kinds) {
      // Идемпотентно: эскалирует только тот, кто первым «занял» отметку (несколько процессов, cron + запросы)
      const claimed = await db.issue.updateMany({ where: { id: i.id, [k.field]: null }, data: { [k.field]: now } });
      if (claimed.count === 0) continue;
      await db.issueEvent.create({ data: { issueId: i.id, type: "ESCALATED", note: k.note, internal: true, createdAt: now } });
      await notify([i.assigneeId, ...managers], { issueId: i.id, title: `${i.code}: ${k.note.toLowerCase()}`, body: i.title });
      notifyBitrix({ kind: "escalated", code: i.code, title: i.title, note: k.note, assignee: assigneeNames.get(i.assigneeId ?? "") ?? null, isPrivate: i.isPrivate });
      escalated++;
    }
  }
  return { escalated };
}

export function isIssueOverdue(i: Pick<Issue, "status" | "dueAt" | "firstResponseAt" | "firstResponseDueAt">, now = new Date()) {
  return OPEN_STATUSES.includes(i.status) && (i.dueAt < now || (!i.firstResponseAt && i.firstResponseDueAt < now));
}

export { ApiError };
