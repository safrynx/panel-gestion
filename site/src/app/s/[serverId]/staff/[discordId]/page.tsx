import Link from "next/link";
import { notFound } from "next/navigation";
import { can, getActorLevel, isOwner, requireStaffPage } from "@/lib/auth";
import { getGradeLadder, getWarnRoles } from "@/lib/config";
import { getMemberDetail } from "@/lib/sync";
import { countersSince, withFivemPlaytime } from "@/lib/stats";
import { formatDateTime, formatDuration } from "@/lib/format";
import { badgeLabels, type BadgeColor } from "@/lib/types";
import Shell from "@/app/shell";
import Avatar from "@/app/avatar";
import MemberActions from "./actions";

export const dynamic = "force-dynamic";

const dot: Record<string, string> = { red: "#fb7185", yellow: "#fbbf24", green: "#4ade80", blue: "#60a5fa" };

export default async function MemberPage({ params }: { params: Promise<{ serverId: string; discordId: string }> }) {
  const { serverId, discordId } = await params;
  const { user, server } = await requireStaffPage(serverId);
  if (!/^\d{17,20}$/.test(discordId)) notFound();
  const since = await countersSince(server.id);
  const detail = await getMemberDetail(server.id, discordId, since);
  if (!detail.member) notFound();
  const { badges, notes, warnings, gradeHistory } = detail;
  const [member] = await withFivemPlaytime(server.id, [detail.member], since);

  const owner = isOwner(user);
  const [actorLevel, ladder, warnRoles] = await Promise.all([getActorLevel(user), getGradeLadder(server.id), getWarnRoles(server.id)]);
  const canAct = discordId !== user.discordId && (owner || member.gradeLevel < actorLevel);
  const assignable = canAct && can(user, "set_grade") ? ladder.filter((g) => owner || g.level < actorLevel).map((g) => g.name) : [];
  const canUp = canAct && can(user, "rank_up") && ladder.some((g) => g.level > member.gradeLevel && (owner || g.level < actorLevel));
  const canDown = canAct && can(user, "rank_down") && ladder.some((g) => g.level < member.gradeLevel);
  const canDemote = canAct && can(user, "rank_demote");
  const showRank = canUp || canDown || canDemote || assignable.length > 0;
  const canWarnAdd = canAct && can(user, "warn_add") && member.warnLevel < 3;
  const canWarnRemove = canAct && can(user, "warn_remove");

  const summary: [string, string][] = [
    ["Temps vocal", formatDuration(member.voiceSeconds)],
    ["Temps de jeu", formatDuration(member.fivemSeconds)],
    ["Dernière activité", member.lastActivity ? formatDateTime(member.lastActivity) : "—"]
  ];

  return (
    <Shell user={user} server={server} active="staff">
      <Link href={`/s/${server.id}/staff`} className="linkish rise" style={{ display: "inline-block", marginBottom: 22 }}>← Retour au staff</Link>

      <div className="head rise" style={{ alignItems: "center" }}>
        <div style={{ display: "flex", gap: 22, alignItems: "center" }}>
          <Avatar url={member.avatarUrl} name={member.username} size={84} />
          <div>
            <div className="eyebrow">{member.inVoice ? "En vocal maintenant" : "Profil staff"}</div>
            <h1 className="h1" style={{ fontSize: "clamp(22px,3vw,34px)" }}>{member.username}</h1>
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
              <span className="plate"><span>{member.grade}</span></span>
              <span className="muted" style={{ fontSize: 12 }}>{member.discordId}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="strip">
        {summary.map(([l, v], i) => <div key={l} className={`rise rise-${i + 1}`}><div className="eyebrow">{l}</div><div className="num" style={{ fontSize: 24 }}>{v}</div></div>)}
        <div className="rise rise-4">
          <div className="eyebrow">Avertissements</div>
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12 }}>
            <span className="pips" data-level={member.warnLevel}><i /><i /><i /></span>
            <span style={{ fontWeight: 700 }}>{member.warnLevel}/3</span>
          </div>
        </div>
      </div>

      <div className="cols even">
        <div>
          {(showRank || gradeHistory.length > 0) && (
            <section className="rise rise-1" style={{ marginBottom: 44 }}>
              <header style={{ paddingBottom: 12, borderBottom: "1px solid var(--line-2)" }}><h2 className="h2">Grade & hiérarchie</h2></header>
              {ladder.length === 0 && <p className="muted" style={{ marginTop: 16 }}>Aucun rôle de grade configuré : un propriétaire doit les choisir dans « Accès & rôles ».</p>}
              {showRank && <MemberActions mode="rank" discordId={discordId} username={member.username} grades={assignable} current={member.grade} canUp={canUp} canDown={canDown} canDemote={canDemote} />}
              {!showRank && ladder.length > 0 && <p className="muted" style={{ marginTop: 16 }}>Tu ne peux pas modifier ce membre (hiérarchie, permissions, ou toi-même).</p>}
              <ul style={{ listStyle: "none", margin: "18px 0 0", padding: 0 }}>
                {gradeHistory.map((h) => (
                  <li key={h.id} style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}>
                    <b>{h.old_grade}</b> <span className="muted">→</span> <b>{h.new_grade}</b>
                    <div className="muted" style={{ fontSize: 12 }}>{formatDateTime(h.created_at)} · {h.reason} · par {h.actor_discord_id}</div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rise rise-2">
            <header style={{ paddingBottom: 12, borderBottom: "1px solid var(--line-2)" }}><h2 className="h2">Avertissements</h2></header>
            {warnRoles.length === 0 && <div className="banner" style={{ marginTop: 14 }}>Rôles « Avert 1/2/3 » non détectés : les avertissements sont gardés dans le panel, sans rôle Discord.</div>}
            <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0 }}>
              {warnings.length === 0 && <li className="muted" style={{ padding: "16px 0" }}>Aucun avertissement.</li>}
              {warnings.map((w) => (
                <li key={w.id} style={{ padding: "12px 0", borderBottom: "1px solid var(--line)", opacity: w.removed_at ? 0.5 : 1 }}>
                  <div><span className="tag" data-tone={w.removed_at ? "neutral" : "warn"}>Avert {w.level}</span> {w.reason}{w.removed_at && <span className="muted"> · retiré</span>}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>
                    {formatDateTime(w.created_at)} · par {w.author_discord_id}
                    {w.removed_at && <> · retiré {formatDateTime(w.removed_at)} par {w.removed_by}{w.removed_reason ? ` (${w.removed_reason})` : ""}</>}
                  </div>
                  {!w.removed_at && canWarnRemove && <MemberActions mode="warn_remove" discordId={discordId} username={member.username} warningId={w.id} />}
                </li>
              ))}
            </ul>
            {canWarnAdd && <MemberActions mode="warn_add" discordId={discordId} username={member.username} />}
          </section>
        </div>

        <div>
          <section className="rise rise-2" style={{ marginBottom: 44 }}>
            <header style={{ paddingBottom: 12, borderBottom: "1px solid var(--line-2)" }}><h2 className="h2">Commentaires</h2></header>
            <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0 }}>
              {notes.length === 0 && <li className="muted" style={{ padding: "16px 0" }}>Aucun commentaire.</li>}
              {notes.map((n) => (
                <li key={n.id} style={{ padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
                  <div style={{ whiteSpace: "pre-wrap" }}>{n.body}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>{formatDateTime(n.created_at)} · par {n.author_name ?? n.author_discord_id}</div>
                </li>
              ))}
            </ul>
            {can(user, "comment") && <MemberActions mode="note" discordId={discordId} username={member.username} />}
          </section>

          <section className="rise rise-3">
            <header style={{ paddingBottom: 12, borderBottom: "1px solid var(--line-2)" }}><h2 className="h2">Pastilles</h2></header>
            <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0 }}>
              {badges.length === 0 && <li className="muted" style={{ padding: "16px 0" }}>Aucune pastille.</li>}
              {badges.map((b) => (
                <li key={b.id} style={{ padding: "12px 0", borderBottom: "1px solid var(--line)", display: "flex", gap: 12, opacity: b.status !== "active" ? 0.5 : 1 }}>
                  <span style={{ marginTop: 7, width: 9, height: 9, borderRadius: "50%", background: dot[b.color], flex: "none" }} />
                  <div>
                    <div>{badgeLabels[b.color as BadgeColor]} — {b.reason}{b.status !== "active" && <span className="muted"> · résolue</span>}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{formatDateTime(b.created_at)} · par {b.author_discord_id}</div>
                    {b.status === "active" && can(user, "badges") && <MemberActions mode="resolve" badgeId={b.id} />}
                  </div>
                </li>
              ))}
            </ul>
            {can(user, "badges") && <MemberActions mode="badge" discordId={discordId} username={member.username} />}
          </section>
        </div>
      </div>
    </Shell>
  );
}
