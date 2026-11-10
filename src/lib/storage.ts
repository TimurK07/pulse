import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Файлы хранятся вне public/: выдаются только через /api/attachments/[id] с проверкой прав.
// В продакшене каталог заменяется объектным хранилищем (S3-совместимым).
const ROOT = path.join(process.cwd(), "uploads");

export async function saveFile(buf: Buffer) {
  await mkdir(ROOT, { recursive: true });
  const key = randomUUID();
  await writeFile(path.join(ROOT, key), buf);
  return key;
}

export async function readStoredFile(key: string) {
  if (!/^[0-9a-f-]{36}$/.test(key) && !/^seed-[a-z0-9-]+$/.test(key)) throw new Error("bad key");
  return readFile(path.join(ROOT, key));
}

/** Проверка сигнатуры файла для бинарных форматов (не доверяем только MIME от браузера) */
export function sniffOk(buf: Buffer, mime: string) {
  const hex = buf.subarray(0, 8).toString("hex");
  if (mime === "application/pdf") return buf.subarray(0, 5).toString() === "%PDF-";
  if (mime === "image/png") return hex.startsWith("89504e47");
  if (mime === "image/jpeg") return hex.startsWith("ffd8ff");
  if (mime === "image/webp") return buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP";
  if (mime.includes("openxmlformats")) return hex.startsWith("504b0304");
  if (mime === "application/msword" || mime === "application/vnd.ms-excel") return hex.startsWith("d0cf11e0");
  if (mime.startsWith("text/")) return !buf.subarray(0, 4096).includes(0);
  return false;
}
