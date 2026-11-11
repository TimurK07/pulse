import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

// Файлы выдаются только через /api/attachments/[id] с проверкой прав.
// Содержимое хранится в PostgreSQL (таблица FileBlob): у serverless-хостинга (Vercel)
// нет постоянного диска, а VPS не теряет файлы при пересоздании каталога релиза.
// Файлы, загруженные ранними версиями в каталог uploads/, по-прежнему читаются с диска.
const LEGACY_ROOT = path.join(process.cwd(), "uploads");

type Tx = Prisma.TransactionClient;

export async function saveFile(buf: Buffer, tx: Tx = db) {
  const key = randomUUID();
  await tx.fileBlob.create({ data: { key, data: new Uint8Array(buf) } });
  return key;
}

export function validKey(key: string) {
  return /^[0-9a-f-]{36}$/.test(key) || /^seed-[a-z0-9-]+$/.test(key);
}

export async function readStoredFile(key: string): Promise<Buffer> {
  if (!validKey(key)) throw new Error("bad key");
  const blob = await db.fileBlob.findUnique({ where: { key } });
  if (blob) return Buffer.from(blob.data);
  return readFile(path.join(LEGACY_ROOT, key));
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
