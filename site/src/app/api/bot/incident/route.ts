import { NextRequest } from "next/server";
import { handleBotRequest } from "@/lib/bot-guard";
import { applyIncident, incidentSchema } from "@/lib/bot-api";

export const runtime = "nodejs";

/** POST /api/bot/incident — the anti-raid handled something on a guild (what, who, what it undid). */
export function POST(req: NextRequest) {
  return handleBotRequest(req, incidentSchema, applyIncident);
}
