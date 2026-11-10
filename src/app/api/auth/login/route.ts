import { NextResponse, type NextRequest } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { signSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { toErrorResponse, ApiError, sameOrigin, clientIp } from "@/lib/api";

// Хэш для выравнивания времени ответа, когда пользователя нет (защита от перебора email)
const DUMMY_HASH = bcrypt.hashSync("pulse-timing-equalizer", 10);

const schema = z.object({ email: z.email("Введите корректный email"), password: z.string().min(1, "Введите пароль").max(200) });

// Защита от подбора пароля: не больше 8 неудачных попыток за 5 минут для пары IP + email
const failures = new Map<string, { n: number; at: number }>();
const WINDOW = 5 * 60_000;
function locked(key: string) {
  const f = failures.get(key);
  if (!f) return false;
  if (Date.now() - f.at > WINDOW) {
    failures.delete(key);
    return false;
  }
  return f.n >= 8;
}
function fail(key: string) {
  // ограничиваем память: при росте таблицы удаляем истёкшие записи, при переполнении — самые старые
  if (failures.size > 5000) {
    const now = Date.now();
    for (const [k, v] of failures) if (now - v.at > WINDOW) failures.delete(k);
    while (failures.size > 5000) failures.delete(failures.keys().next().value!);
  }
  const f = failures.get(key);
  if (!f || Date.now() - f.at > WINDOW) failures.set(key, { n: 1, at: Date.now() });
  else f.n++;
}

export async function POST(req: NextRequest) {
  try {
    if (!sameOrigin(req)) throw new ApiError(403, "Запрос с чужого источника отклонён", "forbidden");
    const ip = clientIp(req);
    const { email, password } = schema.parse(await req.json());
    const key = `${ip}|${email.toLowerCase()}`;
    if (locked(key)) throw new ApiError(429, "Слишком много неудачных попыток. Повторите через 5 минут.", "rate_limited");
    const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
    const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !user.isActive || !passwordOk) {
      fail(key);
      throw new ApiError(401, "Неверный email или пароль", "invalid_credentials");
    }
    failures.delete(key);
    const token = await signSession({ sub: user.id, role: user.role });
    const res = NextResponse.json({ ok: true, role: user.role });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
    return res;
  } catch (err) {
    return toErrorResponse(err);
  }
}
