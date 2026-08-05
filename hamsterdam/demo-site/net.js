// ===========================================================================
// HAMSTERDAM — SHARED STATE CLIENT
// ===========================================================================
//
// Four phones, one document. Every change goes through mutate(), which applies
// your intent to the newest state the server has and retries if somebody else
// wrote first. That is what makes two phones on the same team both tapping
// "complete" safe, and what lets a phone that lost signal mid-curse catch up by
// simply re-reading.
//
// No content passes through here. The server stores an opaque object.

import { newState } from './engine.js';

const STATE_URL = '/api/state';
const PHOTO_URL = '/api/photo/';
const POLL_MS = 2500;
const MAX_RETRIES = 8;

const listeners = new Set();

let cached = { version: 0, state: null };
let etag = null;
let poller = null;

export const status = {
  connected: false,
  saving: false,
  lastError: null,
  lastSync: null,
};

function clone(obj) {
  return typeof structuredClone === 'function'
    ? structuredClone(obj)
    : JSON.parse(JSON.stringify(obj));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function notify() {
  for (const fn of listeners) {
    try { fn(cached.state, cached.version); } catch (err) { console.error(err); }
  }
}

function adopt(doc) {
  if (!doc || typeof doc.version !== 'number') return;
  cached = { version: doc.version, state: doc.state || null };
  status.lastSync = Date.now();
  status.connected = true;
  status.lastError = null;
  notify();
}

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Never null — an untouched game reads as a fresh state without writing one.
export function getState() {
  return cached.state || newState();
}

export function getVersion() {
  return cached.version;
}

export async function pull({ force = false } = {}) {
  try {
    const headers = etag && !force ? { 'if-none-match': etag } : {};
    const res = await fetch(STATE_URL, { headers, cache: 'no-store' });
    if (res.status === 304) {
      status.connected = true;
      status.lastError = null;
      status.lastSync = Date.now();
      return false;
    }
    if (!res.ok) throw new Error(`GET ${res.status}`);
    etag = res.headers.get('etag');
    adopt(await res.json());
    return true;
  } catch (err) {
    status.connected = false;
    status.lastError = String(err.message || err);
    notify();
    return false;
  }
}

// Apply `fn` to a draft of the newest state and save it.
//
// `fn` may be run more than once, so it must check whether the thing it is
// doing has already been done. Everything in engine.js does. If `fn` returns
// { ok: false }, nothing is written and the reason comes straight back.
export async function mutate(fn) {
  status.saving = true;
  notify();
  try {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
      const draft = cached.state ? clone(cached.state) : newState();
      let outcome;
      try {
        outcome = fn(draft);
      } catch (err) {
        status.lastError = String(err.message || err);
        return { ok: false, why: status.lastError };
      }
      if (outcome && outcome.ok === false) return outcome;

      let res;
      try {
        res = await fetch(STATE_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ expectedVersion: cached.version, state: draft }),
        });
      } catch (err) {
        status.connected = false;
        status.lastError = String(err.message || err);
        return { ok: false, why: 'No connection. Nothing was saved.' };
      }

      if (res.ok) {
        etag = res.headers.get('etag');
        adopt(await res.json());
        return outcome || { ok: true };
      }

      if (res.status === 409) {
        // Somebody else wrote first. Take their version and re-apply.
        adopt(await res.json());
        await sleep(50 + Math.random() * 150 * (attempt + 1));
        continue;
      }

      status.lastError = `POST ${res.status}`;
      return { ok: false, why: `Could not save (${res.status}).` };
    }
    status.lastError = 'too many conflicts';
    return { ok: false, why: 'Four phones wrote at once. Try that again.' };
  } finally {
    status.saving = false;
    notify();
  }
}

export function startPolling() {
  if (poller) return;
  pull();
  poller = setInterval(pull, POLL_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) pull({ force: true });
  });
  window.addEventListener('online', () => pull({ force: true }));
}

// --- Photos ----------------------------------------------------------------
//
// Stored as their own blob entries so the polled state document stays small —
// it only ever holds ids. Downscaled on the phone before upload, because this
// happens outdoors on mobile data.

const MAX_EDGE = 1280;
const QUALITY = 0.72;

async function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Older Safari ignores the option; fall through to an <img>.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('could not read that image'));
      img.src = url;
    });
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export async function downscale(file) {
  const src = await loadBitmap(file);
  const w = src.width || src.naturalWidth;
  const h = src.height || src.naturalHeight;
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  canvas.getContext('2d').drawImage(src, 0, 0, canvas.width, canvas.height);
  if (src.close) src.close();
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
}

export function newPhotoId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export async function uploadPhoto(file) {
  const blob = (await downscale(file)) || file;
  const id = newPhotoId();
  const res = await fetch(PHOTO_URL + id, {
    method: 'PUT',
    headers: { 'content-type': 'image/jpeg' },
    body: blob,
  });
  if (!res.ok) throw new Error(`photo upload failed (${res.status})`);
  return id;
}

export function photoUrl(id) {
  return PHOTO_URL + id;
}
