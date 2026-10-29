import { can, requirePermissionPage } from "@/lib/auth";
import { getLiveState } from "@/lib/agent";
import Shell, { PageHead } from "@/app/shell";
import LiveView from "./live-view";

export const dynamic = "force-dynamic";

export default async function LivePage({ params }: { params: Promise<{ serverId: string }> }) {
  const { user, server } = await requirePermissionPage((await params).serverId, "view_live");
  const live = await getLiveState(server.id, { watch: true });

  return (
    <Shell user={user} server={server} active="live">
      <PageHead kicker={server.name} title="En direct">Le serveur FiveM tel que l&apos;agent le voit, rafraîchi toutes les quelques secondes.</PageHead>
      <LiveView
        initial={live}
        settingsHref={user.owner ? `/s/${server.id}/settings` : null}
        can={{ message: can(user, "player_message"), kick: can(user, "player_kick"), announce: can(user, "announce"), screenshot: can(user, "screenshot"), ban: can(user, "ban") }}
      />
    </Shell>
  );
}
