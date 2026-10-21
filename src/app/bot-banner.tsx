import { getBotStatus } from "@/lib/bot-status";
import { getGradeLadder } from "@/lib/config";
import { listGuildRoles } from "@/lib/roles";

/** Warns when the bot is offline (no voice tracking) or sits below the grade roles (cannot change grades). */
export default function BotBanner() {
  const bot = getBotStatus();
  const warnings: React.ReactNode[] = [];

  if (!bot.alive) {
    warnings.push(<><b>Bot hors ligne.</b> Le vocal n&apos;est plus suivi et personne n&apos;apparaît « en vocal ». Vérifie que le projet <code>bot</code> tourne sur son hébergement et que son <code>SITE_URL</code> / <code>BOT_API_TOKEN</code> sont corrects.</>);
  }
  if (bot.topRolePosition !== null) {
    const positions = new Map(listGuildRoles().map((r) => [r.id, r]));
    const tooHigh = getGradeLadder()
      .map((g) => positions.get(g.discordRoleId))
      .filter((r) => r && r.position >= (bot.topRolePosition as number));
    if (tooHigh.length) {
      warnings.push(<><b>Rôle du bot trop bas</b> (position {bot.topRolePosition}) : il est sous {tooHigh.length} rôle(s) de grade ({tooHigh.map((r) => r?.name).join(", ")}), Discord refusera les Up / Down / Demote. Dans Discord : Paramètres du serveur &gt; Rôles, glisse le rôle du bot au-dessus.</>);
    }
  }
  if (!warnings.length) return null;
  return <div>{warnings.map((w, i) => <div key={i} className="banner">{w}</div>)}</div>;
}
