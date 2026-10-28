import { NextResponse } from "next/server";
import { getSessionUser, isStaffUser, getActorLevel } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ authenticated: false });
  return NextResponse.json({
    authenticated: true,
    staff: await isStaffUser(user),
    managerLevel: await getActorLevel(user),
    user: { ...user, roles: undefined }
  });
}
