/* eslint-disable @next/next/no-img-element */
export default function Avatar({ url, name, size = 36 }: { url: string | null; name: string; size?: number }) {
  const style = { width: size, height: size, borderRadius: size * 0.34, flex: "none" } as const;
  if (url) return <img src={url} alt="" width={size} height={size} style={{ ...style, objectFit: "cover", background: "var(--surface-2)" }} />;
  return (
    <div style={{ ...style, display: "grid", placeItems: "center", background: "var(--surface-2)", fontSize: size * 0.34, fontWeight: 700, color: "var(--accent-soft)" }}>
      {name.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2).toUpperCase() || "?"}
    </div>
  );
}
