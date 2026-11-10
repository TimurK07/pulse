import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";

// Оптимистичная проверка: без валидной сессии страницы приложения недоступны.
// Полная проверка прав выполняется в каждом API-обработчике на сервере.
export async function proxy(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const { pathname, search } = req.nextUrl;
  // /login всегда доступен: валидность пользователя проверяет сама страница по БД.
  // Иначе устаревшая сессия (пользователь удалён/деактивирован) зациклит редиректы.
  if (pathname === "/login") return NextResponse.next();
  if (!session) {
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.svg|robots.txt).*)"],
};
