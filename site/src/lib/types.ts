export type BadgeColor = "red" | "yellow" | "green" | "blue";

export type AuthState =
  | { status: "authenticated"; user: SessionUser }
  | { status: "unauthenticated" }
  | { status: "forbidden"; reason: string }
  | { status: "misconfigured"; missing: string[] }
  | { status: "error"; message: string };

export type SessionUser = {
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
