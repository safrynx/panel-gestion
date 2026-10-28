import { getBotStatus } from "@/lib/bot-status";
import { ladderIn, loadConfig } from "@/lib/config";
import { botInviteUrl } from "@/lib/discord";
import { listGuildRoles } from "@/lib/roles";
import type { Server } from "@/lib/servers";

/**
 * Warns when the server has no Discord guild yet, when the bot is offline or not in the guild (no voice tracking),
 * or when it sits below the grade roles (cannot change grades).
 */
export default async function BotBanner({ server }: { server: Server }) {
  if (!server.guildId) {
    return <div className="banner"><b>Aucun serveur Discord lié.</b> Un propriétaire doit renseigner l&apos;ID du serveur Discord dans « Configuration ».</div>;
  }
  const [bot, cfg, guildRoles] = await Promise.all([getBotStatus(server.id), loadConfig(server.id), listGuildRoles(server.id)]);
  const warnings: React.ReactNode[] = [];

  if (!bot.alive) {
    const invite = botInviteUrl(server.guildId);
    warnings.push(
      <>
        <b>Bot absent ou hors ligne sur ce serveur.</b> Le vocal n&apos;est plus suivi et personne n&apos;apparaît « en vocal ». Vérifie que le projet <code>bot</code> tourne et que son <code>SITE_URL</code> / <code>BOT_API_TOKEN</code> sont corrects
        {invite ? <>, puis <a href={invite} target="_blank" rel="noreferrer" className="linkish">invite le bot sur ce serveur Discord</a>.</> : "."}
      </>
    );
  }
  if (bot.topRolePosition !== null) {
    const top = bot.topRolePosition;
    const positions = new Map(guildRoles.map((r) => [r.id, r]));
    const tooHigh = ladderIn(cfg)
      .map((g) => positions.get(g.discordRoleId))
      .filter((r) => r && r.position >= top);
    if (tooHigh.length) {
      warnings.push(<><b>Rôle du bot trop bas</b> (position {top}) : il est sous {tooHigh.length} rôle(s) de grade ({tooHigh.map((r) => r?.name).join(", ")}), Discord refusera les Up / Down / Demote. Dans Discord : Paramètres du serveur &gt; Rôles, glisse le rôle du bot au-dessus.</>);
    }
  }
  if (!warnings.length) return null;
  return <div>{warnings.map((w, i) => <div key={i} className="banner">{w}</div>)}</div>;
}
