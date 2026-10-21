/** Weekly appreciation levels, shared by the server and the UI (no DB). */
export type Rating = "red" | "yellow" | "green" | "blue";

export const RATINGS: Record<Rating, { label: string; color: string }> = {
  red: { label: "Nul", color: "#fb7185" },
  yellow: { label: "Moyen", color: "#fbbf24" },
  green: { label: "Bien", color: "#4ade80" },
  blue: { label: "Parfait", color: "#60a5fa" }
};

export function isRating(value: unknown): value is Rating {
  return typeof value === "string" && value in RATINGS;
}
