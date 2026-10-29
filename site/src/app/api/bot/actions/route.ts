import { NextRequest } from "next/server";
import { z } from "zod";
import { handleBotRequest } from "@/lib/bot-guard";
import { exchangeBotActions } from "@/lib/security-live";

export const runtime = "nodejs";

const schema = z.object({
  results: z.array(z.object({ id: z.number().int().positive(), ok: z.boolean(), message: z.string().max(500).optional() })).max(100).default([])
});

/** POST /api/bot/actions — the bot reports what it did and gets the actions queued from the panel (lockdown, backups). */
export function POST(req: NextRequest) {
  return handleBotRequest(req, schema, async (data) => ({ actions: await exchangeBotActions(data.results) }));
}
