# Memory Board

A full-screen daily schedule display for a wall-mounted iPad. It reads a single
Google Calendar and shows today's events in large, high-contrast text. There is
no edit mode. You manage the schedule from the Google Calendar app on your
phone. The board is read only.

## How it works

- Dark theme: black background, white text, big bold type for readability.
- Time and date pill at the top.
- All-day events show first under the pill, labeled TODAY.
- Timed events list below in 12-hour time. Past events turn grey.
- A coral RIGHT NOW bar marks the event happening now. In a gap it jumps to the
  next event and reads NEXT UP. After the last event of the day it disappears.
- The board fetches today's events on load and refreshes every 5 minutes.
- On a successful fetch it caches the result in localStorage. If the API call
  fails or the internet is down, it keeps showing the last known events and
  never goes blank.
- No events today shows "A quiet day. Nothing scheduled."

## Local development

```
cp .env.example .env.local   # then fill in your API key
npm install
npm run dev
```

Open the URL Vite prints. The page will read live events from the calendar once
the API key is set.

## Configuration

Two environment variables, both read at build time by Vite:

- `VITE_GOOGLE_CALENDAR_API_KEY` (required): your Google Cloud API key.
- `VITE_CALENDAR_ID` (optional): the calendar ID. The app already defaults to
  the "Mom's Day" calendar, so you only need this to point at a different one.

Note: variables that start with `VITE_` are baked into the browser bundle, so
the API key is visible to anyone who views the page source. That is acceptable
here because the calendar is public and the key is read only. Lock the key down
in Google Cloud (see below) so it cannot be used for anything else.

## Google setup

### 1. Make the calendar public

In Google Calendar on the web, open the "Mom's Day" calendar settings, go to
"Access permissions for events," and turn on "Make available to public." Set the
visibility to "See all event details." Keep sensitive details (full addresses,
account numbers) out of event titles and descriptions, since a public calendar
can be read by anyone who has the ID.

### 2. Create an API key

1. Go to the Google Cloud Console and create or pick a project.
2. Enable the "Google Calendar API" for that project.
3. Go to APIs and Services, Credentials, Create credentials, API key.
4. Edit the key. Under "API restrictions," restrict it to the Google Calendar
   API. Under "Application restrictions," choose "Websites" and add your site's
   domain (for example `https://your-site.netlify.app/*` and your custom domain
   if you have one).
5. Copy the key into Netlify as `VITE_GOOGLE_CALENDAR_API_KEY`.

## Deploy to Netlify

1. Push this repo to GitHub.
2. In Netlify, create a new site from the repo.
3. The `netlify.toml` already sets the base folder to `memory-board`, the build
   command to `npm run build`, and the publish folder to `dist`. You should not
   need to change those.
4. In Site settings, Environment variables, add
   `VITE_GOOGLE_CALENDAR_API_KEY` with your key. Add `VITE_CALENDAR_ID` only if
   you are using a different calendar.
5. Deploy. Every push to the branch redeploys automatically.

## iPad kiosk setup (Guided Access)

This locks the iPad to the board so it cannot be swiped away or closed.

1. On the iPad, open Settings, Accessibility, Guided Access, and turn it on. Set
   a passcode you will remember.
2. Open Safari and go to your Netlify URL. Tap the share icon and choose "Add to
   Home Screen" so it opens full screen without the browser bars. Open it from
   the new home screen icon.
3. Triple-click the side or home button to start Guided Access. Circle any areas
   you want to disable if needed, then tap Start.
4. To exit later, triple-click again and enter your passcode.

Also worth setting, under Settings, Display and Brightness:

- Auto-Lock: Never, so the screen stays on.
- Keep the iPad on its charger, since "never sleep" drains the battery.
