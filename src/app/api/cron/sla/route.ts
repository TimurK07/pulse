import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { sweepSla } from "@/lib/services/issues";

function secretOk(given: string | null) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16 || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Для внешнего планировщика: POST с заголовком x-cron-secret = CRON_SECRET (≥16 символов)
// или GET с Authorization: Bearer CRON_SECRET (так вызывает Vercel Cron).
// Идемпотентно: повторный вызов не эскалирует уже эскалированное.
async function run() {
  try {
    return NextResponse.json(await sweepSla(true));
  } catch (err) {
    console.error("[cron/sla]", err);
    return NextResponse.json({ error: { message: "internal" } }, { status: 500 });
  }
}

const forbiddenRes = () => NextResponse.json({ error: { message: "forbidden" } }, { status: 403 });

export async function POST(req: NextRequest) {
  if (!secretOk(req.headers.get("x-cron-secret"))) return forbiddenRes();
  return run();
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ") || !secretOk(auth.slice(7))) return forbiddenRes();
  return run();
}
