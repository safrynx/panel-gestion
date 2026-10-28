"use client";
import { useUI } from "./ui";

export default function CopyButton({ text, label }: { text: string; label: string }) {
  const { toast } = useUI();
  return (
    <button
      className="btn"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          toast("Copié dans le presse-papiers", "ok");
        } catch {
          toast("Copie impossible ici : utilise le téléchargement CSV", "error");
        }
      }}
    >
      {label}
    </button>
  );
}
