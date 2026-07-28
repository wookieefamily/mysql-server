#!/usr/bin/env python3
"""Verify ATS feeds and update the registry with confirmed status.

Run this wherever outbound HTTPS to the ATS hosts is allowed (locally, or the
GitHub Action's first run). It does the Section-9 verification tasks that could
not be done in a network-restricted build environment:

  * probes each candidate board token against the real public API,
  * auto-detects the ATS when a company is marked ats:"auto" or a candidate
    token fails on its declared ATS but resolves on another,
  * checks whether the (verified) feed currently contains a QUALIFYING,
    matching internship posting, and
  * rewrites companies.json: corrected ats / board_token_or_url, and
    offers_qualifying_internship set to yes / no / unknown.

It NEVER invents data: a token that does not resolve is left as-is and reported
as unverified; offers_qualifying_internship becomes "no" only when the feed
resolved and held no qualifying posting *at check time* (postings are seasonal,
so this is advisory — see the report notes).

Usage:
  python scripts/verify_feeds.py                # verify, print report, dry-run
  python scripts/verify_feeds.py --write        # also rewrite companies.json
  python scripts/verify_feeds.py --only greenhouse,lever,ashby
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
sys.path.insert(0, os.path.join(ROOT, "src"))

import requests  # noqa: E402

from internship_monitor.adapters import FeedError, get_adapter  # noqa: E402
from internship_monitor.matcher import Matcher, MatchConfig  # noqa: E402
from internship_monitor.registry import Company, load_companies  # noqa: E402

CANDIDATE_ATS = ["greenhouse", "lever", "ashby"]  # tried during auto-detect


def _candidate_tokens(company: Company) -> list[str]:
    """Guess plausible slugs from the company name if none is set."""
    base = company.board_token_or_url.strip()
    guesses = [base] if base and "://" not in base else []
    name = company.company.split("(")[0].strip().lower()
    slug = "".join(ch for ch in name if ch.isalnum())
    guesses.append(slug)
    guesses.append(slug.replace("the", "", 1))
    seen, out = set(), []
    for g in guesses:
        if g and g not in seen:
            seen.add(g)
            out.append(g)
    return out


def verify_company(company: Company, matcher: Matcher,
                   session: requests.Session, only: set[str]) -> dict:
    result = {
        "company": company.company,
        "declared_ats": company.ats,
        "resolved_ats": None,
        "resolved_token": None,
        "feed_ok": False,
        "postings": 0,
        "qualifying": 0,
        "offers_qualifying_internship": company.offers_qualifying_internship,
        "note": "",
    }

    declared = (company.ats or "").lower()
    if declared in ("manual", "none", "other", ""):
        result["note"] = "manual check — no supported public feed declared"
        return result

    # Which ATS/token combos to try.
    attempts: list[tuple[str, str]] = []
    if declared == "auto":
        for ats in CANDIDATE_ATS:
            if only and ats not in only:
                continue
            for tok in _candidate_tokens(company):
                attempts.append((ats, tok))
    else:
        if not only or declared in only:
            if company.board_token_or_url and "://" not in company.board_token_or_url:
                attempts.append((declared, company.board_token_or_url.strip()))
            # fall back to auto-detect if the declared token fails
            for ats in CANDIDATE_ATS:
                for tok in _candidate_tokens(company):
                    if (ats, tok) not in attempts:
                        attempts.append((ats, tok))

    for ats, token in attempts:
        adapter = get_adapter(ats, session=session)
        if adapter is None:
            continue
        try:
            postings = adapter.fetch(company.company, token)
        except FeedError:
            continue
        # resolved
        result["feed_ok"] = True
        result["resolved_ats"] = ats
        result["resolved_token"] = token
        result["postings"] = len(postings)
        qualifying = 0
        for p in postings:
            m = matcher.evaluate(
                p, location_filter=company.location_filter,
                treat_all_as_intern=company.treat_all_as_intern)
            if m.matched:
                qualifying += 1
        result["qualifying"] = qualifying
        if qualifying > 0:
            result["offers_qualifying_internship"] = "yes"
            result["note"] = f"{qualifying} qualifying posting(s) live now"
        else:
            # feed works but nothing qualifying right now -> advisory 'no'
            result["offers_qualifying_internship"] = "no"
            result["note"] = ("feed OK; no qualifying posting at check time "
                              "(seasonal — keep monitoring)")
        return result

    result["note"] = "no candidate token resolved — left unverified (manual)"
    return result


def main(argv=None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true",
                        help="rewrite companies.json with verified status")
    parser.add_argument("--only", default="",
                        help="comma list of ats to check (default all)")
    args = parser.parse_args(argv)
    only = {x.strip().lower() for x in args.only.split(",") if x.strip()}

    companies_path = os.path.join(ROOT, "config", "companies.json")
    matching_path = os.path.join(ROOT, "config", "matching.yaml")
    companies = load_companies(companies_path)
    matcher = Matcher(MatchConfig.load(matching_path))
    session = requests.Session()

    results = []
    for c in companies:
        results.append(verify_company(c, matcher, session, only))

    ok = sum(1 for r in results if r["feed_ok"])
    yes = sum(1 for r in results if r["offers_qualifying_internship"] == "yes")
    print(f"Verified {len(results)} companies: {ok} feeds resolved, "
          f"{yes} with a qualifying posting live now.\n")
    for r in sorted(results, key=lambda x: (not x["feed_ok"], x["company"])):
        mark = "OK " if r["feed_ok"] else "-- "
        print(f"{mark} {r['company']}: ats={r['resolved_ats'] or r['declared_ats']} "
              f"token={r['resolved_token'] or '-'} "
              f"postings={r['postings']} qualifying={r['qualifying']} "
              f"=> {r['offers_qualifying_internship']} | {r['note']}")

    if args.write:
        raw = json.load(open(companies_path, encoding="utf-8"))
        by_name = {r["company"]: r for r in results}
        for entry in raw["companies"]:
            r = by_name.get(entry["company"])
            if not r or not r["feed_ok"]:
                continue
            entry["ats"] = r["resolved_ats"]
            entry["board_token_or_url"] = r["resolved_token"]
            entry["offers_qualifying_internship"] = r["offers_qualifying_internship"]
            stamp = f"verified {dt.date.today().isoformat()}: {r['note']}"
            entry["notes"] = (entry.get("notes", "") + " | " + stamp).strip(" |")
        with open(companies_path, "w", encoding="utf-8") as fh:
            json.dump(raw, fh, indent=2, ensure_ascii=False)
            fh.write("\n")
        print(f"\nWrote verified status to {companies_path}")
    else:
        print("\n(dry run — pass --write to update companies.json)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
