/** Только относительные пути внутри приложения: защита от открытого редиректа */
export function safeNext(next: unknown, fallback = "/") {
  if (typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\u0000-\u001f]/.test(next)) return fallback;
  if (next.startsWith("/api/") || next.startsWith("/login")) return fallback;
  return next;
}
