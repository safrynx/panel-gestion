import { NextResponse } from "next/server";
import { getIdentity, listAccessibleServers } from "@/lib/auth";
import { isPlatformOwner } from "@/lib/config";

export const runtime = "nodejs";

/** GET /api/auth/me — who is logged in and which servers they can open. */
export async function GET() {
  const identity = await getIdentity();
  if (!identity) return NextResponse.json({ authenticated: false });
  const servers = await listAccessibleServers(identity);
  return NextResponse.json({
    authenticated: true,
    user: identity,
    platformOwner: isPlatformOwner(identity.discordId),
    servers: servers.map((s) => ({ id: s.id, name: s.name }))
  });
}
