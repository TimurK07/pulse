import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, z } from "zod";

z.config(z.locales.ru());
import { Prisma } from "@prisma/client";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/current-user";
import type { Role } from "@/lib/domain";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "error",
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (message = "Объект не найден") => new ApiError(404, message, "not_found");
export const forbidden = (msg = "Недостаточно прав для этого действия") => new ApiError(403, msg, "forbidden");
export const badRequest = (msg: string, details?: unknown) => new ApiError(400, msg, "bad_request", details);

type Handler<Ctx> = (args: { req: NextRequest; user: CurrentUser; ctx: Ctx }) => Promise<unknown>;

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Защита от CSRF: мутирующие запросы принимаем только с собственного origin */
export function sameOrigin(req: NextRequest) {
  // Современные браузеры помечают межсайтовые запросы — это надёжнее Origin
  if (req.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = req.headers.get("origin");
  if (!origin) return true; // не-браузерные клиенты (curl, тесты) — cookie всё равно sameSite=lax
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (originHost === host) return true;
  // за обратным прокси без проброса Host (nginx proxy_pass по умолчанию) сверяем с публичным адресом
  const pub = process.env.PULSE_PUBLIC_URL?.trim();
  if (!pub) return false;
  try {
    return new URL(pub).host === originHost;
  } catch {
    return false;
  }
}

/**
 * IP клиента. X-Forwarded-For учитывается только за доверенным прокси
 * (TRUST_PROXY=true), иначе заголовок может подделать сам клиент.
 */
export function clientIp(req: NextRequest) {
  // На Vercel заголовки выставляет платформа; в остальных случаях им можно верить только за своим прокси
  if (process.env.TRUST_PROXY === "true" || process.env.VERCEL === "1") {
    const xff = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (xff) return xff;
    const real = req.headers.get("x-real-ip")?.trim();
    if (real) return real;
  }
  return "direct";
}

export function toErrorResponse(err: unknown) {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: { message: err.message, code: err.code, details: err.details } }, { status: err.status });
  }
  if (err instanceof ZodError) {
    const issues = err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    return NextResponse.json(
      { error: { message: issues[0]?.message ?? "Некорректные данные", code: "validation", details: issues } },
      { status: 400 },
    );
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
    return NextResponse.json({ error: { message: "Объект не найден", code: "not_found" } }, { status: 404 });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    return NextResponse.json({ error: { message: "Такая запись уже существует", code: "conflict" } }, { status: 409 });
  }
  if (err instanceof SyntaxError) {
    return NextResponse.json({ error: { message: "Некорректный JSON в запросе", code: "bad_json" } }, { status: 400 });
  }
  console.error("[api] unhandled error", err);
  return NextResponse.json(
    { error: { message: "Внутренняя ошибка сервера. Попробуйте ещё раз.", code: "internal" } },
    { status: 500 },
  );
}

/**
 * Обёртка обработчика API: аутентификация, проверка роли, CSRF-защита,
 * единый формат ошибок.
 */
export function route<Ctx = unknown>(handler: Handler<Ctx>, opts: { roles?: Role[] } = {}) {
  return async (req: NextRequest, ctx: Ctx) => {
    try {
      if (MUTATING.has(req.method) && !sameOrigin(req)) throw forbidden("Запрос с чужого источника отклонён");
      const user = await getCurrentUser();
      if (!user) throw new ApiError(401, "Требуется вход в систему", "unauthorized");
      if (opts.roles && !opts.roles.includes(user.role)) throw forbidden();
      const result = await handler({ req, user, ctx });
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

/** JSON-тела API небольшие: всё, что больше, отклоняем до чтения в память */
const MAX_JSON_BYTES = 256 * 1024;

export async function readJson(req: NextRequest) {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_JSON_BYTES) throw new ApiError(413, "Слишком большой запрос", "too_large");
  const text = await req.text();
  if (text.length > MAX_JSON_BYTES) throw new ApiError(413, "Слишком большой запрос", "too_large");
  if (!text) return {};
  return JSON.parse(text);
}
