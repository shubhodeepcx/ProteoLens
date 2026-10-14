"use client";

import { useEffect, useRef } from "react";

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

/** Grid pitch in CSS pixels. */
const CELL = 18;
/** Seconds between pulses leaving the centre. */
const PULSE_PERIOD = 3.6;
/** Radius of the cursor's influence, CSS pixels. */
const CURSOR_RADIUS = 100;
/** Opacity buckets; crosses are batched per bucket to cut fillStyle churn. */
const BUCKETS = 12;

// Two tones, mixed per cross: the deep accent for the helix strands and a
// lighter sky tone toward the glowing centre.
const DEEP = [37, 99, 235] as const; // blue-600
const LIGHT = [56, 189, 248] as const; // sky-400

function mix(a: readonly number[], b: readonly number[], t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `${r},${g},${bl}`;
}

const TONES = 4;
const TONE_RGB = Array.from({ length: TONES }, (_, i) =>
  mix(DEEP, LIGHT, i / (TONES - 1)),
);

export function HelixField({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let width = 0;
    let height = 0;
    let frame = 0;
    const start = performance.now();

    // Cursor target and an eased position that chases it, so the swell
    // glides rather than snapping. Off-canvas sits far away.
    const target = { x: -1e4, y: -1e4, active: false };
    const cursor = { x: -1e4, y: -1e4, strength: 0 };

    // Reused per frame: rect lists per (tone, alpha bucket).
    const batches: number[][] = Array.from(
      { length: TONES * BUCKETS },
      () => [],
    );

    function resize() {
      if (!canvas || !ctx) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw(now: number) {
      if (!ctx) return;
      const t = (now - start) / 1000;
      const cx = width / 2;
      const cy = height / 2;
      const maxR = Math.hypot(cx, cy);

      // Ease the cursor toward its target and fade its strength in or out.
      cursor.x += (target.x - cursor.x) * 0.18;
      cursor.y += (target.y - cursor.y) * 0.18;
      cursor.strength += ((target.active ? 1 : 0) - cursor.strength) * 0.08;

      ctx.clearRect(0, 0, width, height);

      // Light centre: a soft radial wash behind the grid.
      const glowR = Math.max(width, height) * 0.55;
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
      glow.addColorStop(0, "rgba(186,230,253,0.55)");
      glow.addColorStop(0.35, "rgba(191,219,254,0.22)");
      glow.addColorStop(1, "rgba(191,219,254,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      if (cursor.strength > 0.01) {
        const cg = ctx.createRadialGradient(
          cursor.x, cursor.y, 0, cursor.x, cursor.y, CURSOR_RADIUS * 1.6,
        );
        cg.addColorStop(0, `rgba(147,197,253,${0.28 * cursor.strength})`);
        cg.addColorStop(1, "rgba(147,197,253,0)");
        ctx.fillStyle = cg;
        ctx.fillRect(0, 0, width, height);
      }

      // Helix geometry: the axis runs left to right through the centre,
      // tilted so it crosses the open space around the page content.
      const tilt = -0.5;
      const cosT = Math.cos(tilt);
      const sinT = Math.sin(tilt);
      const amp = Math.min(height * 0.18, 130);
      const wavelength = Math.max(260, width * 0.36);
      const k = (Math.PI * 2) / wavelength;
      const spin = t * 0.55; // turning of the helix about its axis
      const sigma = CELL * 1.35; // strand thickness in the halftone
      const rungEvery = wavelength / 10;

      // Pulse: one ring leaving the centre each period.
      const pulsePhase = (t % PULSE_PERIOD) / PULSE_PERIOD;
      const pulseR = pulsePhase * maxR * 1.05;
      const pulseW = 46;
      const pulseFade = 1 - pulsePhase;

      for (const b of batches) b.length = 0;

      const cols = Math.ceil(width / CELL) + 1;
      const rows = Math.ceil(height / CELL) + 1;
      const offX = (width - (cols - 1) * CELL) / 2;
      const offY = (height - (rows - 1) * CELL) / 2;
      const cr2 = 2 * CURSOR_RADIUS * CURSOR_RADIUS;

      for (let j = 0; j < rows; j++) {
        const y = offY + j * CELL;
        for (let i = 0; i < cols; i++) {
          const x = offX + i * CELL;
          const dx = x - cx;
          const dy = y - cy;

          // Rotate into the helix frame: u along the axis, v across it.
          const u = dx * cosT + dy * sinT;
          const v = -dx * sinT + dy * cosT;
          const theta = k * u + spin;
          const s1 = amp * Math.sin(theta);
          const s2 = amp * Math.sin(theta + Math.PI);
          // Depth: the strand facing the viewer is fuller than the far one.
          const depth1 = 0.7 + 0.3 * Math.cos(theta);
          const depth2 = 0.7 + 0.3 * Math.cos(theta + Math.PI);
          const d1 = v - s1;
          const d2 = v - s2;
          let helix =
            Math.exp(-(d1 * d1) / (2 * sigma * sigma)) * depth1 +
            Math.exp(-(d2 * d2) / (2 * sigma * sigma)) * depth2;

          // Base-pair rungs between the strands.
          const lo = Math.min(s1, s2);
          const hi = Math.max(s1, s2);
          if (v > lo && v < hi) {
            const m = ((u % rungEvery) + rungEvery) % rungEvery;
            const dr = Math.min(m, rungEvery - m);
            if (dr < CELL * 0.7) helix = Math.max(helix, 0.45);
          }

          const r = Math.hypot(dx, dy);
          const centre = Math.exp(-(r * r) / (2 * (maxR * 0.45) ** 2));
          const pulse =
            Math.exp(-((r - pulseR) ** 2) / (2 * pulseW * pulseW)) * pulseFade;
          const mdx = x - cursor.x;
          const mdy = y - cursor.y;
          const near =
            Math.exp(-(mdx * mdx + mdy * mdy) / cr2) * cursor.strength;

          // Halftone value: a faint floor everywhere, the helix shaped by
          // the central glow, plus the pulse and the cursor swell.
          let val =
            0.04 +
            0.1 * centre +
            helix * (0.8 + 0.2 * centre) +
            pulse * (0.22 + 0.35 * helix) +
            near * 0.55;
          if (val > 1) val = 1;
          if (val < 0.065) continue;

          const tone = Math.min(
            TONES - 1,
            Math.round((centre * 0.8 + near * 0.6) * (TONES - 1)),
          );
          const bucket = Math.min(BUCKETS - 1, Math.floor(val * BUCKETS));
          batches[tone * BUCKETS + bucket].push(x, y, val);
        }
      }

      for (let tone = 0; tone < TONES; tone++) {
        for (let bucket = 0; bucket < BUCKETS; bucket++) {
          const list = batches[tone * BUCKETS + bucket];
          if (list.length === 0) continue;
          const alpha = 0.18 + 0.72 * ((bucket + 0.5) / BUCKETS);
          ctx.fillStyle = `rgba(${TONE_RGB[tone]},${alpha.toFixed(3)})`;
          for (let n = 0; n < list.length; n += 3) {
            const x = list[n];
            const y = list[n + 1];
            const val = list[n + 2];
            // Halftone: arm length grows with the value, so dense regions
            // read as solid strands and the floor as a faint dot grid.
            const arm = 1 + Math.pow(val, 1.3) * CELL * 0.4; // half-length of a bar
            const bar = val > 0.5 ? 1.8 : 1.2; // bar thickness
            ctx.fillRect(x - arm, y - bar / 2, arm * 2, bar);
            ctx.fillRect(x - bar / 2, y - arm, bar, arm * 2);
          }
        }
      }
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
