export type GradeConfig = { name: string; level: number; discordRoleId: string };

export function canManageGrade(actorLevel: number, targetLevel: number, newLevel: number, isFounder = false): boolean {
  if (isFounder) return true;
  // Strict hierarchy: managers can only act on lower-ranked members and cannot assign
  // a grade equal to or above their own.
  return targetLevel < actorLevel && newLevel < actorLevel;
}

export function parseGradeMapping(raw: string | undefined): GradeConfig[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Record<string, { roleId?: string; level?: number }>;
    return Object.entries(parsed)
      .filter(([, value]) => Boolean(value.roleId) && Number.isFinite(value.level))
      .map(([name, value]) => ({ name, level: Number(value.level), discordRoleId: String(value.roleId) }))
      .sort((a, b) => a.level - b.level);
  } catch {
    return [];
  }
}
