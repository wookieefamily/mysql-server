# 28-Day Indoor Walking + Low-Impact Calisthenics

A self-contained, clickable habit tracker. No jumping — every move keeps at least one foot grounded.

## 🌐 Live site (GitHub Pages)

Once Pages is turned on (one-time, see below), the tracker is live at:

**https://wookieefamily.github.io/mysql-server/**

Open that link on your phone or laptop and tap days off — no download needed.

### One-time setup to publish it
This `docs/` folder is the published site. To turn Pages on:

1. Go to the repo **Settings → Pages** (`https://github.com/wookieefamily/mysql-server/settings/pages`).
2. Under **Build and deployment → Source**, choose **Deploy from a branch**.
3. **Branch:** `claude/28day-indoor-walking-plan-74p4xz` &nbsp;•&nbsp; **Folder:** `/docs` &nbsp;→ **Save**.
4. Wait ~1 minute, refresh the Pages settings page, and the green **"Your site is live at …"** link appears.

> To keep the URL stable long-term, merge this branch into your default branch and switch the
> Pages source branch to that — the site content is identical.

## 📱 Install it like an app (PWA)
The tracker is a Progressive Web App — add it to your home screen and it opens full-screen,
with its own icon, and **works offline**.

- **iPhone / iPad (Safari):** open the live link → tap **Share** → **Add to Home Screen** → **Add**.
- **Android (Chrome):** open the live link → tap the **⬇ Install app** button (or menu **⋮ → Install app**).
- **Desktop (Chrome/Edge):** click the install icon in the address bar, or the **⬇ Install app** button.

After install it launches like a native app — no browser chrome — and your progress works without a connection.

## How to use
1. Open the **live link above** (or open `index.html` locally by double-clicking it).
2. Do the day's session (10–15 min): warm-up → main moves → cool-down stretch.
3. Tap **Mark done** on that day's card.

Your progress (checked days, streak, % complete) saves automatically in the browser via
`localStorage` — close the tab and come back anytime. Use **Reset progress** to start over.

> Progress is stored per-device/per-browser, so checking days off on your phone and your laptop
> are tracked separately.

## What's inside
- **4 weeks**, progressive: Foundation → Build → Push → Peak.
- Each day shows an **illustrated icon (SVG)** for every exercise plus reps/time/holds.
- Active-recovery and rest days built in so nothing gets overtrained.
- Dashboard: progress ring, percent complete, current streak, days left.

## Scaling
- **Easier:** chair-supported squats, wall/knee variations, shorter holds.
- **Harder:** add a second round, slow the tempo, or hold light weights.

Single file, no dependencies, works offline.
