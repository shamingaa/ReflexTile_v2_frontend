const base = import.meta.env.VITE_API_BASE || '';

const BRAND_TAPS_KEY  = 'arcade_arena_brand_taps';
const SCORE_QUEUE_KEY = 'arcade_arena_score_queue';
const TAP_QUEUE_KEY   = 'arcade_arena_tap_queue';

// Must match server SESSION_TTL + buffer so client discards stale queue items
// before even attempting the request (saves a round-trip).
const CLIENT_SESSION_TTL = 35 * 60 * 1000; // 35 min

// ── requestGameSession ───────────────────────────────────────────────────────
// Called at game-start. Returns a one-time token or null (offline / error).
export async function requestGameSession(deviceId) {
  try {
    const res = await fetch(`${base}/api/scores/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.sessionId || null;
  } catch { return null; }
}

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

// ── submitScore ──────────────────────────────────────────────────────────────
// On network/server failure: queues to localStorage and returns { queued: true }.
// On 403 (session invalid/expired): throws — the score cannot be verified, do not queue.
// On 409 (name conflict): throws — user must act.
export async function submitScore({ playerName, score, mode, deviceId, contact, sessionId, hits, fastestHit, avgReaction, reactionSD }) {
  try {
    const res = await fetch(`${base}/api/scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerName, score, mode, deviceId, contact, sessionId, hits, fastestHit, avgReaction, reactionSD }),
    });
    if (res.status === 409) throw new Error('That name is taken — pick another one.');
    if (res.status === 403) throw new Error('score_unverifiable'); // security check failed — don't queue
    if (res.status === 503) throw new Error('competition_closed'); // competition closed — don't queue
    if (!res.ok) throw new Error('Failed to store score');
    return res.json();
  } catch (err) {
    // These errors must propagate — no point queueing
    if (err.message.includes('name is taken') || err.message === 'score_unverifiable' || err.message === 'competition_closed') throw err;
    // Network or server error — enqueue; keep highest score per device+mode
    try {
      const queue = JSON.parse(localStorage.getItem(SCORE_QUEUE_KEY) || '[]');
      const normalizedMode = mode || 'solo';
      const idx = queue.findIndex((q) => q.deviceId === deviceId && q.mode === normalizedMode);
      if (idx >= 0) {
        if (queue[idx].score < score) {
          queue[idx] = { playerName, score, mode: normalizedMode, deviceId, contact, sessionId, hits, fastestHit, avgReaction, reactionSD, queuedAt: Date.now() };
        }
      } else {
        queue.push({ playerName, score, mode: normalizedMode, deviceId, contact, sessionId, hits, fastestHit, avgReaction, reactionSD, queuedAt: Date.now() });
      }
      localStorage.setItem(SCORE_QUEUE_KEY, JSON.stringify(queue));
    } catch { /* noop */ }
    return { queued: true };
  }
}

// ── trackLogoTap ─────────────────────────────────────────────────────────────
// Sends the running total (not an increment) so the server can use MAX — safe to retry.
// On failure: queues the latest total for retry.
export function trackLogoTap(brand, deviceId) {
  let newTotal = 1;
  try {
    const taps = JSON.parse(localStorage.getItem(BRAND_TAPS_KEY) || '{}');
    taps[brand] = (taps[brand] || 0) + 1;
    newTotal = taps[brand];
    localStorage.setItem(BRAND_TAPS_KEY, JSON.stringify(taps));
  } catch { /* noop */ }

  fetch(`${base}/api/analytics/logo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brand, deviceId, taps: newTotal }),
  }).catch(() => {
    // Queue latest total for retry; keep highest total per brand+device
    try {
      const queue = JSON.parse(localStorage.getItem(TAP_QUEUE_KEY) || '[]');
      const idx = queue.findIndex((q) => q.brand === brand && q.deviceId === deviceId);
      if (idx >= 0) {
        queue[idx].total = Math.max(queue[idx].total, newTotal);
      } else {
        queue.push({ brand, deviceId, total: newTotal, queuedAt: Date.now() });
      }
      localStorage.setItem(TAP_QUEUE_KEY, JSON.stringify(queue));
    } catch { /* noop */ }
  });
}

// ── drainQueues ───────────────────────────────────────────────────────────────
// Retries all queued score submissions and tap syncs.
// Returns { scoresSynced: N } so the caller can refresh the leaderboard if needed.
export async function drainQueues() {
  let scoresSynced = 0;

  // -- scores --
  try {
    const queue = JSON.parse(localStorage.getItem(SCORE_QUEUE_KEY) || '[]');
    if (queue.length) {
      const remaining = [];
      for (const item of queue) {
        // Discard items whose session token has definitely expired (saves a round-trip)
        if (item.queuedAt && Date.now() - item.queuedAt > CLIENT_SESSION_TTL) continue;
        try {
          await new Promise((r) => setTimeout(r, 300)); // respect rate-limit gap
          const res = await fetch(`${base}/api/scores`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item),
          });
          if (res.ok) {
            scoresSynced++;
          } else if (res.status === 409 || res.status === 403) {
            // Name conflict or session invalid — discard, do not retry
          } else {
            remaining.push(item); // transient server error — keep for next attempt
          }
        } catch {
          remaining.push(item); // network error — keep for next attempt
        }
      }
      localStorage.setItem(SCORE_QUEUE_KEY, JSON.stringify(remaining));
    }
  } catch { /* noop */ }

  // -- taps --
  try {
    const queue = JSON.parse(localStorage.getItem(TAP_QUEUE_KEY) || '[]');
    if (queue.length) {
      const remaining = [];
      for (const item of queue) {
        try {
          const res = await fetch(`${base}/api/analytics/logo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ brand: item.brand, deviceId: item.deviceId, taps: item.total }),
          });
          if (!res.ok) remaining.push(item);
        } catch {
          remaining.push(item);
        }
      }
      localStorage.setItem(TAP_QUEUE_KEY, JSON.stringify(remaining));
    }
  } catch { /* noop */ }

  return { scoresSynced };
}

export function hasPendingQueue() {
  try {
    const s = JSON.parse(localStorage.getItem(SCORE_QUEUE_KEY) || '[]');
    const t = JSON.parse(localStorage.getItem(TAP_QUEUE_KEY) || '[]');
    return s.length + t.length;
  } catch { return 0; }
}

export async function fetchTapLeaderboard() {
  const res = await fetch(`${base}/api/analytics/logo/leaderboard`);
  if (!res.ok) throw new Error('Failed to load tap leaderboard');
  return res.json();
}

export function readBrandTaps() {
  try { return JSON.parse(localStorage.getItem(BRAND_TAPS_KEY) || '{}'); }
  catch { return {}; }
}
