import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { recoverEvents } from "@/lib/ai/processing/worker";
export const runtime = "nodejs";
export const maxDuration = 60;
export const GET = async (request: NextRequest) => {
  const secret = process.env.CRON_SECRET;
  const received = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (
    !secret ||
    Buffer.byteLength(received) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(received), Buffer.from(expected))
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await recoverEvents());
  } catch {
    return NextResponse.json(
      { error: "Recovery unavailable" },
      { status: 503 },
    );
  }
};
