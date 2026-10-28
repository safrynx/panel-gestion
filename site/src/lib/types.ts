export type BadgeColor = "red" | "yellow" | "green" | "blue";

export type AuthState =
  | { status: "authenticated"; user: SessionUser }
  | { status: "unauthenticated" }
  | { status: "forbidden"; reason: string }
  | { status: "misconfigured"; missing: string[] }
  | { status: "error"; message: string };

/** Who is logged in (from the session cookie), independent of any server. */
export type Identity = {
  discordId: string;
  username: string;
  avatarUrl: string | null;
};

/** The logged-in user as seen by one server: their roles, grade and permissions there. */
export type SessionUser = {
  serverId: string;
  /** Owner of this server (or platform owner): every permission, manages the access page. */
  owner: boolean;
  /** Platform owner (env PANEL_OWNER_IDS): every server, creates servers. */
  platformOwner: boolean;
  discordId: string;
  username: string;
  avatarUrl: string | null;
  grade: string;
  gradeLevel: number;
  roles: string[];
  permissions: string[];
};

export type VoiceSessionRow = {
  id: number;
  discord_id: string;
  channel_id: string;
  started_at: string;
  ended_at: string | null;
  seconds: number;
  reconciled: number;
};

export const badgeLabels: Record<BadgeColor, string> = {
  red: "Alerte",
  yellow: "Vigilance",
  green: "Positif",
  blue: "Information"
};
