/** Second argument of the route handlers under /api/s/[serverId]/… (Next 15: params is a promise). */
export type ServerRouteContext = { params: Promise<{ serverId: string }> };
