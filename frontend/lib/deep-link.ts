/**
 * `/viewer/<id>?select=A:7` — open a structure with one residue selected and
 * in focus. The Central Dogma Explorer hands off to the viewer this way.
 *
 * Only a well-formed residue key is accepted (`<chain>:<1-based position>`,
 * the key the selection slice uses); anything else is ignored rather than
 * half-applied.
 */
const RESIDUE_KEY = /^[A-Za-z0-9]{1,4}:[1-9]\d{0,5}$/;

export function selectKeyFromSearch(search: string): string | null {
  const value = new URLSearchParams(search).get("select");
  return value && RESIDUE_KEY.test(value) ? value : null;
}

export function viewerHref(id: string, select?: string | null): string {
  const base = `/viewer/${encodeURIComponent(id)}`;
  return select ? `${base}?select=${encodeURIComponent(select)}` : base;
}
