"""Greenhouse public job-board adapter.

Endpoint (verified pattern, JSON):
    https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs

`?content=true` inlines the full description; we request it so the matcher can
scan the body for the engineering-exclusion keywords, not just the title.
"""

from __future__ import annotations

from .base import BaseAdapter, FeedError, Posting

API = "https://boards-api.greenhouse.io/v1/boards/{token}/jobs"


class GreenhouseAdapter(BaseAdapter):
    ats = "greenhouse"

    def fetch(self, company: str, token_or_url: str) -> list[Posting]:
        token = token_or_url.strip()
        if not token:
            raise FeedError(f"{company}: empty Greenhouse board token")
        url = API.format(token=token)
        data = self._get_json(url, params={"content": "true"})
        jobs = data.get("jobs", []) if isinstance(data, dict) else []
        postings: list[Posting] = []
        for job in jobs:
            loc = (job.get("location") or {}).get("name", "") or ""
            offices = ", ".join(
                o.get("name", "") for o in (job.get("offices") or []) if o.get("name")
            )
            departments = ", ".join(
                d.get("name", "") for d in (job.get("departments") or []) if d.get("name")
            )
            postings.append(
                Posting(
                    company=company,
                    ats=self.ats,
                    job_id=Posting.make_job_id(company, self.ats, job.get("id")),
                    title=job.get("title", "") or "",
                    location=" / ".join(x for x in (loc, offices) if x),
                    url=job.get("absolute_url", "") or "",
                    department=departments,
                    updated_at=job.get("updated_at", "") or "",
                    raw=job,
                )
            )
        return postings
