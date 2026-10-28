import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { ZodType, ZodTypeDef } from "zod";

/** Constant-time check of `Authorization: Bearer <BOT_API_TOKEN>`. */
export function verifyBotToken(header: string | null): boolean {
  const expected = process.env.BOT_API_TOKEN;
  if (!expected || !header?.startsWith("Bearer ")) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Shared wrapper of the /api/bot/* routes: authenticate, validate the JSON body, run the handler. */
export async function handleBotRequest<T>(
  req: NextRequest,
  schema: ZodType<T, ZodTypeDef, unknown> | null,
  run: (data: T) => unknown | Promise<unknown>
): Promise<NextResponse> {
  if (!verifyBotToken(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let data = undefined as T;
  if (schema) {
    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "validation", issues: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`) }, { status: 400 });
    }
    data = parsed.data;
  }
  try {
    return NextResponse.json({ ok: true, ...(await run(data)) as object });
  } catch (error) {
    console.error("[bot-api]", req.nextUrl.pathname, error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
