import { ChannelType, OverwriteType, type Guild, type GuildChannelCreateOptions } from "discord.js";
import { attempt, type Action } from "./antiraid";

/**
 * Backups of a guild's structure (roles with their permissions, channels with their permission overwrites, and the
 * roles of each member), stored on the panel. A restore recreates what is missing (matched by id, then by name) and
 * never deletes anything: roles and channels added since stay.
 */

export type BackupRole = { id: string; name: string; color: number; hoist: boolean; mentionable: boolean; permissions: string; position: number; managed: boolean };
export type BackupChannel = {
  id: string; name: string; type: number; parentId: string | null; position: number; topic?: string | null; nsfw?: boolean; bitrate?: number;
  userLimit?: number; rateLimitPerUser?: number; overwrites: { id: string; type: number; allow: string; deny: string }[];
};
export type Backup = { roles: BackupRole[]; channels: BackupChannel[]; members: Record<string, string[]> };

const MAX_MEMBERS = 40_000;

export function snapshot(guild: Guild): Backup {
  const roles = [...guild.roles.cache.values()].map((r) => ({
    id: r.id, name: r.name, color: r.color, hoist: r.hoist, mentionable: r.mentionable, permissions: r.permissions.bitfield.toString(), position: r.position, managed: r.managed
  }));
  const channels = [...guild.channels.cache.values()].flatMap((c): BackupChannel[] => {
    if (c.isThread() || !("permissionOverwrites" in c)) return [];
    return [{
      id: c.id, name: c.name, type: c.type, parentId: c.parentId, position: c.rawPosition,
      topic: "topic" in c ? c.topic : null,
      nsfw: "nsfw" in c ? c.nsfw : undefined,
      bitrate: "bitrate" in c ? c.bitrate : undefined,
      userLimit: "userLimit" in c ? c.userLimit : undefined,
      rateLimitPerUser: "rateLimitPerUser" in c ? c.rateLimitPerUser ?? undefined : undefined,
      overwrites: c.permissionOverwrites.cache.map((o) => ({ id: o.id, type: o.type, allow: o.allow.bitfield.toString(), deny: o.deny.bitfield.toString() }))
    }];
  });
  const members: Record<string, string[]> = {};
  for (const m of [...guild.members.cache.values()].slice(0, MAX_MEMBERS)) {
    if (m.user.bot) continue;
    const ids = m.roles.cache.filter((r) => r.id !== guild.id && !r.managed).map((r) => r.id);
    if (ids.length) members[m.id] = ids;
  }
  return { roles, channels, members };
}

/** Pure: order of creation (categories first, then by position) and the parent each channel needs. */
export function channelOrder(channels: BackupChannel[]): BackupChannel[] {
  return [...channels].sort((a, b) => Number(b.type === ChannelType.GuildCategory) - Number(a.type === ChannelType.GuildCategory) || a.position - b.position);
}

export async function restoreBackup(guild: Guild, data: Backup, reason: string): Promise<{ actions: Action[]; remaps: { from: string; to: string }[] }> {
  const actions: Action[] = [];
  const roleMap = new Map<string, string>();
  const recreated = new Set<string>();
  const remaps: { from: string; to: string }[] = [];

  // @everyone: put its permissions back (a raid often gives it Administrator).
  const everyone = data.roles.find((r) => r.id === guild.id);
  if (everyone && guild.roles.everyone.permissions.bitfield.toString() !== everyone.permissions) {
    actions.push(await attempt("Permissions de @everyone remises", () => guild.roles.everyone.setPermissions(BigInt(everyone.permissions), reason)));
  }

  for (const r of [...data.roles].sort((a, b) => a.position - b.position)) {
    if (r.managed || r.id === guild.id) continue;
    const existing = guild.roles.cache.get(r.id) ?? guild.roles.cache.find((x) => x.name === r.name && !x.managed);
    if (existing) {
      roleMap.set(r.id, existing.id);
      continue;
    }
    const created = await guild.roles.create({ name: r.name, color: r.color, hoist: r.hoist, mentionable: r.mentionable, permissions: BigInt(r.permissions), reason }).catch(() => null);
    if (created) {
      roleMap.set(r.id, created.id);
      recreated.add(r.id);
      remaps.push({ from: r.id, to: created.id });
    }
  }
  actions.push({ type: "Rôles recréés", ok: true, detail: String(recreated.size) });

  const channelMap = new Map<string, string>();
  let channelsCreated = 0;
  for (const c of channelOrder(data.channels)) {
    const existing = guild.channels.cache.get(c.id) ?? guild.channels.cache.find((x) => x.name === c.name && x.type === c.type);
    if (existing) {
      channelMap.set(c.id, existing.id);
      continue;
    }
    const overwrites = c.overwrites.flatMap((o) => {
      const id = o.type === OverwriteType.Role ? (o.id === guild.id ? guild.id : roleMap.get(o.id)) : o.id;
      return id ? [{ id, type: o.type, allow: BigInt(o.allow), deny: BigInt(o.deny) }] : [];
    });
    const options: GuildChannelCreateOptions = {
      name: c.name,
      type: c.type as GuildChannelCreateOptions["type"],
      parent: c.parentId ? channelMap.get(c.parentId) ?? undefined : undefined,
      permissionOverwrites: overwrites,
      topic: c.topic ?? undefined,
      nsfw: c.nsfw,
      bitrate: c.bitrate,
      userLimit: c.userLimit,
      rateLimitPerUser: c.rateLimitPerUser,
      reason
    };
    const created = await guild.channels.create(options).catch(() => null);
    if (created) {
      channelMap.set(c.id, created.id);
      channelsCreated++;
    }
  }
  actions.push({ type: "Salons recréés", ok: true, detail: String(channelsCreated) });

  // Members get back the roles that had disappeared (not those removed on purpose since the backup).
  let given = 0;
  if (recreated.size) {
    for (const [memberId, roleIds] of Object.entries(data.members)) {
      const add = roleIds.filter((id) => recreated.has(id)).map((id) => roleMap.get(id)!);
      if (!add.length || !guild.members.cache.has(memberId)) continue;
      if (await guild.members.cache.get(memberId)!.roles.add(add, reason).then(() => true, () => false)) given++;
    }
    actions.push({ type: "Rôles redonnés aux membres", ok: true, detail: `${given} membre(s)` });
  }
  return { actions, remaps };
}
