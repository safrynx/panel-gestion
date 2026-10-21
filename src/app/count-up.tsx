"use client";
import { useEffect, useState } from "react";
import { formatDuration } from "@/lib/format";

/** Number that counts up from 0 when it appears (instantly final when reduced motion is requested). */
export default function CountUp({ value, kind = "int" }: { value: number; kind?: "int" | "duration" }) {
  const [shown, setShown] = useState(value);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const start = performance.now();
    const duration = 1000;
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      setShown(Math.round(value * (1 - Math.pow(1 - t, 4))));
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <>{kind === "duration" ? formatDuration(shown) : shown.toLocaleString("fr-FR")}</>;
}
