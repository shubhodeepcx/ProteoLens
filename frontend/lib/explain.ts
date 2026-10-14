import { apiPost, ApiError } from "@/lib/api";

/** P16: the "Explain this structure" assistant. */

export type ExplainLevel = "school" | "undergraduate" | "expert";

export interface ExplainResponse {
  answer: string;
  model: string;
  facts: string[];
}

export const EXPLAIN_LEVELS: ReadonlyArray<readonly [ExplainLevel, string]> = [
  ["school", "School"],
  ["undergraduate", "Undergraduate"],
  ["expert", "Expert"],
];

export function explainStructure(
  proteinId: string,
  body: { question?: string; selection: string[]; level: ExplainLevel },
): Promise<ExplainResponse> {
  return apiPost<ExplainResponse>(
    `/api/proteins/${encodeURIComponent(proteinId)}/explain`,
    body,
  );
}

/** The backend's own reason when it gave one (503 names the missing key). */
export function explainError(e: unknown): string {
  if (e instanceof ApiError) {
    const detail =
      typeof e.body === "object" && e.body !== null ? (e.body.detail as unknown) : null;
    if (typeof detail === "string") return detail;
    return `The assistant request failed (${e.status}).`;
  }
  return e instanceof Error ? e.message : String(e);
}

export type AnswerBlock = { kind: "p"; text: string } | { kind: "ul"; items: string[] };

/**
 * Split the model's plain-text answer into paragraphs and bullet lists. The
 * prompt asks for exactly this shape, so a full Markdown renderer (and its
 * dependency) is not needed.
 */
export function answerBlocks(answer: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  for (const chunk of answer.split(/\n\s*\n/)) {
    const lines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
    let para: string[] = [];
    let list: string[] = [];
    const flushPara = () => {
      if (para.length) blocks.push({ kind: "p", text: para.join(" ") });
      para = [];
    };
    const flushList = () => {
      if (list.length) blocks.push({ kind: "ul", items: list });
      list = [];
    };
    for (const line of lines) {
      const bullet = /^[-*•]\s+(.*)$/.exec(line);
      if (bullet) {
        flushPara();
        list.push(bullet[1]);
      } else {
        flushList();
        para.push(line);
      }
    }
    flushPara();
    flushList();
  }
  return blocks;
}
