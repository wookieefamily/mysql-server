import { useState, useEffect, useCallback, Fragment } from 'react';

// The calendar ID is not secret (a public calendar exposes it anyway), so it
// ships with a default. The API key must come from an env var, never source.
const CALENDAR_ID =
  import.meta.env.VITE_CALENDAR_ID ||
  '1fb0675288d513a41a8097ab193d5f7601a439080ca5be6998be87dfd4f7963b@group.calendar.google.com';
const API_KEY = import.meta.env.VITE_GOOGLE_CALENDAR_API_KEY || '';

const CACHE_KEY = 'memoryboard-events';
const REFRESH_MS = 5 * 60 * 1000; // refresh the schedule every 5 minutes

const ACCENT = '#C8553D'; // coral
const WHITE = '#FFFFFF';
const GREY = '#B5B5B5'; // the "quiet day" message
const PAST_GREY = '#777777'; // events already over, dimmed back
const PILL_BG = '#1A1A1A';
const PILL_SUB = '#9A9A9A';

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

// 12-hour clock, used for both the header time and event start times.
function format12(date) {
  let h = date.getHours();
  const m = date.getMinutes();
  const period = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${String(m).padStart(2, '0')} ${period}`;
}

// Turn the raw Google Calendar events into a small, serializable shape we can
// cache in localStorage. All-day events have start.date, timed events have
// start.dateTime.
function normalize(events) {
  return events.map((ev) => {
    if (ev.start && ev.start.date) {
      return { id: ev.id, allDay: true, description: ev.summary || '' };
    }
    const start = ev.start && ev.start.dateTime ? new Date(ev.start.dateTime) : null;
    const end = ev.end && ev.end.dateTime ? new Date(ev.end.dateTime) : null;
    const startMs = start ? start.getTime() : null;
    // If an event somehow has no end, treat it as one hour long.
    const endMs = end ? end.getTime() : startMs != null ? startMs + 60 * 60 * 1000 : null;
    return { id: ev.id, allDay: false, startMs, endMs, description: ev.summary || '' };
  });
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    // ignore a bad or missing cache
  }
  return null;
}

export default function MemoryBoard() {
  const [now, setNow] = useState(new Date());
  const [items, setItems] = useState(() => readCache());
  // 'loading' until the first fetch resolves, unless we already had a cache.
  const [status, setStatus] = useState(() => (readCache() ? 'ready' : 'loading'));

  // Tick the clock every second.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    try {
      const today = new Date();
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

      const url = new URL(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events`
      );
      url.searchParams.set('key', API_KEY);
      url.searchParams.set('timeMin', start.toISOString());
      url.searchParams.set('timeMax', end.toISOString());
      url.searchParams.set('singleEvents', 'true');
      url.searchParams.set('orderBy', 'startTime');
      url.searchParams.set('maxResults', '50');

      const res = await fetch(url);
      if (!res.ok) throw new Error('http ' + res.status);
      const data = await res.json();
      const next = normalize(data.items || []);
      setItems(next);
      setStatus('ready');
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(next));
      } catch (e) {
        // storage full or blocked, not fatal
      }
    } catch (e) {
      // API failed or the internet is down. Keep showing the last known
      // events and never crash. Just stop the loading state.
      setStatus('ready');
    }
  }, []);

  // Fetch on load, then every 5 minutes.
  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const nowMs = now.getTime();
  const list = items || [];
  const allDay = list.filter((i) => i.allDay);
  const timed = list
    .filter((i) => !i.allDay && i.startMs != null)
    .sort((a, b) => a.startMs - b.startMs);

  // Find what to highlight: the event happening right now, or failing that the
  // next one coming up. After the last event there is nothing to highlight.
  let highlightId = null;
  let highlightLabel = null;
  const active = timed.find((i) => i.startMs <= nowMs && nowMs < i.endMs);
  if (active) {
    highlightId = active.id;
    highlightLabel = 'RIGHT NOW';
  } else {
    const upNext = timed.find((i) => i.startMs > nowMs);
    if (upNext) {
      highlightId = upNext.id;
      highlightLabel = 'NEXT UP';
    }
  }

  const dateLine = `${dayNames[now.getDay()]} ${monthNames[now.getMonth()]} ${now.getDate()} ${now.getFullYear()}`;
  const nothingToday = status === 'ready' && timed.length === 0 && allDay.length === 0;

  return (
    <div
      className="min-h-screen w-full"
      style={{ backgroundColor: '#000000', color: WHITE }}
    >
      <div className="px-10 sm:px-12 lg:px-16 pt-8 pb-12 flex flex-col">
        {/* Time and date pill */}
        <div className="text-center mb-7">
          <span
            className="inline-block rounded-full"
            style={{
              backgroundColor: PILL_BG,
              padding: '0.55rem 1.6rem',
              fontSize: 'clamp(1.4rem, 2.8vw, 2.25rem)',
            }}
          >
            <span style={{ fontWeight: 800, color: WHITE }}>{format12(now)}</span>
            <span style={{ fontWeight: 500, color: PILL_SUB, marginLeft: '0.7rem' }}>
              {dateLine}
            </span>
          </span>
        </div>

        {/* All-day events, pinned at the top */}
        {allDay.length > 0 && (
          <div className="text-center mb-8">
            {allDay.map((item) => (
              <div
                key={item.id}
                style={{
                  fontWeight: 800,
                  color: WHITE,
                  fontSize: 'clamp(1.6rem, 3.2vw, 2.5rem)',
                  letterSpacing: '0.02em',
                  lineHeight: 1.25,
                }}
              >
                <span style={{ color: ACCENT, marginRight: '0.5rem' }}>TODAY</span>
                {item.description}
              </div>
            ))}
          </div>
        )}

        {/* Timed schedule */}
        <div className="max-w-5xl w-full mx-auto">
          {nothingToday ? (
            <div
              className="text-center py-16"
              style={{ color: GREY, fontSize: 'clamp(1.75rem, 3.5vw, 2.75rem)', fontWeight: 700 }}
            >
              A quiet day. Nothing scheduled.
            </div>
          ) : (
            timed.map((item) => {
              const isPast = item.endMs <= nowMs;
              const isHighlight = item.id === highlightId;
              // Past events recede: dimmer, smaller, lighter weight, tighter
              // rows, so the focus stays on now and what is coming.
              const color = isPast ? PAST_GREY : WHITE;
              const fontSize = isPast
                ? 'clamp(1.4rem, 2.8vw, 2.2rem)'
                : 'clamp(2.5rem, 5.5vw, 4.5rem)';
              const fontWeight = isPast ? 600 : 800;
              const timeMin = isPast
                ? 'clamp(5rem, 10vw, 8rem)'
                : 'clamp(8rem, 16vw, 14rem)';
              return (
                <Fragment key={item.id}>
                  {isHighlight && (
                    <div className="flex items-center gap-4 mt-1 mb-1">
                      <div
                        style={{
                          color: ACCENT,
                          fontWeight: 800,
                          letterSpacing: '0.08em',
                          fontSize: 'clamp(1.1rem, 2.2vw, 1.6rem)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {highlightLabel}
                      </div>
                      <div
                        className="flex-1 rounded-full"
                        style={{ height: '4px', backgroundColor: ACCENT }}
                      />
                    </div>
                  )}
                  <div
                    className="flex items-center"
                    style={{
                      gap: isPast ? '1rem' : '1.5rem',
                      borderLeft: isHighlight
                        ? `10px solid ${ACCENT}`
                        : '10px solid transparent',
                      paddingLeft: '1rem',
                      paddingTop: isPast ? '0.15rem' : '0.6rem',
                      paddingBottom: isPast ? '0.15rem' : '0.6rem',
                    }}
                  >
                    <div
                      style={{
                        fontWeight,
                        color,
                        flexShrink: 0,
                        minWidth: timeMin,
                        fontSize,
                        lineHeight: 1.1,
                      }}
                    >
                      {format12(new Date(item.startMs))}
                    </div>
                    <div
                      style={{
                        fontWeight,
                        color,
                        fontSize,
                        lineHeight: 1.15,
                      }}
                    >
                      {item.description}
                    </div>
                  </div>
                </Fragment>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
