"""Best-effort Workday adapter.

Workday has no single public board API. Each tenant exposes a per-tenant
CxS endpoint of the form::

    https://{tenant}.{dc}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs

which accepts a POST with a JSON body ``{"limit":20,"offset":0,"searchText":""}``
and returns paginated results. The exact host/site is tenant-specific and can
change, so the registry stores the *full* CxS URL in `board_token_or_url`.

This adapter is deliberately conservative: if the stored value is not a full
CxS URL, it raises FeedError so the company falls through to a manual check
rather than silently reporting zero postings.
"""

from __future__ import annotations

from urllib.parse import urlparse

from .base import BaseAdapter, FeedError, Posting

PAGE_SIZE = 20
MAX_PAGES = 25  # safety cap: 500 postings is plenty for one employer


class WorkdayAdapter(BaseAdapter):
    ats = "workday"

    def fetch(self, company: str, token_or_url: str) -> list[Posting]:
        url = token_or_url.strip()
        if "/wday/cxs/" not in url:
            raise FeedError(
                f"{company}: Workday needs a full CxS jobs URL "
                f"(.../wday/cxs/.../jobs); got {url!r} -> manual check"
            )
        base = url.rsplit("/jobs", 1)[0]
        host = urlparse(url).netloc
        postings: list[Posting] = []
        offset = 0
        for _ in range(MAX_PAGES):
            payload = {"appliedFacets": {}, "limit": PAGE_SIZE,
                       "offset": offset, "searchText": ""}
            data = self._post_json(url, payload,
                                   headers={"Accept": "application/json"})
            jobs = data.get("jobPostings", []) if isinstance(data, dict) else []
            if not jobs:
                break
            for job in jobs:
                ext = job.get("externalPath", "") or ""
                full_url = f"https://{host}{ext}" if ext else ""
                postings.append(
                    Posting(
                        company=company,
                        ats=self.ats,
                        job_id=Posting.make_job_id(
                            company, self.ats,
                            job.get("bulletFields", [ext])[0] if job.get("bulletFields") else ext,
                        ),
                        title=job.get("title", "") or "",
                        location=job.get("locationsText", "") or "",
                        url=full_url,
                        updated_at=job.get("postedOn", "") or "",
                        raw=job,
                    )
                )
            total = data.get("total", 0) if isinstance(data, dict) else 0
            offset += PAGE_SIZE
            if offset >= total:
                break
        return postings
