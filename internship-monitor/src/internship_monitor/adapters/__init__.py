"""ATS adapter registry.

`get_adapter(ats)` returns a ready adapter instance, or None for values that
have no live feed (`none`, `manual`, `other`) — those companies are handled as
manual checks by the monitor.
"""

from __future__ import annotations

from typing import Optional

import requests

from .ashby import AshbyAdapter
from .base import BaseAdapter, FeedError, Posting, flatten_postings
from .greenhouse import GreenhouseAdapter
from .lever import LeverAdapter
from .workday import WorkdayAdapter

# ats values that intentionally have no adapter -> manual check every run.
MANUAL_ATS = {"none", "manual", "other", "", None}

_CLASSES = {
    "greenhouse": GreenhouseAdapter,
    "lever": LeverAdapter,
    "ashby": AshbyAdapter,
    "workday": WorkdayAdapter,
}


def get_adapter(ats: str, session: Optional[requests.Session] = None
                ) -> Optional[BaseAdapter]:
    key = (ats or "").strip().lower()
    cls = _CLASSES.get(key)
    if cls is None:
        return None
    return cls(session=session)


def supported_ats() -> list[str]:
    return sorted(_CLASSES)


__all__ = [
    "get_adapter",
    "supported_ats",
    "MANUAL_ATS",
    "BaseAdapter",
    "FeedError",
    "Posting",
    "flatten_postings",
]
