// HAMSTERDAM — shared state function.
//
// This file knows nothing about cards, coins, curses or rules. It is a dumb
// store with compare-and-swap semantics. All game logic lives on the client in
// content.js and engine.js, which is what keeps card text out of every network
// response: the server has never seen any.
//
// Deployed as a pre-bundled, zero-dependency file. Do not edit the copy in
// demo-site/netlify/functions/ — edit this one and run build.sh.
//
//   GET  /api/state          -> { version, state }        (ETag, honours If-None-Match)
//   POST /api/state          <- { expectedVersion, state } -> 200 | 409 with current
//   PUT  /api/photo/:id      <- image bytes
//   GET  /api/photo/:id      -> image bytes
//
// The 409 is the whole point. Two phones on the same team both tapping
// "complete" cannot clobber each other: the loser re-reads, re-applies its
// intent to the fresh state, and retries.

import { getStore } from '@netlify/blobs';

const STORE_NAME = 'hamsterdam-demo-state';
const STATE_KEY = 'state.json';
const PHOTO_PREFIX = 'photo/';

// Netlify Blobs caps a single entry well above this, but a phone photo has no
// business being larger and the state document must stay quick to poll.
const MAX_PHOTO_BYTES = 6 * 1024 * 1024;

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PUT,OPTIONS',
  'access-control-allow-headers': 'content-type,if-none-match',
};

const EMPTY_STATE = { version: 0, state: null };

function store() {
  // Strong consistency: a phone that just wrote must not read back a stale copy
  // from an edge cache, or the compare-and-swap loop would spin.
  return getStore({ name: STORE_NAME, consistency: 'strong' });
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...CORS_HEADERS, ...extra },
  });
}

async function readState(blobs) {
  const found = await blobs.getWithMetadata(STATE_KEY, { type: 'json' });
  if (!found) return { doc: EMPTY_STATE, etag: null };
  const doc = found.data && typeof found.data === 'object' ? found.data : EMPTY_STATE;
  return { doc, etag: found.etag ?? null };
}

async function handleGetState(req, blobs) {
  const { doc } = await readState(blobs);
  // Version doubles as the cache validator, so an unchanged poll costs a 304
  // and no body. Four phones polling every 2.5s outdoors on mobile data.
  const tag = `"v${doc.version}"`;
  if (req.headers.get('if-none-match') === tag) {
    return new Response(null, { status: 304, headers: { etag: tag, ...CORS_HEADERS } });
  }
  return json(doc, 200, { etag: tag });
}

async function handlePostState(req, blobs) {
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'malformed JSON body' }, 400);
  }

  const { expectedVersion, state } = body ?? {};
  if (typeof expectedVersion !== 'number' || !Number.isFinite(expectedVersion)) {
    return json({ error: 'expectedVersion must be a number' }, 400);
  }
  if (state === undefined) {
    return json({ error: 'state is required' }, 400);
  }

  const { doc, etag } = await readState(blobs);

  if (doc.version !== expectedVersion) {
    // Somebody else got there first. Hand back what is actually stored so the
    // client can re-apply its intent rather than guess.
    return json({ error: 'version conflict', ...doc }, 409);
  }

  const next = { version: doc.version + 1, state, updatedAt: new Date().toISOString() };

  // Conditional write closes the gap between the read above and this write.
  // onlyIfNew for the very first write, onlyIfMatch thereafter.
  const condition = etag === null ? { onlyIfNew: true } : { onlyIfMatch: etag };
  const result = await blobs.setJSON(STATE_KEY, next, condition);

  if (!result.modified) {
    const { doc: current } = await readState(blobs);
    return json({ error: 'version conflict', ...current }, 409);
  }

  return json(next, 200, { etag: `"v${next.version}"` });
}

async function handlePutPhoto(req, blobs, id) {
  const bytes = await req.arrayBuffer();
  if (bytes.byteLength === 0) return json({ error: 'empty body' }, 400);
  if (bytes.byteLength > MAX_PHOTO_BYTES) {
    return json({ error: 'photo too large', limit: MAX_PHOTO_BYTES }, 413);
  }
  const type = req.headers.get('content-type') || 'image/jpeg';
  await blobs.set(PHOTO_PREFIX + id, bytes, { metadata: { type } });
  return json({ ok: true, id, bytes: bytes.byteLength });
}

async function handleGetPhoto(blobs, id) {
  const found = await blobs.getWithMetadata(PHOTO_PREFIX + id, { type: 'arrayBuffer' });
  if (!found || !found.data) return json({ error: 'not found' }, 404);
  return new Response(found.data, {
    status: 200,
    headers: {
      'content-type': String(found.metadata?.type || 'image/jpeg'),
      // Photos are immutable once written — the id is unique per capture.
      'cache-control': 'public, max-age=31536000, immutable',
      ...CORS_HEADERS,
    },
  });
}

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const photoMatch = url.pathname.match(/\/api\/photo\/([A-Za-z0-9_-]{1,128})$/);
  const blobs = store();

  try {
    if (photoMatch) {
      const id = photoMatch[1];
      if (req.method === 'PUT' || req.method === 'POST') return handlePutPhoto(req, blobs, id);
      if (req.method === 'GET') return handleGetPhoto(blobs, id);
      return json({ error: 'method not allowed' }, 405);
    }

    if (req.method === 'GET') return handleGetState(req, blobs);
    if (req.method === 'POST') return handlePostState(req, blobs);
    return json({ error: 'method not allowed' }, 405);
  } catch (err) {
    // Never leak a stack to four phones in a street.
    return json({ error: 'store unavailable', detail: String(err && err.message) }, 500);
  }
};

export const config = {
  path: ['/api/state', '/api/photo/:id'],
};
