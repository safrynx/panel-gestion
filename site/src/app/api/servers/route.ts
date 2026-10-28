import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { getIdentity, listAccessibleServers, requirePlatformOwnerApi } from "@/lib/auth";
import { createServer } from "@/lib/servers";

export const runtime = "nodejs";

const createSchema = z.object({
  name: z.string().trim().min(2).max(60),
  guildId: z.string().regex(/^\d{17,20}$/).nullable().optional()
});

/** GET /api/servers — the servers the logged-in user can open. */
export async function GET() {
  const identity = await getIdentity();
  if (!identity) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const servers = await listAccessibleServers(identity);
  return NextResponse.json({ servers: servers.map((s) => ({ id: s.id, name: s.name, guildId: s.guildId })) });
}

/** POST /api/servers — register a new server (platform owners only); its creator becomes its owner. */
export async function POST(req: NextRequest) {
  const guard = await requirePlatformOwnerApi();
  if ("error" in guard) return guard.error;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation", issues: parsed.error.issues }, { status: 400 });

  const result = await createServer({ name: parsed.data.name, guildId: parsed.data.guildId ?? null, createdBy: guard.identity.discordId });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  await audit(result.server.id, { discordId: guard.identity.discordId, username: guard.identity.username }, "server_create", null, {
    nom: result.server.name, guilde: result.server.guildId
  });
  return NextResponse.json({ ok: true, server: result.server });
}
