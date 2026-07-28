"""Lever postings adapter.

Endpoint (verified pattern, JSON):
    https://api.lever.co/v0/postings/{company}?mode=json

Lever exposes location under `categories.location` and a stable posting `id`.
"""

from __future__ import annotations

from .base import BaseAdapter, FeedError, Posting

API = "https://api.lever.co/v0/postings/{token}"


class LeverAdapter(BaseAdapter):
    ats = "lever"

    def fetch(self, company: str, token_or_url: str) -> list[Posting]:
        token = token_or_url.strip()
        if not token:
            raise FeedError(f"{company}: empty Lever company slug")
        url = API.format(token=token)
        data = self._get_json(url, params={"mode": "json"})
        if not isinstance(data, list):
            raise FeedError(f"{company}: unexpected Lever payload shape")
        postings: list[Posting] = []
        for job in data:
            cats = job.get("categories") or {}
            postings.append(
                Posting(
                    company=company,
                    ats=self.ats,
                    job_id=Posting.make_job_id(company, self.ats, job.get("id")),
                    title=job.get("text", "") or "",
                    location=cats.get("location", "") or "",
                    url=job.get("hostedUrl", "") or job.get("applyUrl", "") or "",
                    department=cats.get("team", "") or cats.get("department", "") or "",
                    updated_at=str(job.get("createdAt", "") or ""),
                    raw=job,
                )
            )
        return postings
