# Summer-2027 Internship Targeting & Monitoring System

An API-first monitor that watches ~70 target companies' **official** job feeds,
catches newly posted internships Peter qualifies for the moment they appear,
dedupes against prior runs, updates a tracker spreadsheet, and emails a weekly
digest with a fit-triage note per match.

Built to the handoff brief. It **detects live postings** instead of maintaining
fragile "applications open" calendars, and it uses structured ATS APIs — never
scrapes LinkedIn/Indeed/Google Jobs.

---

## What it does each run

1. Decide which companies are **due** (weekly sweep; `early_opener` programs get
   an extra mid-week sweep during Aug–Oct so short windows aren't missed).
2. Pull current postings from each company's ATS via a typed adapter
   (Greenhouse / Lever / Ashby / best-effort Workday).
3. **Match** postings on include-keywords + location, minus an engineering-only
   exclusion list — all tunable in `config/matching.yaml`.
4. **Dedupe** against `data/seen_jobs.json` so only genuinely new postings surface.
5. **Triage** each new match (Claude API if configured, else a deterministic
   rule-based note): _apply now / tailor resume / skip_, with a one-line reason.
6. Update `data/tracker.csv` (status, last-checked, posting URL).
7. Write `digests/digest-<date>.md` (+ `digests/latest.md`) and optionally
   email / Slack it.

Companies with **no supported feed** are never silently dropped — they land in
the digest's "manual check needed" section every run.

---

## Honesty guardrails (baked in, do not remove)

- **The seed list is hypotheses, not facts.** Every company starts
  `offers_qualifying_internship = unknown`. It becomes `yes`/`no` only after
  `scripts/verify_feeds.py` (or a real run) confirms against the live feed.
- **Board tokens in the registry are candidates**, usually the company slug.
  They are marked "candidate — verify" in each entry's `notes`. This build
  environment's network policy blocks the ATS hosts, so tokens **could not be
  confirmed here** — run `verify_feeds.py` where egress is allowed.
- **Coverage is not overstated.** 46 of 71 companies have no known public JSON
  feed and are manual checks; the digest says so.
- **Triage is not a decision.** A human reviews every suggestion before applying.
- **Nothing inflates Peter's profile.** The candidate summary used for triage
  (`fit_assessment.py`) is factual: real strengths, named gaps (SQL/Python
  developing, no GIS), and eligibility for non-engineering tracks only.
- **Class-year sensitivity is flagged.** E3 and the econ consultancies that
  recruit only near-graduation students carry `class_year_sensitive: true` and a
  note; matches from them are flagged ⚠️ in the digest.

---

## Layout

```
internship-monitor/
├── config/
│   ├── companies.json     # the registry (one entry per company)
│   └── matching.yaml       # keyword / location / exclusion filters (edit freely)
├── data/
│   ├── tracker.csv         # the tracker spreadsheet (Section-6 schema)
│   └── seen_jobs.json      # dedup state (committed so it persists across runs)
├── digests/                # generated markdown digests
├── scripts/
│   ├── verify_feeds.py     # probe real APIs, confirm tokens, set yes/no/unknown
│   └── seed_tracker.py     # rebuild tracker.csv from the registry
├── src/internship_monitor/
│   ├── adapters/           # greenhouse, lever, ashby, workday, base
│   ├── matcher.py  registry.py  dedup.py  tracker.py
│   ├── fit_assessment.py   # optional Claude triage, rule-based fallback
│   ├── digest.py  notify.py
│   └── monitor.py          # orchestrator + CLI
├── tests/                  # offline tests (mocked feeds), `pytest`
└── requirements.txt
../.github/workflows/internship-monitor.yml   # scheduled runner
```

---

## Run it locally

```bash
cd internship-monitor
pip install -r requirements.txt
export PYTHONPATH=src

python -m internship_monitor.monitor --validate         # config sanity
python -m internship_monitor.monitor --list-due          # who's due today
python -m internship_monitor.monitor --run --force       # check everyone now
```

Verify feeds and lock in real tokens (needs outbound HTTPS to the ATS hosts):

```bash
python scripts/verify_feeds.py            # dry run: prints what resolves
python scripts/verify_feeds.py --write    # rewrite companies.json with results
```

Run the tests (fully offline, mocked feeds):

```bash
pip install pytest && python -m pytest tests/ -q
```

---

## Deploy (GitHub Actions)

`../.github/workflows/internship-monitor.yml` runs the monitor on a schedule and
commits the updated tracker, state, and digest back to the repo.

- **Scheduled runs only fire from a repo's _default branch_.** To get the weekly
  cron, put `internship-monitor/` and the workflow on the default branch of the
  repo you deploy from (a personal job-search repo is ideal). `workflow_dispatch`
  works from any branch for manual runs / verification.
- Set repository **secrets** for delivery + LLM triage:
  `ANTHROPIC_API_KEY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`,
  `DIGEST_FROM`, `DIGEST_TO`, and/or `SLACK_WEBHOOK_URL`. Optional repo
  **variable** `FIT_MODEL` (default `claude-sonnet-5`).
- First deploy: run the workflow manually with **verify = true** to resolve
  board tokens, then let the weekly schedule take over.

---

## Tuning

Edit `config/matching.yaml` — `include_keywords`, `location_terms`,
`remote_terms`, `exclude_keywords`, and `non_eng_signals` (which rescue
qualifying non-eng titles at engineering-heavy employers). Expect 2–3 weeks of
tuning; matching is case-insensitive and word-boundary aware.

Add companies by appending to `config/companies.json`, then
`python scripts/seed_tracker.py`. Per-entry flags: `early_opener`,
`class_year_sensitive`(+`class_year_note`), `location_filter` (set `false` for
tiny teams that list only an HQ), `treat_all_as_intern` (small teams that don't
put "intern" in titles).

### Workday / other ATSes
Workday has no universal public board; store the **full CxS URL**
(`.../wday/cxs/<tenant>/<site>/jobs`) in `board_token_or_url` and set
`ats: workday`. If you can't get one, leave `ats: manual` and it stays a manual
check. SmartRecruiters/Workable/iCIMS adapters can be added under
`src/internship_monitor/adapters/` following `base.BaseAdapter`.

---

## Handoff to the resume pipeline

The digest's "next step" for a promising posting points at the existing
tailored-resume pipeline (`/tailored-resume-pipeline <posting URL>`) rather than
reimplementing resume tailoring — that, interview prep, and final apply/no-apply
judgment stay out of scope here.

---

## Verification status (as shipped)

Because this environment's egress policy blocks the ATS API hosts, per-company
feed verification (brief Section 9) was **not** completed at build time. What is
done vs. pending:

| Done | Pending (run `verify_feeds.py` with network) |
|---|---|
| System built + unit-tested offline (17 tests pass) | Confirm each candidate board token resolves |
| 71 companies seeded with category / location / tier / role types / flags | Confirm a **qualifying non-eng** intern role exists (drop those that fail) |
| ATS type guessed per company; 25 with candidate JSON tokens, 46 manual | Set `offers_qualifying_internship` to yes/no from live feeds |
| Class-year sensitivity + early-opener flags encoded | Capture real `typical_open_window` where discoverable |

Watershed's Greenhouse board (`watershed`) was the one token seen to exist via
web search; it is still marked `unknown` until a qualifying role is confirmed.
