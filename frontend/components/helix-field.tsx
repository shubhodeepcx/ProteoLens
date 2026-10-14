"use client";

import { useEffect, useRef } from "react";
import { createHelixFieldState, drawHelixField } from "./helix-field-draw";

/**
 * Animated landing-page backdrop: a halftone grid of cross-shaped "pixels"
 * whose size traces a slowly turning double helix, lit from a soft radial
 * glow at the centre. A ring pulses out from the centre every few seconds,
 * and crosses swell and brighten around the cursor.
 *
 * Canvas 2D, one `fillRect` pair per cross, batched by colour bucket, so a
 * full-screen field is a few thousand rects a frame. It only ever mounts on
 * the landing page — never behind the Mol* canvas. It takes no pointer
 * events (the cursor is read from `window`), stops when unmounted, and
 * draws one still frame under `prefers-reduced-motion`.
 */

export function HelixField({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let frame = 0;
    const start = performance.now();
    const state = createHelixFieldState(start);
    const { target, cursor } = state;

    function resize() {
      if (!canvas || !ctx) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      state.width = rect.width;
      state.height = rect.height;
      canvas.width = Math.max(1, Math.round(state.width * dpr));
      canvas.height = Math.max(1, Math.round(state.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw(now: number) {
      if (!ctx) return;
      drawHelixField(ctx, state, now);
    }

    function loop(now: number) {
      draw(now);
      frame = requestAnimationFrame(loop);
    }

    function onPointerMove(e: PointerEvent) {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
      target.active = inside;
      if (inside) {
        target.x = x;
        target.y = y;
        if (cursor.strength < 0.01) {
          cursor.x = x;
          cursor.y = y;
        }
      }
    }

    function onPointerLeave() {
      target.active = false;
    }

    resize();
    const observer = new ResizeObserver(() => {
      resize();
      if (reduceMotion) draw(start);
    });
    observer.observe(canvas);

    if (reduceMotion) {
      draw(start);
    } else {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      document.addEventListener("pointerleave", onPointerLeave);
      frame = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerleave", onPointerLeave);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`pointer-events-none ${className ?? ""}`}
    />
  );
}
