// Клиентские вызовы API: единый формат ошибок → понятные сообщения в интерфейсе
export class ApiClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: { path: string; message: string }[],
  ) {
    super(message);
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 401 && typeof window !== "undefined" && !location.pathname.startsWith("/login")) {
    // сессия истекла: полная перезагрузка на страницу входа сбрасывает кэш данных
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* пустой ответ */
  }
  if (!res.ok) {
    const e = (body as { error?: { message?: string; code?: string; details?: { path: string; message: string }[] } })?.error;
    throw new ApiClientError(e?.message ?? `Ошибка сервера (${res.status})`, res.status, e?.code, e?.details);
  }
  return body as T;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...init?.headers } });
  } catch {
    throw new ApiClientError("Нет соединения с сервером. Проверьте сеть и повторите.", 0, "network");
  }
  return parse<T>(res);
}

export const api = {
  get: <T,>(url: string) => request<T>(url),
  post: <T,>(url: string, body?: unknown) => request<T>(url, { method: "POST", body: body instanceof FormData ? body : JSON.stringify(body ?? {}) }),
  patch: <T,>(url: string, body: unknown) => request<T>(url, { method: "PATCH", body: JSON.stringify(body) }),
  put: <T,>(url: string, body: unknown) => request<T>(url, { method: "PUT", body: JSON.stringify(body) }),
  del: <T,>(url: string) => request<T>(url, { method: "DELETE" }),
};

export function errorMessage(e: unknown) {
  return e instanceof Error ? e.message : "Что-то пошло не так";
}

export function qs(params: Record<string, string | string[] | undefined | null>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "") continue;
    if (Array.isArray(v)) v.forEach((x) => sp.append(k, x));
    else sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}
