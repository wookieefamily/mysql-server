"""Tracker CSV read/update.

The tracker is a plain, diff-able CSV — one row per company — using the schema
from the brief (Section 6). Stdlib ``csv`` only, so the monitor has no heavy
dependency just to touch a spreadsheet.
"""

from __future__ import annotations

import csv
import os
from typing import Optional

COLUMNS = [
    "company",
    "category",
    "location",
    "fit_tier",
    "offers_qualifying_internship",
    "intern_role_types",
    "ats",
    "board_token_or_url",
    "early_opener",
    "class_year_sensitive",
    "typical_open_window",
    "current_status",
    "current_posting_url",
    "last_checked",
    "notes",
]


class Tracker:
    def __init__(self, path: str):
        self.path = path
        self.rows: list[dict] = []
        self._index: dict[str, dict] = {}

    def load(self) -> "Tracker":
        if os.path.exists(self.path):
            with open(self.path, "r", encoding="utf-8", newline="") as fh:
                self.rows = list(csv.DictReader(fh))
        self._reindex()
        return self

    def _reindex(self) -> None:
        self._index = {r["company"].strip().lower(): r for r in self.rows}

    def get(self, company: str) -> Optional[dict]:
        return self._index.get(company.strip().lower())

    def upsert(self, company: str, **fields) -> dict:
        row = self._index.get(company.strip().lower())
        if row is None:
            row = {c: "" for c in COLUMNS}
            row["company"] = company
            self.rows.append(row)
            self._index[company.strip().lower()] = row
        for key, val in fields.items():
            if key in COLUMNS and val is not None:
                row[key] = _fmt(val)
        return row

    def save(self) -> None:
        os.makedirs(os.path.dirname(self.path) or ".", exist_ok=True)
        self.rows.sort(key=lambda r: (r.get("fit_tier", "z"),
                                      r.get("company", "").lower()))
        tmp = self.path + ".tmp"
        with open(tmp, "w", encoding="utf-8", newline="") as fh:
            writer = csv.DictWriter(fh, fieldnames=COLUMNS,
                                    extrasaction="ignore")
            writer.writeheader()
            writer.writerows(self.rows)
        os.replace(tmp, self.path)


def _fmt(val) -> str:
    if isinstance(val, bool):
        return "true" if val else "false"
    return str(val)
