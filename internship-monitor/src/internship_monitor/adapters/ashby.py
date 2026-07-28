"""Ashby public posting-API adapter.

Endpoint (verified pattern, JSON):
    https://api.ashbyhq.com/posting-api/job-board/{jobBoardName}

`?includeCompensation=true` is harmless and sometimes populated; the postings
array lives under `jobs`. Ashby ids are UUID strings and stable across runs.
"""

from __future__ import annotations

from .base import BaseAdapter, FeedError, Posting

API = "https://api.ashbyhq.com/posting-api/job-board/{token}"


class AshbyAdapter(BaseAdapter):
    ats = "ashby"

    def fetch(self, company: str, token_or_url: str) -> list[Posting]:
        token = token_or_url.strip()
        if not token:
            raise FeedError(f"{company}: empty Ashby job-board name")
        url = API.format(token=token)
        data = self._get_json(url, params={"includeCompensation": "true"})
        jobs = data.get("jobs", []) if isinstance(data, dict) else []
        postings: list[Posting] = []
        for job in jobs:
            loc = job.get("location", "") or ""
            if not loc and isinstance(job.get("address"), dict):
                pa = job["address"].get("postalAddress", {}) or {}
                loc = pa.get("addressLocality", "") or ""
            postings.append(
                Posting(
                    company=company,
                    ats=self.ats,
                    job_id=Posting.make_job_id(company, self.ats, job.get("id")),
                    title=job.get("title", "") or "",
                    location=loc,
                    url=job.get("jobUrl", "") or job.get("applyUrl", "") or "",
                    department=job.get("department", "") or job.get("team", "") or "",
                    updated_at=job.get("publishedAt", "") or "",
                    raw=job,
                )
            )
        return postings
