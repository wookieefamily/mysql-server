"""Optional Claude-API fit assessment.

For each *new* matching posting this produces a 2-3 line triage note and a
suggested action (apply now / tailor resume / skip, with a one-line reason).
It is triage only — the brief is explicit that a human reviews every suggestion
before applying, and that nothing here inflates Peter's profile.

If no ANTHROPIC_API_KEY is set (or the SDK is missing), the monitor falls back
to a deterministic, rule-based note so a run never fails just because the LLM
step is unavailable.
"""

from __future__ import annotations

import dataclasses
import os
import textwrap
from typing import Optional

from .adapters import Posting
from .matcher import MatchResult

# Peter's honest profile, used to ground the triage. Kept factual per the
# guardrails: strengths are real, gaps are named, nothing is embellished.
CANDIDATE_PROFILE = textwrap.dedent(
    """
    Rising senior, summer 2027. UCLA, Economics + Geography/Environmental
    Studies double major, adding a Social Data Science minor.
    Strengths: large-scale tabular and campaign analytics; advanced Excel and
    pivot modeling; Looker dashboards; multi-year multi-cut data pulls from
    Paciolan; solo ownership of a ~$10K/month paid-search budget (auditing,
    targeting, analytics). SQL and Python are developing. No spatial/GIS work.
    Qualifies for undergrad analyst/data/policy/business/ops/finance tracks,
    NOT engineering-degree-required roles.
    Sector priority: energy, energy policy, AI-for-energy/grid software,
    climate. Geography: San Francisco/Bay Area first, then LA, then NY; remote
    ok. Some elite programs recruit only students graduating within the year --
    flag class-year sensitivity.
    """
).strip()

MODEL = os.environ.get("FIT_MODEL", "claude-sonnet-5")


@dataclasses.dataclass
class Assessment:
    action: str          # "apply now" | "tailor resume" | "skip"
    note: str            # 2-3 line fit assessment
    source: str          # "claude" | "rule-based"


def assess(posting: Posting, match: MatchResult,
           class_year_sensitive: bool = False) -> Assessment:
    key = os.environ.get("ANTHROPIC_API_KEY")
    if key:
        try:
            return _assess_with_claude(posting, match, class_year_sensitive, key)
        except Exception as exc:  # never let triage break a run
            return _rule_based(posting, match, class_year_sensitive,
                               note_suffix=f" (LLM unavailable: {exc})")
    return _rule_based(posting, match, class_year_sensitive)


def _rule_based(posting: Posting, match: MatchResult,
                class_year_sensitive: bool, note_suffix: str = "") -> Assessment:
    hits = ", ".join(match.include_hits[:4]) or "general match"
    note = (f"{posting.title} — {posting.location or 'location n/a'}. "
            f"Matched on: {hits}.")
    if class_year_sensitive:
        note += (" NOTE: class-year sensitive — confirm the program accepts a "
                 "summer-2027 rising senior before investing time.")
    action = "tailor resume"
    return Assessment(action=action, note=(note + note_suffix).strip(),
                      source="rule-based")


def _assess_with_claude(posting: Posting, match: MatchResult,
                        class_year_sensitive: bool, key: str) -> Assessment:
    import anthropic  # imported lazily so the SDK is optional

    client = anthropic.Anthropic(api_key=key)
    body = ""
    if posting.raw and isinstance(posting.raw, dict):
        body = str(posting.raw.get("content")
                   or posting.raw.get("descriptionPlain")
                   or posting.raw.get("description") or "")[:4000]
    prompt = textwrap.dedent(f"""
        You are triaging an internship posting for a candidate. Be honest and
        concise. Do NOT inflate the candidate's profile. Output exactly:
          Line 1: ACTION: one of [apply now | tailor resume | skip]
          Lines 2-4: a 2-3 line fit assessment with a one-line reason.

        CANDIDATE:
        {CANDIDATE_PROFILE}

        {"This program may be class-year sensitive; weigh eligibility." if class_year_sensitive else ""}

        POSTING:
        Company: {posting.company}
        Title: {posting.title}
        Location: {posting.location}
        Department: {posting.department}
        URL: {posting.url}
        Description (truncated):
        {body}
    """).strip()

    resp = client.messages.create(
        model=MODEL,
        max_tokens=300,
        messages=[{"role": "user", "content": prompt}],
    )
    text = "".join(getattr(b, "text", "") for b in resp.content).strip()
    action = "tailor resume"
    for candidate in ("apply now", "tailor resume", "skip"):
        if candidate in text.lower().split("\n")[0]:
            action = candidate
            break
    note = "\n".join(line for line in text.splitlines()
                     if not line.lower().startswith("action:")).strip()
    return Assessment(action=action, note=note or text, source="claude")
