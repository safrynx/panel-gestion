import { PermissionFlagsBits, type Message } from "discord.js";
import { attempt, getAntiraidConfig, isTrusted, report, type Action, type MessageProtection } from "./antiraid";

/**
 * Message protection (Sécurité > Anti-raid > Réglages > Messages): flood, mass mentions, @everyone / @here, Discord
 * invites and links. The offending messages are deleted and, for flood / mentions, the author is muted.
 * Invites and links need the Message Content intent (BOT_MESSAGE_CONTENT=1 and enabled in the Developer Portal).
 * Staff (Administrator, Manage Messages, or an ignored role) and trusted people are never checked.
 */

const INVITE = /(?:discord\.gg|discord(?:app)?\.com\/invite)\/[\w-]+/i;
const LINK = /https?:\/\/\S+/i;

/** Pure: what is wrong with this message (flood is counted separately). */
export function messageViolation(
  m: { content: string; everyone: boolean; mentionCount: number },
  rules: Pick<MessageProtection, "blockEveryone" | "maxMentions" | "blockInvites" | "blockLinks">
): "everyone_mention" | "mass_mention" | "invite_link" | "link" | null {
  if (rules.blockEveryone && (m.everyone || /@(everyone|here)\b/.test(m.content))) return "everyone_mention";
  if (m.mentionCount > rules.maxMentions) return "mass_mention";
  if (rules.blockInvites && INVITE.test(m.content)) return "invite_link";
  if (rules.blockLinks && LINK.test(m.content)) return "link";
  return null;
}

/** Recent messages of each author: guild:user -> [{ at, channelId, id }] */
const recent = new Map<string, { at: number; channelId: string; id: string }[]>();
/** One report per author and kind every 2 minutes. */
const reported = new Map<string, number>();

const SUMMARY: Record<string, string> = {
  message_flood: "Flood de messages",
  mass_mention: "Mentions de masse",
  everyone_mention: "Tentative de @everyone / @here",
  invite_link: "Invitation vers un autre Discord",
  link: "Lien interdit"
};

export async function onMessage(message: Message): Promise<void> {
  if (!message.inGuild() || message.author.bot || !message.member) return;
  const guild = message.guild;
  const config = getAntiraidConfig(guild.id);
  const rules = config?.messages;
  if (!config?.enabled || !rules?.enabled || isTrusted(guild, config, message.author.id)) return;
  if (rules.ignoredChannels.includes(message.channelId)) return;
  const member = message.member;
  if (member.permissions.has(PermissionFlagsBits.Administrator) || member.permissions.has(PermissionFlagsBits.ManageMessages)) return;
  if (member.roles.cache.some((r) => rules.ignoredRoles.includes(r.id))) return;

  const key = `${guild.id}:${message.author.id}`;
  const now = Date.now();
  const list = (recent.get(key) ?? []).filter((m) => now - m.at < rules.floodSeconds * 1000);
  list.push({ at: now, channelId: message.channelId, id: message.id });
  recent.set(key, list);

  let kind: string | null = messageViolation(
    { content: message.content, everyone: message.mentions.everyone, mentionCount: message.mentions.users.size + message.mentions.roles.size },
    rules
  );
  let toDelete = [{ channelId: message.channelId, id: message.id }];
  if (!kind && list.length > rules.floodCount) {
    kind = "message_flood";
    toDelete = list;
    recent.set(key, []);
  }
  if (!kind) return;

  const actions: Action[] = [];
  const byChannel = new Map<string, string[]>();
  for (const m of toDelete) byChannel.set(m.channelId, [...(byChannel.get(m.channelId) ?? []), m.id]);
  let deleted = 0;
  for (const [channelId, ids] of byChannel) {
    const channel = guild.channels.cache.get(channelId);
    if (!channel?.isTextBased()) continue;
    deleted += ids.length > 1
      ? await channel.bulkDelete(ids, true).then((r) => r.size, () => 0)
      : await channel.messages.delete(ids[0]).then(() => 1, () => 0);
  }
  actions.push({ type: "Messages supprimés", ok: deleted > 0, detail: String(deleted) });
  const mute = kind === "message_flood" || kind === "mass_mention" || kind === "everyone_mention";
  if (mute) {
    const minutes = config.timeoutMinutes ?? 60;
    actions.push(await attempt("Membre rendu muet", () => member.timeout(minutes * 60_000, `Fiverax anti-raid : ${SUMMARY[kind!]}`), `${minutes} min`));
  }

  const reportKey = `${key}:${kind}`;
  if (now - (reported.get(reportKey) ?? 0) < 120_000) return;
  reported.set(reportKey, now);
  await report(guild, config, {
    kind,
    actorId: message.author.id,
    actorName: message.author.globalName || message.author.username,
    actorBot: false,
    summary: `${SUMMARY[kind]} dans #${"name" in message.channel ? message.channel.name : "?"}`,
    actions
  });
}

// Forget old entries now and then.
setInterval(() => {
  const now = Date.now();
  for (const [key, list] of recent) if (!list.length || now - list[list.length - 1].at > 120_000) recent.delete(key);
  for (const [key, at] of reported) if (now - at > 600_000) reported.delete(key);
}, 60_000).unref();
