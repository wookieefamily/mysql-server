"""Posting matcher.

Decides whether a normalized :class:`Posting` is a plausible match for Peter's
search. Everything it keys on lives in ``config/matching.yaml`` so the filters
can be tuned during the first weeks without touching code (the brief expects
2-3 weeks of tuning and some false positives at the start).

A posting matches when ALL of these hold:
  1. It reads as an internship (title/body hits an internship term), OR the
     company entry sets ``treat_all_as_intern`` (small teams that don't use the
     word "intern" in titles).
  2. It hits at least one include keyword.
  3. Its location passes the location filter (or is remote), unless the filter
     is disabled for that company.
  4. It does NOT hit an engineering-only exclusion term.

The engineering exclusion is suppressed for a posting that also looks clearly
non-engineering (e.g. an "Analyst Intern" at an engineering-heavy company), so
we don't drop the exact qualifying roles the brief is hunting for.
"""

from __future__ import annotations

import dataclasses
import re
from typing import Optional

import yaml

from .adapters import Posting


@dataclasses.dataclass
class MatchConfig:
    intern_terms: list[str]
    include_keywords: list[str]
    location_terms: list[str]
    remote_terms: list[str]
    exclude_keywords: list[str]
    non_eng_signals: list[str]

    @classmethod
    def load(cls, path: str) -> "MatchConfig":
        with open(path, "r", encoding="utf-8") as fh:
            raw = yaml.safe_load(fh) or {}
        return cls(
            intern_terms=_lower(raw.get("intern_terms", [])),
            include_keywords=_lower(raw.get("include_keywords", [])),
            location_terms=_lower(raw.get("location_terms", [])),
            remote_terms=_lower(raw.get("remote_terms", [])),
            exclude_keywords=_lower(raw.get("exclude_keywords", [])),
            non_eng_signals=_lower(raw.get("non_eng_signals", [])),
        )


@dataclasses.dataclass
class MatchResult:
    matched: bool
    reasons: list[str]
    include_hits: list[str]
    location_ok: bool
    excluded_by: Optional[str] = None


def _lower(items) -> list[str]:
    return [str(x).strip().lower() for x in (items or []) if str(x).strip()]


def _contains(haystack: str, needle: str) -> bool:
    """Whole-token-ish containment: word-boundary match so "data" doesn't hit
    "metadata" and "ops" doesn't hit "shops"."""
    return re.search(r"(?<![a-z0-9])" + re.escape(needle) + r"(?![a-z0-9])",
                     haystack) is not None


class Matcher:
    def __init__(self, config: MatchConfig):
        self.cfg = config

    def _posting_text(self, posting: Posting) -> str:
        parts = [posting.title, posting.department, posting.location]
        body = ""
        if posting.raw and isinstance(posting.raw, dict):
            body = str(posting.raw.get("content", "")
                       or posting.raw.get("descriptionPlain", "")
                       or posting.raw.get("description", ""))
        return " ".join(parts + [body]).lower()

    def evaluate(self, posting: Posting, *,
                 location_filter: bool = True,
                 treat_all_as_intern: bool = False) -> MatchResult:
        text = self._posting_text(posting)
        title = (posting.title or "").lower()
        reasons: list[str] = []

        # 1. internship?
        is_intern = treat_all_as_intern or any(
            _contains(text, t) for t in self.cfg.intern_terms)
        if not is_intern:
            return MatchResult(False, ["not an internship posting"], [], False)

        # 2. include keywords
        include_hits = [k for k in self.cfg.include_keywords if _contains(text, k)]
        if not include_hits:
            return MatchResult(False, ["no include keyword hit"], [], False)
        reasons.append("keywords: " + ", ".join(sorted(set(include_hits))[:6]))

        # 3. location
        location_ok = True
        if location_filter:
            loc = (posting.location or "").lower()
            is_remote = any(_contains(loc, t) or _contains(text, t)
                            for t in self.cfg.remote_terms)
            in_geo = any(_contains(loc, t) for t in self.cfg.location_terms)
            location_ok = is_remote or in_geo
            if not location_ok:
                return MatchResult(
                    False, [f"location out of scope: {posting.location!r}"],
                    include_hits, False)
            reasons.append("remote" if is_remote and not in_geo else "in-geo")

        # 4. engineering exclusion, softened by non-eng signals in the TITLE
        excluded_by = next((k for k in self.cfg.exclude_keywords
                            if _contains(text, k)), None)
        if excluded_by:
            non_eng = any(_contains(title, s) for s in self.cfg.non_eng_signals)
            if not non_eng:
                return MatchResult(
                    False, [f"engineering-only ({excluded_by})"],
                    include_hits, location_ok, excluded_by=excluded_by)
            reasons.append(f"exclusion '{excluded_by}' overridden by non-eng title")

        return MatchResult(True, reasons, include_hits, location_ok)
