"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import {
  EXAMPLE_NAME,
  EXAMPLE_SEQUENCE,
  MAX_PREDICT_LENGTH,
  MIN_PREDICT_LENGTH,
  predictStructure,
  residueCount,
} from "@/lib/predict";

const INPUT_CLASS =
  "w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70 focus:border-ring focus:outline-none";

/**
 * P19: paste a sequence, fold it on the backend with ESMFold, then open the
 * model in the viewer, where pLDDT colouring and the confidence analysis
 * already work because the backend stores pLDDT on AlphaFold's 0-100 scale.
 */
export function PredictView() {
  const router = useRouter();
  const [sequence, setSequence] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const count = residueCount(sequence);
  const tooLong = count > MAX_PREDICT_LENGTH;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const summary = await predictStructure(sequence, name);
      router.push(`/viewer/${summary.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not reach the backend.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <label htmlFor="predict-sequence" className="text-xs font-semibold text-foreground">
            Protein sequence <span className="font-normal text-muted-foreground">(plain or FASTA)</span>
          </label>
          <span
            className={`font-mono text-[11px] ${tooLong ? "text-red-700" : "text-muted-foreground"}`}
            data-testid="residue-count"
          >
            {count} / {MAX_PREDICT_LENGTH} aa
          </span>
        </div>
        <textarea
          id="predict-sequence"
          value={sequence}
          onChange={(e) => setSequence(e.target.value)}
          rows={7}
          spellCheck={false}
          placeholder={">my_protein\nMQIFVKTLTGKTITLEVEPSDTIENVKAKIQ..."}
          className={`${INPUT_CLASS} font-mono text-xs`}
        />
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1">
            <label htmlFor="predict-name" className="mb-1 block text-[11px] text-muted-foreground">
              Name (optional)
            </label>
            <input
              id="predict-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="e.g. My designed binder"
              className={`${INPUT_CLASS} h-8 py-1 text-xs`}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setSequence(EXAMPLE_SEQUENCE);
              setName(EXAMPLE_NAME);
              setError(null);
            }}
          >
            Load example
          </Button>
          <Button type="submit" size="sm" disabled={busy || count < MIN_PREDICT_LENGTH || tooLong}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
            {busy ? "Folding…" : "Predict structure"}
          </Button>
        </div>
        {busy && (
          <p className="mt-3 text-xs text-muted-foreground" role="status">
            ESMFold is folding {count} residues. Small proteins take a few seconds; the largest up
            to a minute.
          </p>
        )}
        {error && (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800" role="alert">
            {error}
          </p>
        )}
      </section>

      <section className="space-y-2 text-xs leading-relaxed text-muted-foreground">
        <p>
          <span className="font-semibold text-foreground">How it works.</span> The sequence is sent
          from the ProteoLens backend to ESMFold (Lin et al., <i>Science</i> 2023), which predicts a
          structure from the single sequence without a multiple-sequence alignment. That is what makes
          it fast enough to wait for. The model opens in the viewer coloured by per-residue confidence
          (pLDDT), and every analysis tab works on it.
        </p>
        <p>
          <span className="font-semibold text-foreground">How far to trust it.</span> A predicted
          model is a hypothesis, not a measurement. Regions below 70 pLDDT should not be interpreted
          in detail; the Analytics tab lists them. For proteins with a known structure, an
          experimental entry or an AlphaFold DB model (both under Search) is usually better.
        </p>
        <p>
          {`Up to ${MAX_PREDICT_LENGTH} residues per request, which is the ESM Atlas limit; fold larger proteins one domain at a time. `} The sequence leaves your machine for Meta&apos;s public ESM
          Atlas service.
        </p>
      </section>
    </form>
  );
}
