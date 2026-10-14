"use client";

import { useRef, useState } from "react";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import {
  EXPLAIN_LEVELS,
  answerBlocks,
  explainError,
  explainStructure,
  type ExplainLevel,
  type ExplainResponse,
} from "@/lib/explain";

/**
 * P16 — "Explain this structure". A side sheet that asks the backend to
 * explain the open structure (or the current selection) at the
 * reader's level, and shows the measured facts the answer was grounded in.
 */
export function ExplainSheet({ proteinId, disabled }: { proteinId: string; disabled?: boolean }) {
  const selected = useStore((s) => s.selected);
  const [level, setLevel] = useState<ExplainLevel>("undergraduate");
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<ExplainResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  async function ask() {
    const mine = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const data = await explainStructure(proteinId, {
        question: question.trim() || undefined,
        selection: [...selected],
        level,
      });
      if (mine === seq.current) setResult(data);
    } catch (e) {
      if (mine === seq.current) setError(explainError(e));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }

  return (
    <Sheet>
      <SheetTrigger
        disabled={disabled}
        title="Explain this structure"
        className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        <Sparkles className="size-3.5" aria-hidden />
        Explain
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Explain this structure</SheetTitle>
          <SheetDescription>
            {selected.size
              ? `Focused on the ${selected.size} selected residue${selected.size === 1 ? "" : "s"}.`
              : "Ask anything, or leave the box empty for an overview."}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-3 px-4">
          <div role="radiogroup" aria-label="Level" className="inline-flex rounded-md border border-border p-0.5">
            {EXPLAIN_LEVELS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={level === value}
                onClick={() => setLevel(value)}
                className={`rounded px-2.5 py-1 text-xs transition-colors ${
                  level === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <textarea
            aria-label="Question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void ask();
            }}
            rows={3}
            maxLength={1000}
            placeholder="e.g. What holds this fold together? Why might the selected residues matter?"
            className="w-full resize-y rounded-md border border-input bg-background p-2 text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
          <Button size="sm" onClick={() => void ask()} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
            {result ? "Ask again" : "Explain"}
          </Button>

          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {error}
            </p>
          )}

          {result && (
            <article aria-label="Answer" className="space-y-2 text-[13px] leading-relaxed">
              {answerBlocks(result.answer).map((block, i) =>
                block.kind === "p" ? (
                  <p key={i}>{block.text}</p>
                ) : (
                  <ul key={i} className="list-disc space-y-1 pl-5">
                    {block.items.map((item, j) => (
                      <li key={j}>{item}</li>
                    ))}
                  </ul>
                ),
              )}
              <details className="pt-2 text-[11px] text-muted-foreground">
                <summary className="cursor-pointer">Grounded in {result.facts.length} measured facts · {result.model}</summary>
                <ul className="mt-1 list-disc space-y-0.5 pl-5">
                  {result.facts.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </details>
              <p className="text-[10px] text-muted-foreground">
                Written by an AI model. Sentences marked &ldquo;From general knowledge&rdquo; were not measured here; check them before citing.
              </p>
            </article>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
