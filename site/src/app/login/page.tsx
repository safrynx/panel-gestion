import { redirect } from "next/navigation";
import { getIdentity } from "@/lib/auth";

export const dynamic = "force-dynamic";

const messages: Record<string, string> = {
  missing_config: "Configuration Discord incomplète côté serveur.",
  invalid_state: "Session de connexion expirée ou invalide. Réessaie.",
  oauth_exchange: "Discord a refusé l'échange du code. Vérifie le client secret et l'URL de redirection.",
  oauth_identity: "Impossible de lire ton profil Discord.",
  forbidden: "Ton compte n'a accès à aucun serveur. Demande au propriétaire d'un serveur de t'ajouter.",
  access_denied: "Connexion annulée."
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; missing?: string }> }) {
  const identity = await getIdentity();
  const { error, missing } = await searchParams;
  if (identity && !error) redirect("/");

  return (
    <main className="login">
      <div className="login-bg" style={{ backgroundImage: "url(/logo.png)" }} />
      <div className="login-inner">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="login-logo rise" src="/logo.png" alt="GTASUN" />
        <div className="eyebrow rise rise-1" style={{ marginTop: 34 }}>Espace staff</div>
        <h1 className="h1 rise rise-2">GTASUN</h1>
        <p className="muted rise rise-3" style={{ margin: "12px 0 0" }}>Dashboard de gestion de tes serveurs FiveM : staff, grades et activité.</p>
        {error && (
          <div className="error rise" style={{ marginTop: 22, textAlign: "left" }}>
            {messages[error] ?? "Erreur de connexion."}
            {error === "missing_config" && missing ? ` (${missing})` : null}
          </div>
        )}
        <a href="/api/auth/discord" className="btn primary shine rise rise-4" style={{ marginTop: 28, width: "100%", padding: "13px 16px", background: "linear-gradient(135deg,#6d5df6,#4b3fd1)" }}>
          Continuer avec Discord
        </a>
      </div>
    </main>
  );
}
