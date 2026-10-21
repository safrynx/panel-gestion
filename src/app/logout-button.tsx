"use client";

export default function LogoutButton() {
  return (
    <button
      className="linkish"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        window.location.href = "/login";
      }}
    >
      Déconnexion
    </button>
  );
}
