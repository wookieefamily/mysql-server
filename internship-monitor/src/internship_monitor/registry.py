"""Company registry loader.

Reads ``config/companies.json`` — one entry per company — and exposes typed
`Company` records plus the twice-weekly / weekly cadence decision for a given
run date.
"""

from __future__ import annotations

import dataclasses
import datetime as dt
import json
from typing import Optional


@dataclasses.dataclass
class Company:
    company: str
    category: str = ""
    location: str = ""
    fit_tier: str = ""
    ats: str = "none"
    board_token_or_url: str = ""
    early_opener: bool = False
    class_year_sensitive: bool = False
    class_year_note: str = ""
    location_filter: bool = True
    treat_all_as_intern: bool = False
    intern_role_types: str = ""
    typical_open_window: str = ""
    offers_qualifying_internship: str = "unknown"
    notes: str = ""

    @property
    def has_live_feed(self) -> bool:
        from .adapters import MANUAL_ATS
        return (self.ats or "").strip().lower() not in MANUAL_ATS \
            and bool((self.board_token_or_url or "").strip())

    @classmethod
    def from_dict(cls, d: dict) -> "Company":
        fields = {f.name for f in dataclasses.fields(cls)}
        return cls(**{k: v for k, v in d.items() if k in fields})


def load_companies(path: str) -> list[Company]:
    with open(path, "r", encoding="utf-8") as fh:
        raw = json.load(fh)
    entries = raw.get("companies", raw) if isinstance(raw, dict) else raw
    companies = [Company.from_dict(e) for e in entries]
    _check_unique(companies)
    return companies


def _check_unique(companies: list[Company]) -> None:
    seen = set()
    dupes = set()
    for c in companies:
        key = c.company.strip().lower()
        if key in seen:
            dupes.add(c.company)
        seen.add(key)
    if dupes:
        raise ValueError(f"duplicate companies in registry: {sorted(dupes)}")


# Early openers are checked twice weekly during Aug-Oct so a short window that
# opens and closes inside a single week is never missed.
EARLY_WINDOW_MONTHS = {8, 9, 10}
# Default weekly day = Monday(0); mid-week early-opener sweep = Thursday(3).
WEEKLY_DAY = 0
EARLY_EXTRA_DAY = 3


def should_check(company: Company, run_date: dt.date, *,
                 force: bool = False) -> bool:
    """Given the run date, decide whether this company is due this run.

    - Every company is checked on the weekly run day.
    - Early openers get an extra mid-week check, but only during Aug-Oct.
    - ``force`` (a manual run) always checks everything.
    """
    if force:
        return True
    weekday = run_date.weekday()
    if weekday == WEEKLY_DAY:
        return True
    if (company.early_opener and weekday == EARLY_EXTRA_DAY
            and run_date.month in EARLY_WINDOW_MONTHS):
        return True
    return False
