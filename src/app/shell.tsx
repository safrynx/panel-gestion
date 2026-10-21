import Link from "next/link";
import { can, isOwner } from "@/lib/auth";
import type { SessionUser } from "@/lib/types";
import Avatar from "./avatar";
import LogoutButton from "./logout-button";

export type NavKey = "dashboard" | "staff" | "report" | "logs" | "admin";

export default function Shell({ user, active, children }: { user: SessionUser; active: NavKey; children: React.ReactNode }) {
  const items: { key: NavKey; href: string; label: string }[] = [
    { key: "dashboard", href: "/", label: "Accueil" },
    { key: "staff", href: "/staff", label: "Staff" },
    ...(can(user, "view_report") ? [{ key: "report" as const, href: "/report", label: "Bilan hebdo" }] : []),
    ...(can(user, "view_logs") ? [{ key: "logs" as const, href: "/logs", label: "Logs" }] : []),
    ...(isOwner(user) ? [{ key: "admin" as const, href: "/admin", label: "Accès & rôles" }] : [])
  ];

  return (
    <div>
      <aside className="side">
        <Link href="/" className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="GTASUN" />
          <div><b>GTASUN</b><small>Staff Manager</small></div>
        </Link>
        <nav className="nav">
          {items.map((item, i) => (
            <Link key={item.key} href={item.href} data-active={item.key === active}>
              <i>{String(i + 1).padStart(2, "0")}</i>{item.label}
            </Link>
          ))}
        </nav>
        <div className="me">
          <Avatar url={user.avatarUrl} name={user.username} size={34} />
          <div><b>{user.username}</b><LogoutButton /></div>
        </div>
      </aside>
      <div className="topbar">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="GTASUN" />
        {items.map((item) => <Link key={item.key} href={item.href} data-active={item.key === active}>{item.label}</Link>)}
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
