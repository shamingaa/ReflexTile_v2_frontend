const base = import.meta.env.VITE_API_BASE || 'https://tilegame-api.atlasholdin.com';

export async function fetchScores(mode) {
  const query = new URLSearchParams();
  if (mode) query.set('mode', mode);
  query.set('limit', '5');
  const res = await fetch(`${base}/api/scores?${query.toString()}`);
  if (!res.ok) throw new Error('Failed to load scores');
  return res.json();
}

export async function submitScore({ playerName, score, mode, deviceId }) {
  const res = await fetch(`${base}/api/scores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerName, score, mode, deviceId }),
  });
  if (res.status === 409) {
    throw new Error('Name is taken. Pick another one.');
  }
  if (!res.ok) throw new Error('Failed to store score');
  return res.json();
}
