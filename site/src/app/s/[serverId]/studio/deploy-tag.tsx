import type { DeployState } from "@/lib/studio";

/** Where a creation stands on the FiveM server. */
export default function DeployTag({ deploy }: { deploy: DeployState }) {
  const [label, tone] =
    deploy.status === "none" ? ["Jamais déployée", "neutral"]
    : deploy.status === "pending" || deploy.status === "sent" ? ["Déploiement…", "warn"]
    : deploy.status === "failed" ? ["Échec du déploiement", "danger"]
    : deploy.status === "expired" ? ["Déploiement non reçu", "danger"]
    : deploy.current ? ["En ligne sur le serveur", "up"]
    : ["Modifiée depuis le déploiement", "warn"];
  return <span className="tag" data-tone={tone} title={deploy.message ?? undefined}>{label}</span>;
}
