import Link from "next/link";
import { can, isOwner } from "@/lib/auth";
import type { Server } from "@/lib/servers";
import type { Identity, SessionUser } from "@/lib/types";
import Avatar from "./avatar";
import LogoutButton from "./logout-button";

export type NavKey = "dashboard" | "staff" | "report" | "logs" | "admin" | "settings";

type Props = { user: SessionUser; server: Server; active: NavKey; children: React.ReactNode };

/** Layout of the pages of one server: its navigation, a link back to the server list, the logged-in user. */
export default function Shell({ user, server, active, children }: Props) {
  const base = `/s/${server.id}`;
  const items: { key: NavKey; href: string; label: string }[] = [
    { key: "dashboard", href: base, label: "Accueil" },
    { key: "staff", href: `${base}/staff`, label: "Staff" },
    ...(can(user, "view_report") ? [{ key: "report" as const, href: `${base}/report`, label: "Bilan hebdo" }] : []),
    ...(can(user, "view_logs") ? [{ key: "logs" as const, href: `${base}/logs`, label: "Logs" }] : []),
    ...(isOwner(user) ? [{ key: "admin" as const, href: `${base}/admin`, label: "Accès & rôles" }, { key: "settings" as const, href: `${base}/settings`, label: "Configuration" }] : [])
  ];

  return (
    <Frame
      identity={user}
      brandHref={base}
      title={server.name}
      nav={
        <>
          {items.map((item, i) => (
            <Link key={item.key} href={item.href} data-active={item.key === active}>
              <i>{String(i + 1).padStart(2, "0")}</i>{item.label}
            </Link>
          ))}
          <Link href="/" style={{ marginTop: 18 }}><i>⇄</i>Changer de serveur</Link>
        </>
      }
      topLinks={
        <>
          {items.map((item) => <Link key={item.key} href={item.href} data-active={item.key === active}>{item.label}</Link>)}
          <Link href="/">Serveurs</Link>
        </>
      }
    >
      {children}
    </Frame>
  );
}

type FrameProps = {
  identity: Identity;
  brandHref: string;
  title: string;
  /** Sidebar links (desktop). */
  nav: React.ReactNode;
  /** Top bar links (mobile). */
  topLinks: React.ReactNode;
  children: React.ReactNode;
};

/** Bare layout (sidebar, top bar, content), shared by the server pages and the server list. */
export function Frame({ identity, brandHref, title, nav, topLinks, children }: FrameProps) {
  return (
    <div>
      <aside className="side">
        <Link href={brandHref} className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" />
          <div><b>{title}</b><small>Dashboard FiveM</small></div>
        </Link>
        <nav className="nav">{nav}</nav>
        <div className="me">
          <Avatar url={identity.avatarUrl} name={identity.username} size={34} />
          <div><b>{identity.username}</b><LogoutButton /></div>
        </div>
      </aside>
      <div className="topbar">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" />
        {topLinks}
      </div>
      <main className="main"><div className="content">{children}</div></main>
    </div>
  );
}

/** Page heading: small kicker, big display title, optional description and right-hand actions. */
export function PageHead({ kicker, title, children, actions }: { kicker: string; title: string; children?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="head rise">
      <div><div className="eyebrow">{kicker}</div><h1 className="h1">{title}</h1>{children && <p>{children}</p>}</div>
      {actions && <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{actions}</div>}
    </div>
  );
}
