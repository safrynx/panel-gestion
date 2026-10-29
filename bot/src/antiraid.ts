import {
  AuditLogEvent, ChannelType, GuildVerificationLevel, PermissionFlagsBits, PermissionsBitField,
  type Client, type Guild, type GuildAuditLogsEntry, type GuildMember, type NonThreadGuildBasedChannel, type Role
} from "discord.js";
import { sitePost } from "./api";

/**
 * Anti-raid of every watched guild, driven by the settings of the panel (Sécurité > Anti-raid > Réglages).
 *
 * The bot reads the guild's audit log in real time (GuildAuditLogEntryCreate): each destructive action (role or
 * channel deleted, roles taken from members, bans…) is counted per author. Once an author goes past what a rule
 * tolerates in its time window, the bot undoes every action of that author in the window (recreates the role and
 * gives it back to its members, recreates the channel, re-adds the roles…), punishes the author (derank / kick / ban;
 * a bot is always kicked), and reports the incident to the panel (and to an alert channel).
 * Mass joins lock the guild down for a while (highest verification level, newcomers kicked).
 */

// ---- settings (sent by the site, see site/src/lib/security-config.ts) ----

type Rule = { enabled: boolean; max: number; windowSec: number };
export type RuleKey =
  | "role_delete" | "channel_delete" | "role_create" | "channel_create" | "member_role_remove" | "member_role_add" | "dangerous_role_add"
  | "role_permissions" | "ban" | "kick" | "prune" | "bot_add" | "webhook_create" | "guild_update";

export type AntiraidConfig = {
  enabled: boolean;
  punishment: "derank" | "kick" | "ban";
  trustOwner: boolean;
  trusted: string[];
  alertChannelId: string | null;
  rules: Partial<Record<RuleKey, Rule>>;
  joinRaid: { enabled: boolean; joins: number; windowSec: number; lockdownMinutes: number };
  minAccountAgeDays: number;
};

const configs = new Map<string, AntiraidConfig>();

export function setAntiraidConfig(guildId: string, config: unknown): void {
  if (config && typeof config === "object" && "enabled" in config) configs.set(guildId, config as AntiraidConfig);
}

// ---- pure helpers (tested) ----

/** Permissions that let someone wreck a guild. */
export const DANGEROUS = [
  PermissionFlagsBits.Administrator, PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.BanMembers, PermissionFlagsBits.KickMembers, PermissionFlagsBits.ManageWebhooks, PermissionFlagsBits.ModerateMembers
].reduce((a, b) => a | b, 0n);

export const isDangerous = (bits: bigint | string | number) => (BigInt(bits) & DANGEROUS) !== 0n;

/** Dangerous permissions present in `after` and not in `before`. */
export const addedDangerous = (before: bigint | string | number, after: bigint | string | number) => (BigInt(after) & ~BigInt(before) & DANGEROUS) !== 0n;

type Pending = { at: number; undo: (() => Promise<Action>) | null; label: string };
/** `remap`: a recreated role (new id), so the panel updates its grade / avert / access rules. */
export type Action = { type: string; ok: boolean; detail?: string; remap?: { from: string; to: string } };

/**
 * Actions of each author per rule within the rule's window. `push` returns the actions to undo now: none while the
 * author stays within what is tolerated, all of the window's actions the moment they go past it, then each new one
 * at once while they are flagged.
 */
export class Tracker {
  private entries = new Map<string, Pending[]>();
  private flagged = new Map<string, number>();

  push(key: string, rule: Rule, item: Omit<Pending, "at"> & { at?: number }, now = Date.now()): { triggered: boolean; firstTrigger: boolean; toUndo: Pending[] } {
    const windowMs = rule.windowSec * 1000;
    const entry = { ...item, at: now };
    const list = (this.entries.get(key) ?? []).filter((e) => now - e.at < windowMs);
    list.push(entry);
    this.entries.set(key, list);
    const flaggedAt = this.flagged.get(key);
    if (flaggedAt && now - flaggedAt < Math.max(windowMs, 60_000)) return { triggered: true, firstTrigger: false, toUndo: [entry] };
    if (list.length <= rule.max) return { triggered: false, firstTrigger: false, toUndo: [] };
    this.flagged.set(key, now);
    this.entries.set(key, []);
    return { triggered: true, firstTrigger: true, toUndo: list };
  }
}

// ---- what the bot remembers to be able to undo ----

/** Roles of each member (role deletions do not tell who had the role). */
const memberRoles = new Map<string, Map<string, Set<string>>>();
type DeletedRole = { role: Role; holders: string[]; overwrites: { channelId: string; allow: bigint; deny: bigint }[]; at: number };
const deletedRoles = new Map<string, DeletedRole>();
type DeletedChannel = { channel: NonThreadGuildBasedChannel; children: string[]; at: number };
const deletedChannels = new Map<string, DeletedChannel>();
const recentJoins = new Map<string, { id: string; at: number }[]>();
const lockdowns = new Map<string, { until: number; previousLevel: GuildVerificationLevel }>();
const tracker = new Tracker();
const punished = new Map<string, number>();

export function indexGuildMembers(guild: Guild, members: Iterable<GuildMember>): void {
  const map = new Map<string, Set<string>>();
  for (const m of members) map.set(m.id, new Set(m.roles.cache.keys()));
  memberRoles.set(guild.id, map);
}

export function memberChanged(member: GuildMember, present = true): void {
  const map = memberRoles.get(member.guild.id);
  if (!map) return;
  if (present) map.set(member.id, new Set(member.roles.cache.keys()));
  else map.delete(member.id);
}

function rememberDeletedRole(role: Role): void {
  const holders = [...(memberRoles.get(role.guild.id) ?? new Map<string, Set<string>>()).entries()].filter(([, roles]) => roles.has(role.id)).map(([id]) => id);
  const overwrites = role.guild.channels.cache
    .filter((c): c is NonThreadGuildBasedChannel => "permissionOverwrites" in c)
    .map((c) => ({ c, o: c.permissionOverwrites.cache.get(role.id) }))
    .filter((x) => x.o)
    .map(({ c, o }) => ({ channelId: c.id, allow: o!.allow.bitfield, deny: o!.deny.bitfield }));
  deletedRoles.set(role.id, { role, holders, overwrites, at: Date.now() });
}

function rememberDeletedChannel(channel: NonThreadGuildBasedChannel): void {
  const children = channel.type === ChannelType.GuildCategory ? channel.guild.channels.cache.filter((c) => "parentId" in c && c.parentId === channel.id).map((c) => c.id) : [];
  deletedChannels.set(channel.id, { channel, children, at: Date.now() });
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The audit entry may arrive before the delete event: wait a little for the snapshot. */
async function waitFor<T>(map: Map<string, T>, id: string): Promise<T | undefined> {
  for (let i = 0; i < 10 && !map.has(id); i++) await wait(300);
  return map.get(id);
}

const attempt = async (type: string, run: () => Promise<unknown>, detail?: string): Promise<Action> => {
  try {
    await run();
    return { type, ok: true, detail };
  } catch (error) {
    return { type, ok: false, detail: `${detail ? `${detail} : ` : ""}${error instanceof Error ? error.message : String(error)}`.slice(0, 300) };
  }
};

// ---- undo builders ----

function undoRoleDelete(guild: Guild, roleId: string, reason: string) {
  return async (): Promise<Action> => {
    const snap = await waitFor(deletedRoles, roleId);
    if (!snap) return { type: "Rôle recréé", ok: false, detail: "rôle inconnu du bot (supprimé avant son démarrage)" };
    const old = snap.role;
    try {
      const role = await guild.roles.create({
        name: old.name, color: old.color, hoist: old.hoist, mentionable: old.mentionable, permissions: old.permissions,
        unicodeEmoji: old.unicodeEmoji ?? undefined, reason
      });
      await role.setPosition(Math.max(1, Math.min(old.position, (guild.members.me?.roles.highest.position ?? 1) - 1))).catch(() => undefined);
      for (const o of snap.overwrites) {
        const channel = guild.channels.cache.get(o.channelId);
        if (channel && "permissionOverwrites" in channel) await channel.permissionOverwrites.create(role, Object.fromEntries([
          ...new PermissionsBitField(o.allow).toArray().map((p) => [p, true]),
          ...new PermissionsBitField(o.deny).toArray().map((p) => [p, false])
        ]), { reason }).catch(() => undefined);
      }
      let given = 0;
      for (const id of snap.holders) {
        if (await guild.members.addRole({ user: id, role, reason }).then(() => true, () => false)) given++;
      }
      deletedRoles.delete(roleId);
      return { type: "Rôle recréé", ok: true, detail: `@${old.name}, redonné à ${given}/${snap.holders.length} membre(s)`, remap: { from: roleId, to: role.id } };
    } catch (error) {
      return { type: "Rôle recréé", ok: false, detail: `@${old.name} : ${error instanceof Error ? error.message : error}` };
    }
  };
}

function undoChannelDelete(guild: Guild, channelId: string, reason: string) {
  return async (): Promise<Action> => {
    const snap = await waitFor(deletedChannels, channelId);
    if (!snap) return { type: "Salon recréé", ok: false, detail: "salon inconnu du bot" };
    const c = snap.channel;
    return attempt("Salon recréé", async () => {
      const created = await guild.channels.create({
        name: c.name,
        type: c.type as ChannelType.GuildText,
        parent: "parentId" in c && c.parentId && guild.channels.cache.has(c.parentId) ? c.parentId : undefined,
        position: c.rawPosition,
        permissionOverwrites: c.permissionOverwrites.cache.map((o) => ({ id: o.id, type: o.type, allow: o.allow.bitfield, deny: o.deny.bitfield })),
        topic: "topic" in c && c.topic ? c.topic : undefined,
        nsfw: "nsfw" in c ? c.nsfw : undefined,
        bitrate: "bitrate" in c ? c.bitrate : undefined,
        userLimit: "userLimit" in c ? c.userLimit : undefined,
        rateLimitPerUser: "rateLimitPerUser" in c ? c.rateLimitPerUser ?? undefined : undefined,
        reason
      });
      for (const childId of snap.children) {
        const child = guild.channels.cache.get(childId);
        if (child && "setParent" in child) await child.setParent(created.id, { lockPermissions: false, reason }).catch(() => undefined);
      }
      deletedChannels.delete(channelId);
    }, `#${c.name}`);
  };
}

// ---- punishment ----

async function punish(guild: Guild, config: AntiraidConfig, executorId: string, why: string): Promise<{ actions: Action[]; removedRoles: string[] }> {
  const key = `${guild.id}:${executorId}`;
  if (Date.now() - (punished.get(key) ?? 0) < 60_000) return { actions: [], removedRoles: [] };
  punished.set(key, Date.now());
  const reason = `Fiverax anti-raid : ${why}`.slice(0, 400);
  if (executorId === guild.ownerId) return { actions: [{ type: "Sanction", ok: false, detail: "propriétaire du Discord : Discord interdit de le sanctionner" }], removedRoles: [] };
  const member = await guild.members.fetch(executorId).catch(() => null);
  if (!member) return { actions: [{ type: "Sanction", ok: false, detail: "auteur introuvable (déjà parti ?)" }], removedRoles: [] };

  if (member.user.bot) return { actions: [await attempt("Bot expulsé", () => member.kick(reason), member.user.tag)], removedRoles: [] };
  if (config.punishment === "kick") return { actions: [await attempt("Auteur expulsé", () => member.kick(reason), member.user.tag)], removedRoles: [] };
  if (config.punishment === "ban") return { actions: [await attempt("Auteur banni", () => member.ban({ reason }), member.user.tag)], removedRoles: [] };

  // Derank: every role the bot can remove.
  const removable = member.roles.cache.filter((r) => r.id !== guild.id && !r.managed && r.editable);
  const kept = member.roles.cache.filter((r) => r.id !== guild.id && !r.managed && !r.editable);
  const action = await attempt("Auteur derank", () => member.roles.remove([...removable.keys()], reason), `${removable.size} rôle(s) retiré(s)`);
  const actions = [action];
  if (kept.size) actions.push({ type: "Derank incomplet", ok: false, detail: `rôles au-dessus du bot : ${kept.map((r) => r.name).join(", ")}` });
  return { actions, removedRoles: action.ok ? [...removable.keys()] : [] };
}

// ---- reporting ----

async function report(guild: Guild, config: AntiraidConfig, incident: { kind: string; actorId: string | null; actorName: string | null; actorBot: boolean; summary: string; details?: Record<string, unknown>; actions: Action[]; removedRoles?: string[] }) {
  console.log(`[antiraid] ${guild.name}: ${incident.kind} by ${incident.actorName ?? "?"} — ${incident.summary}`);
  void sitePost("incident", { guildId: guild.id, details: {}, removedRoles: [], ...incident }, 2);
  if (!config.alertChannelId) return;
  const channel = guild.channels.cache.get(config.alertChannelId);
  if (!channel || !channel.isTextBased()) return;
  const lines = incident.actions.slice(0, 12).map((a) => `${a.ok ? "✅" : "❌"} ${a.type}${a.detail ? ` — ${a.detail}` : ""}`);
  await channel.send({
    embeds: [{
      title: "🛡️ Anti-raid",
      description: `**${incident.summary}**\nAuteur : ${incident.actorId ? `<@${incident.actorId}>` : "?"}${incident.actorBot ? " (bot)" : ""}\n\n${lines.join("\n")}`.slice(0, 4000),
      color: 0xd4b06a,
      timestamp: new Date().toISOString()
    }],
    allowedMentions: { parse: [] }
  }).catch(() => undefined);
}

// ---- the audit log ----

const LABELS: Record<RuleKey, string> = {
  role_delete: "suppression de rôle", channel_delete: "suppression de salon", role_create: "création de rôles en masse",
  channel_create: "création de salons en masse", member_role_remove: "retrait de rôles en masse", member_role_add: "ajout de rôles en masse",
  dangerous_role_add: "rôle dangereux donné", role_permissions: "permissions dangereuses ajoutées à un rôle", ban: "bans en masse",
  kick: "kicks en masse", prune: "purge de membres", bot_add: "ajout d'un bot", webhook_create: "création de webhooks", guild_update: "modification du serveur"
};

type Change = { key: string; old?: unknown; new?: unknown };
const rolesOf = (changes: Change[], key: "$add" | "$remove") => (changes.find((c) => c.key === key)?.new as { id: string; name: string }[] | undefined) ?? [];

/** What one audit entry means: the rule(s) it counts for, and how to undo it. */
function classify(guild: Guild, entry: GuildAuditLogsEntry, reason: string): { rule: RuleKey; label: string; undo: (() => Promise<Action>) | null }[] {
  const target = entry.targetId ?? "";
  const changes = (entry.changes ?? []) as Change[];
  switch (entry.action) {
    case AuditLogEvent.RoleDelete:
      return [{ rule: "role_delete", label: "rôle supprimé", undo: undoRoleDelete(guild, target, reason) }];
    case AuditLogEvent.ChannelDelete:
      return [{ rule: "channel_delete", label: "salon supprimé", undo: undoChannelDelete(guild, target, reason) }];
    case AuditLogEvent.RoleCreate:
      return [{ rule: "role_create", label: "rôle créé", undo: () => attempt("Rôle créé supprimé", async () => { await guild.roles.cache.get(target)?.delete(reason); }) }];
    case AuditLogEvent.ChannelCreate:
      return [{ rule: "channel_create", label: "salon créé", undo: () => attempt("Salon créé supprimé", async () => { await guild.channels.cache.get(target)?.delete(reason); }) }];
    case AuditLogEvent.MemberRoleUpdate: {
      const out: ReturnType<typeof classify> = [];
      const removed = rolesOf(changes, "$remove");
      const added = rolesOf(changes, "$add");
      if (removed.length) {
        out.push({ rule: "member_role_remove", label: "rôles retirés", undo: () => attempt("Rôles remis", () => guild.members.cache.get(target)?.roles.add(removed.map((r) => r.id), reason) ?? guild.members.fetch(target).then((m) => m.roles.add(removed.map((r) => r.id), reason)), `<@${target}> : ${removed.map((r) => r.name).join(", ")}`) });
      }
      const dangerous = added.filter((r) => { const role = guild.roles.cache.get(r.id); return role && isDangerous(role.permissions.bitfield); });
      if (dangerous.length) {
        out.push({ rule: "dangerous_role_add", label: "rôle dangereux donné", undo: () => attempt("Rôle dangereux retiré", () => guild.members.fetch(target).then((m) => m.roles.remove(dangerous.map((r) => r.id), reason)), `<@${target}> : ${dangerous.map((r) => r.name).join(", ")}`) });
      }
      if (added.length) {
        out.push({ rule: "member_role_add", label: "rôles ajoutés", undo: () => attempt("Rôles ajoutés retirés", () => guild.members.fetch(target).then((m) => m.roles.remove(added.map((r) => r.id), reason)), `<@${target}> : ${added.map((r) => r.name).join(", ")}`) });
      }
      return out;
    }
    case AuditLogEvent.RoleUpdate: {
      const perms = changes.find((c) => c.key === "permissions");
      if (!perms || !addedDangerous(String(perms.old ?? "0"), String(perms.new ?? "0"))) return [];
      return [{ rule: "role_permissions", label: "permissions dangereuses ajoutées", undo: () => attempt("Permissions du rôle remises", async () => { await guild.roles.cache.get(target)?.setPermissions(BigInt(String(perms.old ?? "0")), reason); }, guild.roles.cache.get(target)?.name) }];
    }
    case AuditLogEvent.MemberBanAdd:
      return [{ rule: "ban", label: "membre banni", undo: () => attempt("Membre débanni", () => guild.members.unban(target, reason), `<@${target}>`) }];
    case AuditLogEvent.MemberKick:
      return [{ rule: "kick", label: "membre expulsé", undo: null }];
    case AuditLogEvent.MemberPrune:
      return [{ rule: "prune", label: "purge de membres", undo: null }];
    case AuditLogEvent.BotAdd:
      return [{ rule: "bot_add", label: "bot ajouté", undo: () => attempt("Bot ajouté expulsé", () => guild.members.fetch(target).then((m) => m.kick(reason)), `<@${target}>`) }];
    case AuditLogEvent.WebhookCreate:
      return [{ rule: "webhook_create", label: "webhook créé", undo: () => attempt("Webhook supprimé", () => guild.client.deleteWebhook(target, { reason })) }];
    case AuditLogEvent.GuildUpdate: {
      const name = changes.find((c) => c.key === "name");
      if (!name && !changes.some((c) => c.key === "vanity_url_code" || c.key === "icon_hash")) return [];
      return [{ rule: "guild_update", label: "serveur modifié", undo: name ? () => attempt("Nom du serveur remis", () => guild.setName(String(name.old), reason), String(name.old)) : null }];
    }
    default:
      return [];
  }
}

async function onAuditEntry(entry: GuildAuditLogsEntry, guild: Guild): Promise<void> {
  const config = configs.get(guild.id);
  const executorId = entry.executorId;
  if (!config?.enabled || !executorId || executorId === guild.client.user.id) return;
  if (config.trusted.includes(executorId) || (config.trustOwner && executorId === guild.ownerId)) return;

  const reason = "Fiverax anti-raid : action annulée";
  for (const item of classify(guild, entry, reason)) {
    const rule = config.rules[item.rule];
    if (!rule?.enabled) continue;
    const { triggered, firstTrigger, toUndo } = tracker.push(`${guild.id}:${executorId}:${item.rule}`, rule, { at: Date.now(), undo: item.undo, label: item.label });
    if (!triggered) continue;

    const actions: Action[] = [];
    for (const pending of toUndo) if (pending.undo) actions.push(await pending.undo());
    const executor = entry.executor ?? (await guild.client.users.fetch(executorId).catch(() => null));
    let removedRoles: string[] = [];
    if (firstTrigger) {
      const result = await punish(guild, config, executorId, LABELS[item.rule]);
      actions.push(...result.actions);
      removedRoles = result.removedRoles;
    }
    if (firstTrigger || actions.length) {
      await report(guild, config, {
        kind: item.rule,
        actorId: executorId,
        actorName: executor ? executor.globalName || executor.username : null,
        actorBot: Boolean(executor?.bot),
        summary: firstTrigger
          ? `${LABELS[item.rule].replace(/^./, (c) => c.toUpperCase())} : ${toUndo.length} action(s) en ${rule.windowSec} s (toléré : ${rule.max})`
          : `Nouvelle action bloquée (${item.label})`,
        details: { count: toUndo.length, max: rule.max, windowSec: rule.windowSec, remaps: actions.flatMap((a) => (a.remap ? [a.remap] : [])) },
        actions,
        removedRoles
      });
    }
  }
}

// ---- mass joins ----

async function onJoin(member: GuildMember): Promise<void> {
  const guild = member.guild;
  const config = configs.get(guild.id);
  if (!config?.enabled || member.user.bot) return;
  const now = Date.now();
  const lock = lockdowns.get(guild.id);

  if (lock && lock.until > now) {
    await member.kick("Fiverax anti-raid : serveur verrouillé (raid en cours)").catch(() => undefined);
    return;
  }

  const minAge = config.minAccountAgeDays * 86400_000;
  if (minAge > 0 && now - member.user.createdTimestamp < minAge) {
    const action = await attempt("Compte expulsé", () => member.kick(`Fiverax anti-raid : compte de moins de ${config.minAccountAgeDays} jour(s)`), member.user.tag);
    await report(guild, config, { kind: "young_account", actorId: member.id, actorName: member.user.username, actorBot: false, summary: `Compte créé il y a ${Math.floor((now - member.user.createdTimestamp) / 86400_000)} jour(s)`, actions: [action] });
    return;
  }

  if (!config.joinRaid.enabled) return;
  const joins = recentJoins.get(guild.id) ?? [];
  const recent = [...joins.filter((j) => now - j.at < config.joinRaid.windowSec * 1000), { id: member.id, at: now }];
  recentJoins.set(guild.id, recent);
  if (recent.length <= config.joinRaid.joins) return;

  // Raid: lock the guild down and kick everyone who came in the window.
  recentJoins.set(guild.id, []);
  const previousLevel = guild.verificationLevel;
  lockdowns.set(guild.id, { until: now + config.joinRaid.lockdownMinutes * 60_000, previousLevel });
  const actions: Action[] = [await attempt("Vérification au maximum", () => guild.setVerificationLevel(GuildVerificationLevel.VeryHigh, "Fiverax anti-raid : raid de comptes"))];
  let kicked = 0;
  for (const j of recent) {
    if (await guild.members.kick(j.id, "Fiverax anti-raid : raid de comptes").then(() => true, () => false)) kicked++;
  }
  actions.push({ type: "Arrivants expulsés", ok: true, detail: `${kicked}/${recent.length}` });
  actions.push({ type: "Verrouillage", ok: true, detail: `${config.joinRaid.lockdownMinutes} min : chaque nouvel arrivant est expulsé` });
  await report(guild, config, { kind: "join_raid", actorId: null, actorName: null, actorBot: false, summary: `${recent.length} arrivées en ${config.joinRaid.windowSec} s`, details: { joins: recent.length }, actions });

  setTimeout(async () => {
    const current = lockdowns.get(guild.id);
    if (!current || current.until > Date.now() + 1000) return;
    lockdowns.delete(guild.id);
    const restore = await attempt("Vérification remise", () => guild.setVerificationLevel(previousLevel, "Fiverax anti-raid : fin du verrouillage"));
    await report(guild, config, { kind: "lockdown_end", actorId: null, actorName: null, actorBot: false, summary: "Fin du verrouillage", actions: [restore] });
  }, config.joinRaid.lockdownMinutes * 60_000);
}

/** Wire the anti-raid on the client. `watched(guildId)`: the guild belongs to a server of the panel. */
export function setupAntiraid(client: Client, watched: (guildId: string) => boolean): void {
  client.on("guildAuditLogEntryCreate", (entry, guild) => {
    if (watched(guild.id)) void onAuditEntry(entry, guild).catch((e) => console.error("[antiraid] audit entry failed:", e instanceof Error ? e.message : e));
  });
  client.on("roleDelete", (role) => {
    if (watched(role.guild.id)) rememberDeletedRole(role);
  });
  client.on("channelDelete", (channel) => {
    if ("guild" in channel && channel.guild && watched(channel.guild.id)) rememberDeletedChannel(channel as NonThreadGuildBasedChannel);
  });
  client.on("guildMemberAdd", (member) => {
    if (watched(member.guild.id)) void onJoin(member).catch((e) => console.error("[antiraid] join check failed:", e instanceof Error ? e.message : e));
  });
  // Forget snapshots nobody needed (10 min).
  setInterval(() => {
    const old = Date.now() - 10 * 60_000;
    for (const [id, s] of deletedRoles) if (s.at < old) deletedRoles.delete(id);
    for (const [id, s] of deletedChannels) if (s.at < old) deletedChannels.delete(id);
  }, 60_000).unref();
}
