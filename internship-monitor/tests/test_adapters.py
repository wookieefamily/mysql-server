from conftest import FakeSession

from internship_monitor.adapters import get_adapter
from internship_monitor.adapters.base import FeedError


def test_greenhouse_parses_and_namespaces_id():
    payload = {"jobs": [
        {"id": 123, "title": "Data Analyst Intern",
         "absolute_url": "https://boards.greenhouse.io/x/jobs/123",
         "location": {"name": "San Francisco, CA"},
         "offices": [{"name": "SF"}],
         "departments": [{"name": "Data"}],
         "updated_at": "2026-07-01"},
    ]}
    session = FakeSession({"boards-api.greenhouse.io": (payload, 200)})
    adapter = get_adapter("greenhouse", session=session)
    postings = adapter.fetch("Watershed", "watershed")
    assert len(postings) == 1
    p = postings[0]
    assert p.title == "Data Analyst Intern"
    assert p.job_id == "watershed:greenhouse:123"
    assert "San Francisco" in p.location


def test_lever_parses_categories():
    payload = [
        {"id": "abc", "text": "Summer Analyst",
         "hostedUrl": "https://jobs.lever.co/kevala/abc",
         "categories": {"location": "San Francisco", "team": "Data"},
         "createdAt": 1710000000000},
    ]
    session = FakeSession({"api.lever.co": (payload, 200)})
    adapter = get_adapter("lever", session=session)
    postings = adapter.fetch("Kevala", "kevala")
    assert postings[0].job_id == "kevala:lever:abc"
    assert postings[0].location == "San Francisco"


def test_ashby_parses_jobs():
    payload = {"jobs": [
        {"id": "uuid-1", "title": "Policy Intern",
         "location": "Remote", "jobUrl": "https://jobs.ashbyhq.com/verse/uuid-1",
         "department": "Policy", "publishedAt": "2026-06-01"},
    ]}
    session = FakeSession({"api.ashbyhq.com": (payload, 200)})
    adapter = get_adapter("ashby", session=session)
    postings = adapter.fetch("Verse", "verse")
    assert postings[0].job_id == "verse:ashby:uuid-1"
    assert postings[0].location == "Remote"


def test_http_error_raises_feederror():
    session = FakeSession({"boards-api.greenhouse.io": ({}, 404)})
    adapter = get_adapter("greenhouse", session=session)
    try:
        adapter.fetch("Nope", "nope")
        assert False, "expected FeedError"
    except FeedError:
        pass


def test_workday_requires_cxs_url():
    adapter = get_adapter("workday", session=FakeSession({}))
    try:
        adapter.fetch("PG&E", "https://pge.wd1.myworkdayjobs.com/careers")
        assert False, "expected FeedError for non-CxS URL"
    except FeedError as exc:
        assert "manual check" in str(exc)


def test_manual_ats_has_no_adapter():
    assert get_adapter("manual") is None
    assert get_adapter("none") is None
