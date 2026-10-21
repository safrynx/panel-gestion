import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const row = db.prepare("SELECT 1 AS ok").get() as { ok: number };
  return NextResponse.json({ ok: row.ok === 1, app: "gtasun-staff-manager", stage: "starter" });
}
