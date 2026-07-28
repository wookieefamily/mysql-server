import datetime as dt
import json
import os

import internship_monitor.monitor as monitor_mod
from internship_monitor.adapters.base import Posting
from internship_monitor.dedup import SeenStore


def test_dedup_only_new(tmp_path):
    store = SeenStore(str(tmp_path / "seen.json"))
    p1 = Posting("X", "greenhouse", "x:greenhouse:1", "Analyst Intern", "SF", "u")
    p2 = Posting("X", "greenhouse", "x:greenhouse:2", "Data Intern", "SF", "u")
    new = store.record([p1, p2], "2026-07-28")
    assert len(new) == 2
    # second run, same postings -> nothing new
    new2 = store.record([p1, p2], "2026-07-29")
    assert new2 == []
    assert store.data["x:greenhouse:1"]["last_seen"] == "2026-07-29"


class _FakeAdapter:
    ats = "greenhouse"

    def __init__(self, postings):
        self._postings = postings

    def fetch(self, company, token):
        return self._postings


def _write_config(root):
    os.makedirs(os.path.join(root, "config"), exist_ok=True)
    os.makedirs(os.path.join(root, "data"), exist_ok=True)
    companies = {"companies": [
        {"company": "Acme Energy", "category": "ai-energy", "location": "SF",
         "fit_tier": "A", "ats": "greenhouse", "board_token_or_url": "acme",
         "early_opener": False, "class_year_sensitive": False},
        {"company": "Manual Co", "category": "utility", "location": "SF",
         "fit_tier": "B", "ats": "manual",
         "board_token_or_url": "https://manual.example/careers"},
    ]}
    with open(os.path.join(root, "config", "companies.json"), "w") as fh:
        json.dump(companies, fh)
    # reuse the real matching.yaml
    src = os.path.join(os.path.dirname(__file__), "..", "config", "matching.yaml")
    with open(src) as fh:
        data = fh.read()
    with open(os.path.join(root, "config", "matching.yaml"), "w") as fh:
        fh.write(data)


def test_end_to_end_run(tmp_path, monkeypatch):
    root = str(tmp_path)
    _write_config(root)

    postings = [
        Posting("Acme Energy", "greenhouse", "acme-energy:greenhouse:1",
                "Data Analyst Intern", "San Francisco", "http://a/1",
                raw={"content": "energy analytics internship"}),
        Posting("Acme Energy", "greenhouse", "acme-energy:greenhouse:2",
                "Senior Software Engineer", "San Francisco", "http://a/2",
                raw={"content": "software engineer"}),
    ]
    monkeypatch.setattr(monitor_mod, "get_adapter",
                        lambda ats, session=None: _FakeAdapter(postings))

    # Monday so everything is due.
    run_date = dt.date(2026, 7, 27)  # a Monday
    summary = monitor_mod.run(root, run_date=run_date)

    assert summary["checked"] == 1          # Acme has a live feed
    assert summary["manual_checks"] == 1    # Manual Co
    assert summary["new_matches"] == 1      # only the analyst intern matches

    # tracker updated
    tracker_csv = open(os.path.join(root, "data", "tracker.csv")).read()
    assert "Acme Energy" in tracker_csv
    assert "open" in tracker_csv

    # digest written and mentions the match + manual section
    digest = open(os.path.join(root, "digests", "latest.md")).read()
    assert "Data Analyst Intern" in digest
    assert "Manual Co" in digest

    # second run: no new matches (deduped)
    summary2 = monitor_mod.run(root, run_date=dt.date(2026, 7, 28))
    assert summary2["new_matches"] == 0


def test_early_opener_cadence():
    from internship_monitor.registry import Company, should_check
    early = Company(company="Big Program", early_opener=True)
    normal = Company(company="Small Co", early_opener=False)
    # Thursday in September -> early opener due, normal not.
    thursday_sept = dt.date(2026, 9, 3)
    assert thursday_sept.weekday() == 3
    assert should_check(early, thursday_sept)
    assert not should_check(normal, thursday_sept)
    # Thursday in June (outside Aug-Oct) -> even early opener not due.
    thursday_june = dt.date(2026, 6, 4)
    assert thursday_june.weekday() == 3
    assert not should_check(early, thursday_june)
