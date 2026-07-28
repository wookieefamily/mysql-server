#!/usr/bin/env python3
"""Seed data/tracker.csv from config/companies.json.

Builds one tracker row per company using the registry's static metadata, with
current_status="unknown" and last_checked blank (nothing has been checked yet).
The monitor updates these live fields on each run; this just gives Peter a
populated, diff-able starting spreadsheet.

Usage: python scripts/seed_tracker.py
"""

from __future__ import annotations

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
sys.path.insert(0, os.path.join(ROOT, "src"))

from internship_monitor.registry import load_companies  # noqa: E402
from internship_monitor.tracker import Tracker  # noqa: E402


def main() -> int:
    companies = load_companies(os.path.join(ROOT, "config", "companies.json"))
    tracker = Tracker(os.path.join(ROOT, "data", "tracker.csv")).load()
    for c in companies:
        tracker.upsert(
            c.company,
            category=c.category,
            location=c.location,
            fit_tier=c.fit_tier,
            offers_qualifying_internship=c.offers_qualifying_internship,
            intern_role_types=c.intern_role_types,
            ats=c.ats,
            board_token_or_url=c.board_token_or_url,
            early_opener=c.early_opener,
            class_year_sensitive=(
                f"{str(c.class_year_sensitive).lower()}"
                + (f" — {c.class_year_note}" if c.class_year_note else "")),
            typical_open_window=c.typical_open_window,
            current_status=(tracker.get(c.company) or {}).get(
                "current_status", "") or "unknown",
            current_posting_url=(tracker.get(c.company) or {}).get(
                "current_posting_url", ""),
            last_checked=(tracker.get(c.company) or {}).get("last_checked", ""),
            notes=c.notes,
        )
    tracker.save()
    print(f"Seeded {len(companies)} rows into data/tracker.csv")
    return 0


if __name__ == "__main__":
    sys.exit(main())
