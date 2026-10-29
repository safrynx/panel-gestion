import { can, requirePermissionPage } from "@/lib/auth";
import { getLiveState } from "@/lib/agent";
import { recentDetectionsWithPosition } from "@/lib/security-live";
import Shell, { PageHead } from "@/app/shell";
import MapView from "./map-view";

export const dynamic = "force-dynamic";

export default async function MapPage({ params }: { params: Promise<{ serverId: string }> }) {
  const { user, server } = await requirePermissionPage((await params).serverId, "view_live");
  const security = can(user, "view_security");
  const [live, detections] = await Promise.all([getLiveState(server.id, { watch: true }), security ? recentDetectionsWithPosition(server.id) : Promise.resolve([])]);

  return (
    <Shell user={user} server={server} active="map">
      <PageHead kicker={server.name} title="Carte & vocal">Position des joueurs, qui parle, fréquences radio et appels, rafraîchis toutes les 2 secondes.</PageHead>
      <MapView
        initial={live}
        mapImage={process.env.MAP_IMAGE_URL || null}
        settingsHref={user.owner ? `/s/${server.id}/settings` : null}
        can={{ screenshot: can(user, "screenshot"), kick: can(user, "player_kick"), ban: can(user, "ban"), security }}
        detections={detections}
      />
    </Shell>
  );
}
