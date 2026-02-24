const base = import.meta.env.VITE_API_BASE || '';

export async function fetchScores(mode, period) {
  const query = new URLSearchParams();
  if (mode)           query.set('mode',   mode);
  if (period === 'week') query.set('period', 'week');
  const res = await fetch(`${base}/api/scores?${query.toString()}`);
  if (!res.ok) throw new Error('Failed to load scores');
  return res.json();
}

export async function registerPlayer({ playerName, deviceId, contact }) {
  const res = await fetch(`${base}/api/scores/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerName, deviceId, contact }),
  });
  if (res.status === 409) {
    const data = await res.json().catch(() => ({}));
    if (data.error === 'contact_taken') throw new Error('That email/phone is already registered.');
    throw new Error('That player tag is already taken.');
  }
  if (!res.ok) throw new Error('Failed to register');
  return res.json();
}

export async function submitScore({ playerName, score, mode, deviceId, contact }) {
  const res = await fetch(`${base}/api/scores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerName, score, mode, deviceId, contact }),
  });
  if (res.status === 409) throw new Error('That name is taken — pick another one.');
  if (!res.ok) throw new Error('Failed to store score');
  return res.json();
}

const BRAND_TAPS_KEY = 'arcade_arena_brand_taps';

export function trackLogoTap(brand, deviceId) {
  // Store locally for UI display
  try {
    const taps = JSON.parse(localStorage.getItem(BRAND_TAPS_KEY) || '{}');
    taps[brand] = (taps[brand] || 0) + 1;
    localStorage.setItem(BRAND_TAPS_KEY, JSON.stringify(taps));
  } catch { /* noop */ }

  // Fire-and-forget to server
  fetch(`${base}/api/analytics/logo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brand, deviceId, event: 'tap' }),
  }).catch(() => { /* no network — that's ok */ });
}

export function readBrandTaps() {
  try { return JSON.parse(localStorage.getItem(BRAND_TAPS_KEY) || '{}'); }
  catch { return {}; }
}
