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

// Для внешнего планировщика: POST с заголовком x-cron-secret = CRON_SECRET (≥16 символов).
// Идемпотентно: повторный вызов не эскалирует уже эскалированное.
export async function POST(req: NextRequest) {
  if (!secretOk(req.headers.get("x-cron-secret"))) {
    return NextResponse.json({ error: { message: "forbidden" } }, { status: 403 });
  }
  return NextResponse.json(await sweepSla(true));
}
