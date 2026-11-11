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
    // ответ без JSON (например, 413 от хостинга или 502 от прокси) — понятное сообщение по коду
    const fallback =
      res.status === 413
        ? "Файл слишком большой для загрузки"
        : res.status >= 500
          ? "Сервер временно недоступен. Повторите попытку."
          : `Ошибка сервера (${res.status})`;
    throw new ApiClientError(e?.message ?? fallback, res.status, e?.code, e?.details);
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

/**
 * Загрузка вложений по одному файлу на запрос: на serverless-хостинге тело запроса
 * ограничено (Vercel — 4,5 МБ), и ошибка одного файла не отменяет остальные.
 */
export async function uploadFiles(code: string, files: File[]) {
  const failed: { name: string; message: string }[] = [];
  let uploaded = 0;
  for (const f of files) {
    const fd = new FormData();
    fd.append("files", f);
    try {
      await api.post(`/api/issues/${encodeURIComponent(code)}/attachments`, fd);
      uploaded++;
    } catch (e) {
      failed.push({ name: f.name, message: errorMessage(e) });
    }
  }
  return { uploaded, failed };
}
