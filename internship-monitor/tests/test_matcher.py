import os

from internship_monitor.adapters.base import Posting
from internship_monitor.matcher import Matcher, MatchConfig

CFG = os.path.join(os.path.dirname(__file__), "..", "config", "matching.yaml")


def _matcher():
    return Matcher(MatchConfig.load(CFG))


def _p(title, location="San Francisco", dept="", content=""):
    return Posting(company="X", ats="greenhouse", job_id="x:greenhouse:1",
                   title=title, location=location, url="http://x",
                   department=dept, raw={"content": content})


def test_matches_analyst_intern_in_sf():
    r = _matcher().evaluate(_p("Data Analyst Intern"))
    assert r.matched
    assert "data" in r.include_hits or "analyst" in r.include_hits


def test_rejects_non_internship():
    r = _matcher().evaluate(_p("Senior Data Analyst"))
    assert not r.matched
    assert "not an internship" in r.reasons[0]


def test_rejects_out_of_geo():
    r = _matcher().evaluate(_p("Analyst Intern", location="Austin, TX"))
    assert not r.matched


def test_accepts_remote():
    r = _matcher().evaluate(_p("Research Intern", location="Remote - US"))
    assert r.matched


def test_excludes_engineering_only():
    r = _matcher().evaluate(_p("Software Engineering Intern",
                               content="software engineer role"))
    assert not r.matched
    assert r.excluded_by is not None


def test_non_eng_title_overrides_exclusion():
    # An "Analyst Intern" whose body mentions engineering should still pass.
    r = _matcher().evaluate(_p("Business Analyst Intern",
                               content="work with software engineering teams"))
    assert r.matched


def test_word_boundary_no_false_positive():
    # "data" must not fire on "metadata": the posting still matches (on the
    # "intern" keyword) but "data" must NOT appear among the include hits.
    r = _matcher().evaluate(_p("Metadata Coordinator Intern",
                               location="San Francisco"))
    assert r.matched
    assert "data" not in r.include_hits
    assert "intern" in r.include_hits


def test_treat_all_as_intern_flag():
    m = _matcher()
    p = _p("Data Associate", location="San Francisco")
    assert not m.evaluate(p).matched
    assert m.evaluate(p, treat_all_as_intern=True).matched
