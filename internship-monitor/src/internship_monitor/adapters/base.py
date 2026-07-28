"""Adapter base classes and the normalized posting model.

Every ATS adapter converts a company's native job-feed JSON into a list of
`Posting` objects so the rest of the pipeline (matching, dedup, tracker,
digest) never has to know which ATS a posting came from.
"""

from __future__ import annotations

import dataclasses
import hashlib
from typing import Any, Iterable, Optional

import requests

# One shared timeout / UA for every outbound feed request.
DEFAULT_TIMEOUT = 25
USER_AGENT = "internship-monitor/1.0 (personal job-search monitor; contact via repo)"


@dataclasses.dataclass(frozen=True)
class Posting:
    """A single job posting, normalized across every ATS.

    `job_id` is a *stable* per-posting key used for dedup. It is namespaced by
    company so two companies can never collide, and it prefers the ATS's own
    posting id (stable across runs) rather than the URL (which can change).
    """

    company: str
    ats: str
    job_id: str
    title: str
    location: str
    url: str
    department: str = ""
    updated_at: str = ""
    raw: Optional[dict] = None

    @staticmethod
    def make_job_id(company: str, ats: str, native_id: Any) -> str:
        """Build a stable dedup key: ``company:ats:native_id``.

        Falls back to a hash when the ATS gives us no usable id so the key is
        still deterministic across runs.
        """
        slug = str(company).strip().lower().replace(" ", "-")
        if native_id in (None, "", 0):
            native_id = "nohash"
        return f"{slug}:{ats}:{native_id}"

    @staticmethod
    def hash_of(*parts: str) -> str:
        h = hashlib.sha1("|".join(p or "" for p in parts).encode("utf-8"))
        return h.hexdigest()[:12]


class FeedError(Exception):
    """Raised when a feed cannot be fetched or parsed.

    The monitor catches this per-company so one broken feed never aborts the
    whole run; the company is reported in the digest as needing a manual check.
    """


class BaseAdapter:
    """Interface every ATS adapter implements.

    Subclasses set ``ats`` and implement :meth:`fetch`. `token_or_url` is the
    registry field `board_token_or_url` — its meaning is adapter-specific
    (a Greenhouse board token, a Lever company slug, an Ashby job-board name,
    or a full Workday endpoint).
    """

    ats: str = "base"

    def __init__(self, session: Optional[requests.Session] = None,
                 timeout: int = DEFAULT_TIMEOUT):
        self.session = session or requests.Session()
        self.session.headers.setdefault("User-Agent", USER_AGENT)
        self.timeout = timeout

    def fetch(self, company: str, token_or_url: str) -> list[Posting]:
        raise NotImplementedError

    # -- helpers shared by subclasses -------------------------------------
    def _get_json(self, url: str, **kwargs) -> Any:
        try:
            resp = self.session.get(url, timeout=self.timeout, **kwargs)
        except requests.RequestException as exc:
            raise FeedError(f"GET {url} failed: {exc}") from exc
        if resp.status_code != 200:
            raise FeedError(f"GET {url} -> HTTP {resp.status_code}")
        try:
            return resp.json()
        except ValueError as exc:
            raise FeedError(f"GET {url} returned non-JSON: {exc}") from exc

    def _post_json(self, url: str, payload: dict, **kwargs) -> Any:
        try:
            resp = self.session.post(url, json=payload, timeout=self.timeout,
                                     **kwargs)
        except requests.RequestException as exc:
            raise FeedError(f"POST {url} failed: {exc}") from exc
        if resp.status_code != 200:
            raise FeedError(f"POST {url} -> HTTP {resp.status_code}")
        try:
            return resp.json()
        except ValueError as exc:
            raise FeedError(f"POST {url} returned non-JSON: {exc}") from exc


def flatten_postings(results: Iterable[Iterable[Posting]]) -> list[Posting]:
    out: list[Posting] = []
    for group in results:
        out.extend(group)
    return out
