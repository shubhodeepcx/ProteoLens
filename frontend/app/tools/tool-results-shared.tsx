"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export const TH = "px-2 py-1.5 text-left text-[10px] font-semibold tracking-wide text-muted-foreground uppercase";
export const TD = "px-2 py-1.5 align-top tabular-nums";

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      className="ml-1 inline-flex rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
    >
      {done ? <Check className="size-3" aria-hidden /> : <Copy className="size-3" aria-hidden />}
    </button>
  );
}

export function Notes({ notes }: { notes: string[] }) {
  return (
    <ul className="space-y-1 text-[11px] leading-relaxed text-muted-foreground">
      {notes.map((n) => (
        <li key={n}>{n}</li>
      ))}
    </ul>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">{children}</p>;
}
