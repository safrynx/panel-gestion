import { can, requirePermissionPage } from "@/lib/auth";
import { getLiveState } from "@/lib/agent";
import Shell, { PageHead } from "@/app/shell";
import MapView from "./map-view";

export const dynamic = "force-dynamic";

export default async function MapPage({ params }: { params: Promise<{ serverId: string }> }) {
  const { user, server } = await requirePermissionPage((await params).serverId, "view_live");
  const live = await getLiveState(server.id, { watch: true });

  return (
    <Shell user={user} server={server} active="map">
      <PageHead kicker={server.name} title="Carte & vocal">Position des joueurs, qui parle, fréquences radio et appels, rafraîchis toutes les 2 secondes.</PageHead>
      <MapView
        initial={live}
        mapImage={process.env.MAP_IMAGE_URL || null}
        settingsHref={user.owner ? `/s/${server.id}/settings` : null}
        can={{ screenshot: can(user, "screenshot"), kick: can(user, "player_kick"), ban: can(user, "ban") }}
      />
    </Shell>
  );
}
