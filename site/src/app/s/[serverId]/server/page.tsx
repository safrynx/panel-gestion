import { redirect } from "next/navigation";
import { can, requireStaffPage } from "@/lib/auth";
import { getConsole, getLiveState } from "@/lib/agent";
import Shell, { PageHead } from "@/app/shell";
import ServerControl from "./server-control";

export const dynamic = "force-dynamic";

export default async function ServerPage({ params }: { params: Promise<{ serverId: string }> }) {
  const { user, server } = await requireStaffPage((await params).serverId);
  const canResources = can(user, "resources");
  const canConsole = can(user, "console");
  if (!canResources && !canConsole) redirect(`/s/${server.id}`);
  const [live, lines] = await Promise.all([getLiveState(server.id, { watch: true }), canConsole ? getConsole(server.id) : Promise.resolve([])]);

  return (
    <Shell user={user} server={server} active="server">
      <PageHead kicker={server.name} title="Ressources & console">Démarre, arrête ou redémarre les ressources et tape des commandes comme dans la console du serveur.</PageHead>
      <ServerControl initial={live} initialLines={lines} canResources={canResources} canConsole={canConsole} settingsHref={user.owner ? `/s/${server.id}/settings` : null} />
    </Shell>
  );
}
