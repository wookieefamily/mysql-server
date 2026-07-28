"""Monitor orchestrator + CLI entrypoint.

One run:
  1. Decide which companies are due (weekly, plus twice-weekly early openers
     during Aug-Oct), or all of them with ``--force``.
  2. For each due company with a live feed, pull postings via its ATS adapter.
  3. Match postings (keywords + location + engineering exclusion).
  4. Dedup against ``seen_jobs.json`` so only new matches surface.
  5. Triage each new match (Claude API if configured, else rule-based).
  6. Update the tracker CSV (status, last_checked, posting URL).
  7. Write the markdown digest and (optionally) email / Slack it.

Everything is written atomically and committed by the workflow, so state
survives across scheduled runs.

Usage:
  python -m internship_monitor.monitor --run          # scheduled run
  python -m internship_monitor.monitor --run --force  # check every company now
  python -m internship_monitor.monitor --validate     # config sanity only
  python -m internship_monitor.monitor --list-due     # show who is due today
"""

from __future__ import annotations

import argparse
import datetime as dt
import os
import sys
from typing import Optional

import requests

from .adapters import FeedError, get_adapter
from .dedup import SeenStore, today_str
from .digest import NewMatch, build_digest
from .fit_assessment import assess
from .matcher import Matcher, MatchConfig
from .notify import deliver
from .registry import Company, load_companies, should_check
from .tracker import Tracker

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))


def _paths(root: str) -> dict:
    return {
        "companies": os.path.join(root, "config", "companies.json"),
        "matching": os.path.join(root, "config", "matching.yaml"),
        "tracker": os.path.join(root, "data", "tracker.csv"),
        "seen": os.path.join(root, "data", "seen_jobs.json"),
        "digest_dir": os.path.join(root, "digests"),
    }


def run(root: str, *, force: bool = False,
        run_date: Optional[dt.date] = None,
        session: Optional[requests.Session] = None) -> dict:
    run_date = run_date or dt.date.today()
    paths = _paths(root)

    companies = load_companies(paths["companies"])
    matcher = Matcher(MatchConfig.load(paths["matching"]))
    tracker = Tracker(paths["tracker"]).load()
    seen = SeenStore(paths["seen"]).load()
    today = today_str()

    due = [c for c in companies if should_check(c, run_date, force=force)]

    new_matches: list[NewMatch] = []
    manual_checks: list[Company] = []
    feed_errors: list[tuple[str, str]] = []
    checked = 0
    postings_seen = 0

    for company in due:
        if not company.has_live_feed:
            manual_checks.append(company)
            tracker.upsert(company.company, last_checked=today,
                           current_status="unknown")
            continue

        adapter = get_adapter(company.ats, session=session)
        if adapter is None:
            manual_checks.append(company)
            continue

        checked += 1
        try:
            postings = adapter.fetch(company.company, company.board_token_or_url)
        except FeedError as exc:
            feed_errors.append((company.company, str(exc)))
            # A broken feed is NOT "closed"; leave status, note the failure.
            tracker.upsert(company.company, last_checked=today,
                           notes=_append_note(tracker, company.company,
                                              f"feed error {today}"))
            continue

        postings_seen += len(postings)
        matched = []
        for p in postings:
            result = matcher.evaluate(
                p, location_filter=company.location_filter,
                treat_all_as_intern=company.treat_all_as_intern)
            if result.matched:
                matched.append((p, result))

        new = seen.record([p for p, _ in matched], today)
        new_ids = {p.job_id for p in new}

        status = "open" if matched else "closed"
        top_url = matched[0][0].url if matched else ""
        tracker.upsert(company.company, last_checked=today,
                       current_status=status, current_posting_url=top_url,
                       offers_qualifying_internship=(
                           "yes" if matched else
                           company.offers_qualifying_internship))

        for p, result in matched:
            if p.job_id in new_ids:
                a = assess(p, result,
                           class_year_sensitive=company.class_year_sensitive)
                new_matches.append(
                    NewMatch(p, a, company.class_year_sensitive))

    seen.save()
    tracker.save()

    digest = build_digest(run_date, new_matches, manual_checks, feed_errors,
                          checked, postings_seen)
    os.makedirs(paths["digest_dir"], exist_ok=True)
    digest_path = os.path.join(paths["digest_dir"],
                               f"digest-{run_date.isoformat()}.md")
    with open(digest_path, "w", encoding="utf-8") as fh:
        fh.write(digest)
    # also keep a stable "latest" pointer
    with open(os.path.join(paths["digest_dir"], "latest.md"), "w",
              encoding="utf-8") as fh:
        fh.write(digest)

    delivery = []
    if os.environ.get("SEND_DIGEST") == "1" and new_matches:
        subject = (f"[internship-monitor] {len(new_matches)} new match(es) "
                   f"— {run_date.isoformat()}")
        delivery = deliver(subject, digest)

    return {
        "run_date": run_date.isoformat(),
        "due": len(due),
        "checked": checked,
        "postings_seen": postings_seen,
        "new_matches": len(new_matches),
        "manual_checks": len(manual_checks),
        "feed_errors": len(feed_errors),
        "digest_path": digest_path,
        "delivery": delivery,
    }


def _append_note(tracker: Tracker, company: str, addition: str) -> str:
    row = tracker.get(company)
    prev = (row or {}).get("notes", "")
    return (prev + "; " + addition).strip("; ") if prev else addition


def validate(root: str) -> list[str]:
    """Config sanity check — returns a list of problems (empty == OK)."""
    from .adapters import supported_ats, MANUAL_ATS
    paths = _paths(root)
    problems: list[str] = []
    try:
        companies = load_companies(paths["companies"])
    except Exception as exc:
        return [f"companies.json failed to load: {exc}"]
    try:
        MatchConfig.load(paths["matching"])
    except Exception as exc:
        problems.append(f"matching.yaml failed to load: {exc}")

    ok_ats = set(supported_ats()) | {str(x) for x in MANUAL_ATS if x is not None}
    for c in companies:
        ats = (c.ats or "").lower()
        if ats not in ok_ats:
            problems.append(f"{c.company}: unknown ats {c.ats!r}")
        if c.has_live_feed and not c.board_token_or_url.strip():
            problems.append(f"{c.company}: live ats but empty board_token_or_url")
        if c.fit_tier not in ("A", "B", "C", ""):
            problems.append(f"{c.company}: odd fit_tier {c.fit_tier!r}")
    return problems


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Internship monitor")
    parser.add_argument("--root", default=ROOT,
                        help="project root (default: package root)")
    parser.add_argument("--run", action="store_true", help="run a monitor pass")
    parser.add_argument("--force", action="store_true",
                        help="check every company regardless of cadence")
    parser.add_argument("--validate", action="store_true",
                        help="validate config and exit")
    parser.add_argument("--list-due", action="store_true",
                        help="list companies due today and exit")
    parser.add_argument("--date", default=None,
                        help="override run date (YYYY-MM-DD) for testing")
    args = parser.parse_args(argv)

    run_date = dt.date.fromisoformat(args.date) if args.date else dt.date.today()

    if args.validate:
        problems = validate(args.root)
        if problems:
            print("CONFIG PROBLEMS:")
            for p in problems:
                print("  -", p)
            return 1
        print("config OK")
        return 0

    if args.list_due:
        companies = load_companies(_paths(args.root)["companies"])
        due = [c for c in companies
               if should_check(c, run_date, force=args.force)]
        print(f"{len(due)} companies due on {run_date}:")
        for c in due:
            feed = c.ats if c.has_live_feed else f"{c.ats} (manual)"
            print(f"  - {c.company} [{feed}]")
        return 0

    if args.run:
        summary = run(args.root, force=args.force, run_date=run_date)
        for k, v in summary.items():
            print(f"{k}: {v}")
        return 0

    parser.print_help()
    return 0


if __name__ == "__main__":
    sys.exit(main())
