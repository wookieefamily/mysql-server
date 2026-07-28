"""Seen-jobs state store.

Keeps a JSON map of ``job_id -> {first_seen, last_seen, title, url, company}``
so only genuinely new postings surface in a digest. The store is committed to
the repo, so state survives across GitHub Actions runs.
"""

from __future__ import annotations

import datetime as dt
import json
import os
from typing import Iterable

from .adapters import Posting


class SeenStore:
    def __init__(self, path: str):
        self.path = path
        self.data: dict[str, dict] = {}

    def load(self) -> "SeenStore":
        if os.path.exists(self.path):
            with open(self.path, "r", encoding="utf-8") as fh:
                self.data = json.load(fh)
        return self

    def is_new(self, posting: Posting) -> bool:
        return posting.job_id not in self.data

    def record(self, postings: Iterable[Posting], today: str) -> list[Posting]:
        """Record every posting; return the subset that was new this run."""
        new: list[Posting] = []
        for p in postings:
            entry = self.data.get(p.job_id)
            if entry is None:
                new.append(p)
                self.data[p.job_id] = {
                    "company": p.company,
                    "title": p.title,
                    "url": p.url,
                    "first_seen": today,
                    "last_seen": today,
                }
            else:
                entry["last_seen"] = today
        return new

    def save(self) -> None:
        os.makedirs(os.path.dirname(self.path) or ".", exist_ok=True)
        tmp = self.path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(self.data, fh, indent=2, sort_keys=True)
            fh.write("\n")
        os.replace(tmp, self.path)


def today_str() -> str:
    return dt.date.today().isoformat()
