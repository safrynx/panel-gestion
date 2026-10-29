"use client";
import { useRouter } from "next/navigation";
import { MessageSquare, UserX } from "lucide-react";
import { useUI } from "@/app/ui";
import { useCommand } from "../../use-command";

/** Actions on a player who is in game right now. */
export default function PlayerActions({ target, name, canMessage, canKick }: { target: number; name: string; canMessage: boolean; canKick: boolean }) {
  const router = useRouter();
  const { ask } = useUI();
  const { send, busy } = useCommand();
  if (!canMessage && !canKick) return null;

  async function message() {
    const answer = await ask({ title: "Message privé", message: `${name} le verra dans son chat.`, confirmLabel: "Envoyer", input: { label: "Message", required: true, multiline: true } });
    if (answer) await send("dm", { target, message: answer.value }, `Message envoyé à ${name}`);
  }

  async function kick() {
    const answer = await ask({ title: `Kick ${name}`, message: "Le joueur est déconnecté avec ce message.", confirmLabel: "Kick", danger: true, input: { label: "Raison", required: true } });
    if (answer && (await send("kick", { target, reason: answer.value }, `${name} a été expulsé`))) router.refresh();
  }

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {canMessage && <button className="btn" disabled={busy} onClick={message}><MessageSquare size={15} />Message</button>}
      {canKick && <button className="btn danger" disabled={busy} onClick={kick}><UserX size={15} />Kick</button>}
    </div>
  );
}
