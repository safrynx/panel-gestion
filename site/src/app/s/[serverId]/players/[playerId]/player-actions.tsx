"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Camera, MessageSquare, Monitor, Snowflake, UserX } from "lucide-react";
import { useUI } from "@/app/ui";
import { useCommand } from "../../use-command";
import { useBanDialog } from "../../security-actions";
import ScreenViewer from "../../screen-viewer";

type Props = {
  playerId: number;
  /** Server id of the player while in game, null when offline (only the ban is offered). */
  target: number | null;
  name: string;
  banned: boolean;
  can: { message: boolean; kick: boolean; screenshot: boolean; ban: boolean };
};

/** Actions on a player: message / screen / freeze / kick while in game, ban at any time. */
export default function PlayerActions({ playerId, target, name, banned, can }: Props) {
  const router = useRouter();
  const { ask } = useUI();
  const { send, busy } = useCommand();
  const { ban, busy: banning } = useBanDialog();
  const [screen, setScreen] = useState(false);
  const [frozen, setFrozen] = useState(false);
  const inGame = target !== null;

  async function message() {
    const answer = await ask({ title: "Message privé", message: `${name} le verra dans son chat.`, confirmLabel: "Envoyer", input: { label: "Message", required: true, multiline: true } });
    if (answer && inGame) await send("dm", { target, message: answer.value }, `Message envoyé à ${name}`);
  }

  async function kick() {
    const answer = await ask({ title: `Kick ${name}`, message: "Le joueur est déconnecté avec ce message.", confirmLabel: "Kick", danger: true, input: { label: "Raison", required: true } });
    if (answer && inGame && (await send("kick", { target, reason: answer.value }, `${name} a été expulsé`))) router.refresh();
  }

  async function screenshot() {
    if (inGame && (await send("screenshot", { target }, `Capture de ${name} prise : elle apparaît ci-dessous une fois analysée`))) setTimeout(() => router.refresh(), 4000);
  }

  async function freeze() {
    if (inGame && (await send("freeze", { target, on: !frozen }, frozen ? `${name} est dégelé` : `${name} est gelé`))) setFrozen(!frozen);
  }

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {inGame && can.message && <button className="btn" disabled={busy} onClick={message}><MessageSquare size={15} />Message</button>}
      {inGame && can.screenshot && <button className="btn" onClick={() => setScreen(true)}><Monitor size={15} />Écran en direct</button>}
      {inGame && can.screenshot && <button className="btn" disabled={busy} onClick={screenshot}><Camera size={15} />Capture</button>}
      {inGame && can.kick && <button className="btn" disabled={busy} onClick={freeze}><Snowflake size={15} />{frozen ? "Dégeler" : "Geler"}</button>}
      {inGame && can.kick && <button className="btn danger" disabled={busy} onClick={kick}><UserX size={15} />Kick</button>}
      {can.ban && !banned && <button className="btn danger" disabled={banning} onClick={() => ban(playerId, name)}><Ban size={15} />Bannir</button>}
      {screen && target !== null && <ScreenViewer target={target} name={name} onClose={() => setScreen(false)} />}
    </div>
  );
}
