"use client";

import { useEffect, useState } from "react";

/** A slowly advancing angle for the helix; still when the user asks for
 *  reduced motion, when paused, or where there is no animation frame. */
export function usePhase(running: boolean): number {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    if (!running || typeof requestAnimationFrame !== "function") return;
    const reduced =
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      setPhase((p) => (p + (now - last) * 0.0015) % (Math.PI * 2));
      last = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [running]);
  return phase;
}
