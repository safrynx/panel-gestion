import Link from "next/link";
import { Activity, ArrowRight, Building2, Code2, Gamepad2, KeyRound, Mic, ScrollText, ShieldAlert, Sparkles, TrendingUp, Users } from "lucide-react";
import { getIdentity } from "@/lib/auth";
import { Mark, Wordmark } from "./brand";

export const dynamic = "force-dynamic";

const features = [
  { icon: Users, title: "Gestion du staff", text: "Up, down, derank, recrutement : chaque changement de grade est appliqué directement sur les rôles Discord." },
  { icon: Activity, title: "Activité réelle", text: "Temps en vocal Discord et temps de jeu FiveM, par membre, sur la semaine. Tu vois qui est là, et qui ne l'est plus." },
  { icon: ShieldAlert, title: "Avertissements", text: "Trois niveaux d'avert, des commentaires et des pastilles pour suivre chaque membre dans la durée." },
  { icon: Sparkles, title: "Bilan IA du dimanche", text: "Chaque semaine, une synthèse des commentaires et de l'activité, avec une appréciation par membre." },
  { icon: KeyRound, title: "Permissions fines", text: "Quatorze permissions à donner à une personne ou à un rôle Discord. Chacun ne voit que ce qu'il doit voir." },
  { icon: ScrollText, title: "Logs complets", text: "Qui a fait quoi, sur qui, et quand. Chaque action du panel est tracée et consultable." }
];

const modules = [
  { icon: Users, title: "Staff", text: "Grades, avertissements, activité, bilan hebdo.", live: true },
  { icon: Building2, title: "Entreprises", text: "Suivi des entreprises et de leurs employés." },
  { icon: Code2, title: "Développement", text: "Tickets, tâches et suivi de l'équipe dev." },
  { icon: ShieldAlert, title: "Anti-cheat", text: "Détections et sanctions centralisées." }
];

const faq = [
  { q: "Qui peut ajouter un serveur ?", a: "Toute personne qui a la permission « Gérer le serveur » (ou qui est administrateur) sur le serveur Discord. Tu deviens propriétaire de ton espace Fiverax et tu ajoutes ensuite ton équipe." },
  { q: "Faut-il installer quelque chose sur mon serveur FiveM ?", a: "Seulement si tu veux suivre le temps de jeu : une ressource légère, à déposer dans tes resources avec le token propre à ton serveur. Tout le reste passe par Discord." },
  { q: "Je gère plusieurs serveurs, c'est possible ?", a: "Oui. Un seul compte, un seul bot, et tu passes d'un serveur à l'autre depuis le panel. Les données, les rôles et les accès de chaque serveur restent séparés." },
  { q: "Que se passe-t-il si quelqu'un perd son rôle sur Discord ?", a: "Ses accès sont recalculés à chaque requête à partir de ses rôles Discord : un rôle retiré sur Discord, et l'accès au panel disparaît." },
  { q: "Puis-je supprimer mes données ?", a: "Oui. Le propriétaire d'un serveur peut le supprimer depuis la page Configuration, avec toutes ses données." }
];

const demo = [
  { n: "Nova", g: "Modérateur", t: "12h40", w: 0, v: true },
  { n: "Kaiz", g: "Admin", t: "9h05", w: 0, v: true },
  { n: "Lyra", g: "Helper", t: "6h12", w: 1, v: false },
  { n: "Mehdi", g: "Modérateur", t: "3h48", w: 2, v: false }
];

export default async function LandingPage() {
  const identity = await getIdentity();
  const cta = identity
    ? { href: "/servers", label: "Ouvrir le dashboard" }
    : { href: "/login", label: "Commencer avec Discord" };

  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-wrap">
          <Link href="/" aria-label="Fiverax"><Wordmark size={30} /></Link>
          <nav>
            <a href="#fonctionnalites">Fonctionnalités</a>
            <a href="#modules">Modules</a>
            <a href="#demarrer">Démarrer</a>
            <a href="#faq">FAQ</a>
          </nav>
          <Link href={identity ? "/servers" : "/login"} className="btn sm">{identity ? "Dashboard" : "Connexion"}</Link>
        </div>
      </header>

      <main className="lp-wrap">
        <section className="lp-hero">
          <div>
            <span className="lp-chip rise"><b>Nouveau</b>Multi-serveurs : un panel pour tous tes serveurs</span>
            <h1 className="rise rise-1">Ton serveur FiveM,<br /><span className="gold">piloté d&apos;un seul endroit.</span></h1>
            <p className="lead rise rise-2">
              Fiverax relie ton Discord et ton serveur FiveM pour gérer ton staff : grades, avertissements, activité en vocal et en jeu, bilan de la semaine. Sans tableur, sans commandes à retenir.
            </p>
            <div className="lp-cta rise rise-3">
              <Link href={cta.href} className="btn primary shine">{cta.label}<ArrowRight size={16} /></Link>
              <a href="#apercu" className="btn">Voir le panel</a>
            </div>
          </div>
          <div className="lp-orb rise rise-2">
            <Mark size={240} />
            <div className="lp-note n1"><span className="ic"><TrendingUp size={15} /></span><div>Nova passe Modérateur<small>rôle Discord mis à jour</small></div></div>
            <div className="lp-note n2"><span className="ic"><Gamepad2 size={15} /></span><div>+2h14 en jeu<small>session FiveM terminée</small></div></div>
            <div className="lp-note n3"><span className="ic"><Mic size={15} /></span><div>4 staff en vocal<small>maintenant</small></div></div>
          </div>
        </section>

        <div className="lp-facts rise rise-4">
          <div><b>1 bot</b><span>pour tous tes serveurs Discord</span></div>
          <div><b>14</b><span>permissions par personne ou par rôle</span></div>
          <div><b>Vocal + jeu</b><span>l&apos;activité réelle de chaque membre</span></div>
          <div><b>Dimanche</b><span>un bilan IA de la semaine</span></div>
        </div>

        <section id="apercu" className="lp-sect">
          <header>
            <div className="eyebrow">Aperçu</div>
            <h2>Toute ton équipe, en un coup d&apos;œil.</h2>
            <p>L&apos;accueil de chaque serveur résume les 7 derniers jours : qui est actif, qui est en vocal, qui a des avertissements.</p>
          </header>
          <div className="lp-window">
            <div className="bar"><i /><i /><i /><span>fiverax · Mon serveur RP</span></div>
            <div className="body">
              <aside>
                <Wordmark size={22} />
                <div data-on>Accueil</div><div>Staff</div><div>Bilan hebdo</div><div>Logs</div><div>Accès &amp; rôles</div>
              </aside>
              <main>
                <div className="strip">
                  <div><div className="eyebrow">Staff actif</div><div className="num">24</div><small>4 en vocal</small></div>
                  <div><div className="eyebrow">Vocal · 7 j</div><div className="num">186h</div><small>cumulé</small></div>
                  <div><div className="eyebrow">Jeu · 7 j</div><div className="num">312h</div><small>cumulé</small></div>
                </div>
                {demo.map((m) => (
                  <div key={m.n} className="lp-row">
                    <span className="av">{m.n.slice(0, 2).toUpperCase()}</span>
                    <div><b>{m.n}</b><small>{m.t} en jeu cette semaine</small></div>
                    <span className="plate"><span>{m.g}</span></span>
                    <span className="pips" data-level={m.w}><i /><i /><i /></span>
                    <span className={`dot ${m.v ? "on" : ""}`} />
                  </div>
                ))}
              </main>
            </div>
          </div>
        </section>

        <section id="fonctionnalites" className="lp-sect">
          <header>
            <div className="eyebrow">Fonctionnalités</div>
            <h2>Tout ce qu&apos;il faut pour tenir un staff.</h2>
            <p>Discord reste la source de vérité : Fiverax lit les rôles, les applique, et garde l&apos;historique.</p>
          </header>
          <div className="lp-grid">
            {features.map((f) => (
              <article key={f.title} className="lp-feat">
                <span className="ic"><f.icon size={19} /></span>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="modules" className="lp-sect">
          <header>
            <div className="eyebrow">Modules</div>
            <h2>Le staff d&apos;abord. Le reste arrive.</h2>
            <p>Fiverax grandit avec ton serveur : de nouveaux modules s&apos;ajoutent au même panel, avec les mêmes accès.</p>
          </header>
          <div className="lp-mods">
            {modules.map((m) => (
              <article key={m.title} className="lp-mod" data-live={m.live || undefined}>
                <div><m.icon size={22} /><span className="tag" data-tone={m.live ? "up" : undefined}>{m.live ? "Disponible" : "Bientôt"}</span></div>
                <h3>{m.title}</h3>
                <p>{m.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="demarrer" className="lp-sect">
          <header>
            <div className="eyebrow">Démarrer</div>
            <h2>En place en cinq minutes.</h2>
          </header>
          <div className="lp-steps">
            <div className="lp-step"><h3>Connecte-toi avec Discord</h3><p>Pas de compte à créer. Fiverax voit les serveurs Discord que tu gères.</p></div>
            <div className="lp-step"><h3>Ajoute ton serveur</h3><p>Invite le bot, choisis tes rôles staff et tes grades. La page Configuration te guide pas à pas.</p></div>
            <div className="lp-step"><h3>Relie FiveM</h3><p>Optionnel : dépose la ressource FiveM sur ton serveur pour suivre le temps de jeu de ton équipe.</p></div>
          </div>
        </section>

        <section id="faq" className="lp-sect">
          <header>
            <div className="eyebrow">FAQ</div>
            <h2>Questions fréquentes</h2>
          </header>
          <div className="lp-faq">
            {faq.map((f) => (
              <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>
            ))}
          </div>
        </section>

        <section className="lp-final">
          <Mark size={320} />
          <h2>Prêt à reprendre la main sur ton staff ?</h2>
          <p>Connecte ton Discord, ajoute ton serveur, et retrouve toute ton équipe dans un seul panel.</p>
          <div className="lp-cta">
            <Link href={cta.href} className="btn primary shine">{cta.label}<ArrowRight size={16} /></Link>
          </div>
        </section>

        <footer className="lp-foot">
          <Wordmark size={24} />
          <nav>
            <a href="#fonctionnalites">Fonctionnalités</a>
            <a href="#faq">FAQ</a>
            <Link href="/login">Connexion</Link>
          </nav>
          <span>© {new Date().getFullYear()} Fiverax</span>
        </footer>
      </main>
    </div>
  );
}
