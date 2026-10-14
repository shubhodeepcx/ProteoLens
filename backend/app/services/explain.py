"""P16: a plain-language explanation of the open structure, written by an AI model.

The model is given a short list of facts ProteoLens has already measured about
the structure (identity, chains, composition, secondary structure, the
selected residues) and asked to explain them at the reader's level. It is told
to mark anything that comes from general knowledge rather than from those
facts, so a student can tell what was measured from what was recalled.

The API key and model id are read from the backend's environment and never
reach the browser. Without them the endpoint answers 503 and says which
variables to set.
"""

from __future__ import annotations

import os
from collections import Counter

import httpx

from app.models.analytics import AnalyticsResponse
from app.models.explain import Level
from app.models.protein import ProteinSummary
from app.services.functional import ChainResidues

API_URL = "https://api.example.com/v1/chat/completions"
API_VERSION = "2023-06-01"
MAX_TOKENS = 1200
TIMEOUT = httpx.Timeout(60.0, connect=10.0)

LEVEL_GUIDE: dict[str, str] = {
    "school": "a curious secondary-school student: no jargon without a one-line definition",
    "undergraduate": "an undergraduate in biology or biochemistry",
    "expert": "a structural biologist: be concise and technical",
}

SYSTEM_PROMPT = """You are the teaching assistant inside ProteoLens, a protein structure workspace.
You explain the structure the user has open, using the measured facts you are given.

Rules:
- Ground every number in the facts. Never invent a measurement, residue number or citation.
- You may add well-established textbook knowledge about this protein or its family, but \
start those sentences with "From general knowledge:" so the reader can tell them apart.
- If the facts are not enough to answer, say what is missing and which ProteoLens tab \
(Annotations, Compounds, Variants, Analytics) would show it.
- Write for {audience}.
- Plain text only: short paragraphs, "- " for bullet points, no headings, no markdown \
emphasis. Stay under 250 words."""


class ExplainUnavailable(RuntimeError):
    """No API key is configured."""


class ExplainFailed(RuntimeError):
    """The model API answered with an error."""


def api_key() -> str | None:
    return os.getenv("EXPLAIN_API_KEY") or None


def model_name() -> str | None:
    return os.getenv("EXPLAIN_MODEL") or None


def missing_settings() -> list[str]:
    """Environment variables the assistant still needs, in the order to set them."""
    return [
        name
        for name, value in (("EXPLAIN_API_KEY", api_key()), ("EXPLAIN_MODEL", model_name()))
        if not value
    ]


def unavailable_message() -> str:
    return (
        "The Explain assistant needs "
        + " and ".join(missing_settings())
        + " set in the backend's environment."
    )


def build_facts(
    summary: ProteinSummary,
    analytics: AnalyticsResponse | None,
    chains: list[ChainResidues],
    selection: list[str],
) -> list[str]:
    """The measured facts, one short line each, in the order a reader needs them."""
    facts: list[str] = []
    title = summary.name or "an unnamed structure"
    origin = {"rcsb": "RCSB PDB", "alphafold": "AlphaFold DB", "uniprot": "UniProt"}.get(
        summary.source, "a user upload"
    )
    ident = f" {summary.source_id}" if summary.source_id else ""
    facts.append(f"Structure: {title} (from {origin}{ident}).")
    if summary.organism:
        facts.append(f"Organism: {summary.organism}.")
    facts.append(
        f"{len(summary.chains)} protein chain(s), {summary.residue_count} residues, "
        f"{summary.atom_count} atoms, {summary.molecular_weight / 1000:.1f} kDa."
    )
    for chain in summary.chains[:8]:
        facts.append(f"Chain {chain.label}: {chain.residue_count} residues.")
    if summary.nucleic_acid_chains:
        facts.append(f"Nucleic-acid chains present: {', '.join(summary.nucleic_acid_chains)}.")
    if summary.has_plddt:
        facts.append("This is a predicted model; the B-factor column holds AlphaFold pLDDT.")

    if analytics is not None:
        ss = analytics.secondary_structure
        if ss.available:
            facts.append(
                f"Secondary structure: {ss.helix:.0f}% helix, {ss.sheet:.0f}% sheet, "
                f"{ss.coil:.0f}% coil."
            )
        top = sorted(analytics.composition, key=lambda e: -e.count)[:5]
        if top:
            facts.append(
                "Most common residues: "
                + ", ".join(f"{e.label} {e.percent:.0f}%" for e in top)
                + "."
            )

    by_label = {c.label: c for c in chains}
    picked: list[str] = []
    for key in selection:
        label, _, ordinal_text = key.partition(":")
        chain = by_label.get(label)
        if chain is None or not ordinal_text.isdigit():
            continue
        i = int(ordinal_text) - 1
        if not 0 <= i < len(chain.sequence):
            continue
        number = chain.auth_seq_ids[i]
        picked.append(
            f"{chain.sequence[i]}{number if number is not None else i + 1} (chain {label})"
        )
    if picked:
        kinds = Counter(p[0] for p in picked)
        facts.append(
            f"The user has selected {len(picked)} residue(s): {', '.join(picked)}. "
            f"Residue types: {', '.join(f'{k}x{v}' for k, v in sorted(kinds.items()))}."
        )
    return facts


def build_messages(facts: list[str], question: str | None) -> list[dict[str, str]]:
    ask = (
        question.strip()
        if question and question.strip()
        else (
            "Give an overview of this structure: what it is, how it is built, and what is "
            "worth looking at first."
        )
    )
    body = "Measured facts:\n" + "\n".join(f"- {f}" for f in facts) + f"\n\nQuestion: {ask}"
    return [{"role": "user", "content": body}]


async def explain(
    facts: list[str],
    question: str | None,
    level: Level,
    client: httpx.AsyncClient | None = None,
) -> tuple[str, str]:
    """Ask the model; return (answer, model). Raises ExplainUnavailable / ExplainFailed."""
    key = api_key()
    model = model_name()
    if not key or not model:
        raise ExplainUnavailable(unavailable_message())
    payload = {
        "model": model,
        "max_tokens": MAX_TOKENS,
        "system": SYSTEM_PROMPT.format(audience=LEVEL_GUIDE[level]),
        "messages": build_messages(facts, question),
    }
    headers = {
        "x-api-key": key,
        "api-version": API_VERSION,
        "content-type": "application/json",
    }
    owns_client = client is None
    client = client or httpx.AsyncClient(timeout=TIMEOUT)
    try:
        response = await client.post(API_URL, json=payload, headers=headers)
    except httpx.HTTPError as exc:
        raise ExplainFailed(f"Could not reach the model API: {exc.__class__.__name__}.") from exc
    finally:
        if owns_client:
            await client.aclose()

    if response.status_code != 200:
        try:
            message = response.json().get("error", {}).get("message")
        except ValueError:
            message = None
        raise ExplainFailed(
            f"The model API answered {response.status_code}" + (f": {message}" if message else ".")
        )
    data = response.json()
    text = "".join(
        block.get("text", "") for block in data.get("content", []) if block.get("type") == "text"
    ).strip()
    if not text:
        raise ExplainFailed("The model returned an empty answer.")
    return text, data.get("model", model)
