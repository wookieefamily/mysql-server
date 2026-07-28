"""Weekly digest builder (markdown).

Sections:
  1. New matching postings (with fit triage + suggested action).
  2. Companies that need a manual check (no usable live feed).
  3. Feed errors this run (so silent breakage is visible).
  4. Run summary counts.

The digest points the "suggest submissions" step at the existing
resume-tailoring pipeline rather than reimplementing it.
"""

from __future__ import annotations

import dataclasses
import datetime as dt
from typing import Optional

from .adapters import Posting
from .fit_assessment import Assessment
from .registry import Company


@dataclasses.dataclass
class NewMatch:
    posting: Posting
    assessment: Assessment
    class_year_sensitive: bool


# Where the digest tells Peter to send a promising posting next. Kept as a
# pointer, not a reimplementation (out-of-scope items live in existing skills).
RESUME_PIPELINE_HINT = (
    "Run the tailored-resume pipeline on this posting: "
    "`/tailored-resume-pipeline <posting URL>` "
    "(ATS match analysis -> honest tailored resume)."
)


def build_digest(run_date: dt.date,
                 new_matches: list[NewMatch],
                 manual_checks: list[Company],
                 feed_errors: list[tuple[str, str]],
                 checked: int,
                 postings_seen: int) -> str:
    lines: list[str] = []
    lines.append(f"# Internship monitor digest — {run_date.isoformat()}")
    lines.append("")
    lines.append(
        f"Checked **{checked}** companies, scanned **{postings_seen}** live "
        f"postings, found **{len(new_matches)}** new matching internship(s).")
    lines.append("")

    lines.append("## New matching postings")
    if not new_matches:
        lines.append("_No new matches this run._")
    else:
        # apply now first, then tailor, then skip; class-year-sensitive flagged.
        order = {"apply now": 0, "tailor resume": 1, "skip": 2}
        for m in sorted(new_matches,
                        key=lambda x: order.get(x.assessment.action, 1)):
            p = m.posting
            flag = " ⚠️ class-year-sensitive" if m.class_year_sensitive else ""
            lines.append(f"### {p.company} — {p.title}{flag}")
            lines.append(f"- **Action:** {m.assessment.action}")
            lines.append(f"- **Location:** {p.location or 'n/a'}")
            if p.url:
                lines.append(f"- **Apply:** {p.url}")
            note = m.assessment.note.replace("\n", "\n  ")
            lines.append(f"- **Fit ({m.assessment.source}):** {note}")
            if m.assessment.action in ("apply now", "tailor resume"):
                lines.append(f"- **Next:** {RESUME_PIPELINE_HINT}")
            lines.append("")

    lines.append("## Manual check needed (no usable live feed)")
    if not manual_checks:
        lines.append("_None._")
    else:
        lines.append("These companies have no supported ATS feed; check their "
                     "careers pages by hand:")
        for c in sorted(manual_checks, key=lambda x: x.company.lower()):
            url = c.board_token_or_url or "(no URL on file)"
            lines.append(f"- **{c.company}** ({c.location}, tier {c.fit_tier}) "
                         f"— {url}")
    lines.append("")

    if feed_errors:
        lines.append("## Feed errors this run")
        lines.append("_Feeds that failed to load — coverage is NOT complete "
                     "for these this run:_")
        for company, err in feed_errors:
            lines.append(f"- **{company}**: {err}")
        lines.append("")

    lines.append("---")
    lines.append("_Triage only. Peter reviews every suggestion before "
                 "applying. Nothing here inflates his profile._")
    lines.append("")
    return "\n".join(lines)
