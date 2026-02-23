import React, { useEffect, useState } from 'react';
import GameBoard from './components/GameBoard';
import Leaderboard from './Leaderboard';
import { fetchScores, submitScore } from './api';
import './styles.css';

const DEVICE_KEY  = 'arcade_arena_device';
const NAME_KEY    = 'arcade_arena_player';
const PB_KEY      = 'arcade_arena_pb';
const DAILY_KEY   = 'arcade_arena_daily';   // { date, score }
const STREAK_KEY  = 'arcade_arena_streak';  // { lastDate, count }

// ─── helpers ────────────────────────────────────────────────────────────────

const ensureDeviceId = () => {
  const existing = localStorage.getItem(DEVICE_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID
    ? crypto.randomUUID()
    : `dev-${Math.random().toString(16).slice(2, 10)}`;
  localStorage.setItem(DEVICE_KEY, id);
  return id;
};

const todayStr = () => new Date().toISOString().split('T')[0];
const yesterdayStr = () => new Date(Date.now() - 86_400_000).toISOString().split('T')[0];

const readPersonalBest = () => parseInt(localStorage.getItem(PB_KEY) || '0', 10);

const updatePersonalBest = (score) => {
  const current = readPersonalBest();
  if (score > current) { localStorage.setItem(PB_KEY, String(score)); return score; }
  return current;
};

const readDailyBest = () => {
  try {
    const data = JSON.parse(localStorage.getItem(DAILY_KEY) || 'null');
    return data?.date === todayStr() ? data.score : 0;
  } catch { return 0; }
};

const updateDailyBest = (score) => {
  const current = readDailyBest();
  const best = Math.max(current, score);
  localStorage.setItem(DAILY_KEY, JSON.stringify({ date: todayStr(), score: best }));
  return best;
};

// Reads the streak and tells you if it's still active (played today or yesterday)
const readStreak = () => {
  try {
    const data = JSON.parse(localStorage.getItem(STREAK_KEY) || 'null');
    if (!data) return 0;
    if (data.lastDate === todayStr() || data.lastDate === yesterdayStr()) return data.count;
    return 0; // streak broken
  } catch { return 0; }
};

// Called once per game completion. Increments streak if today is a new day.
const touchStreak = () => {
  try {
    const data = JSON.parse(localStorage.getItem(STREAK_KEY) || 'null');
    const today = todayStr();
    const yesterday = yesterdayStr();
    let newCount = 1;
    if (data) {
      if (data.lastDate === today)     newCount = data.count;          // already played today
      else if (data.lastDate === yesterday) newCount = data.count + 1; // extending
      // else streak was broken — reset to 1
    }
    localStorage.setItem(STREAK_KEY, JSON.stringify({ lastDate: today, count: newCount }));
    return newCount;
  } catch { return 1; }
};

// ─── component ──────────────────────────────────────────────────────────────

function App() {
  const [playerName, setPlayerName]   = useState(() => localStorage.getItem(NAME_KEY) || '');
  const [pendingName, setPendingName] = useState(() => localStorage.getItem(NAME_KEY) || '');
  const [nameLocked, setNameLocked]   = useState(() => !!(localStorage.getItem(NAME_KEY) || '').trim());
  const [nameEditMode, setNameEditMode] = useState(false);

  const [deviceId] = useState(ensureDeviceId);
  const [mode]     = useState('solo');
  const [difficulty, setDifficulty] = useState('normal');

  const [scores,  setScores]  = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [lbPeriod, setLbPeriod] = useState('all'); // 'all' | 'week'

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [shareStatus, setShareStatus] = useState('');
  const [noNameWarning, setNoNameWarning] = useState(false);

  // Retention state
  const [personalBest, setPersonalBest] = useState(readPersonalBest);
  const [dailyBest,    setDailyBest]    = useState(readDailyBest);
  const [loginStreak,  setLoginStreak]  = useState(readStreak);

  // Post-run info shown in sidebar
  const [lastRun, setLastRun] = useState(null);
  // { score, rank, isNewPB, isNewDaily, streak }

  const loadScores = async (selectedMode = mode, period = lbPeriod) => {
    setLoading(true);
    setError('');
    try {
      const list = await fetchScores(selectedMode, period);
      setScores(list);
    } catch (err) {
      setError(err.message || 'Failed to load scores');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadScores(mode, lbPeriod); }, [mode, lbPeriod]); // eslint-disable-line

  const handleSaveName = () => {
    const cleaned = pendingName.trim();
    if (!cleaned) return;
    setPlayerName(cleaned);
    localStorage.setItem(NAME_KEY, cleaned);
    setNameLocked(true);
    setNameEditMode(false);
  };

  const handleEditName = () => {
    setPendingName(playerName);
    setNameEditMode(true);
    setNameLocked(false);
  };

  const handleFinish = async ({ score }) => {
    // FIX: was a silent drop — now warn the user visibly
    if (!playerName.trim() || !nameLocked) {
      setNoNameWarning(true);
      setTimeout(() => setNoNameWarning(false), 4000);
      return;
    }

    // Update local retention data immediately (don't wait for server)
    const newPB      = updatePersonalBest(score);
    const newDaily   = updateDailyBest(score);
    const newStreak  = touchStreak();

    setPersonalBest(newPB);
    setDailyBest(newDaily);
    setLoginStreak(newStreak);

    try {
      await submitScore({ playerName, score, mode, deviceId });
      const updated = await fetchScores(mode, lbPeriod);
      setScores(updated);

      // Calculate rank from refreshed leaderboard
      const rank = updated.findIndex(
        (s) => s.playerName === playerName
      ) + 1;

      setLastRun({
        score,
        rank: rank > 0 ? rank : null,
        isNewPB:    score >= newPB,
        isNewDaily: score >= newDaily,
        streak: newStreak,
      });
    } catch (err) {
      console.error(err);
      setError(err.message || 'Could not save score');
    }
  };

  const handleCopyId = async () => {
    try {
      await navigator.clipboard?.writeText(deviceId);
      setCopyStatus('ID copied');
    } catch {
      setCopyStatus('Copy failed');
    }
    setTimeout(() => setCopyStatus(''), 1500);
  };

  const handleShare = async () => {
    if (!lastRun) return;
    const rankText = lastRun.rank ? ` — rank #${lastRun.rank} globally` : '';
    const text = `I scored ${lastRun.score} on Arcade Arena (${difficulty})${rankText}. Can you beat it?`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Arcade Arena', text });
      } else {
        await navigator.clipboard?.writeText(text);
        setShareStatus('Copied to clipboard');
        setTimeout(() => setShareStatus(''), 2000);
      }
    } catch {
      // user cancelled share or clipboard unavailable
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Reflex Race</p>
          <h1>Arcade Arena</h1>
        </div>
        <button className="menu-btn" onClick={() => setDrawerOpen((v) => !v)}>&#9776;</button>
      </header>

      <p className="lede lede--tight">Tap the glowing orb before it fades. Keep the timer alive to climb the board.</p>

      {/* Login streak badge */}
      {loginStreak >= 2 && (
        <div className="streak-banner">
          {loginStreak} day streak — keep it going!
        </div>
      )}

      {/* Warning when score couldn't be saved */}
      {noNameWarning && (
        <div className="warning-banner">
          Set a player name in Settings to save your score.
        </div>
      )}

      <main className="stack">
        <GameBoard
          playerName={playerName}
          mode={mode}
          difficulty={difficulty}
          onFinish={handleFinish}
          personalBest={personalBest}
        />
      </main>

      {/* ── Settings & Leaderboard drawer ─────────────────────────────── */}
      <div className={`drawer ${drawerOpen ? 'drawer--open' : ''}`}>
        <div className="drawer__header">
          <h3>Settings &amp; Board</h3>
          <button className="menu-btn ghost" onClick={() => setDrawerOpen(false)}>&#x2715;</button>
        </div>
        <div className="drawer__content">
          <div className="card">

            {/* Player name */}
            <label className="field">
              <span>Player tag</span>
              {nameLocked && !nameEditMode ? (
                <div className="id-row">
                  <span className="name-display">{playerName}</span>
                  <button className="mini-btn ghost" type="button" onClick={handleEditName}>
                    Edit
                  </button>
                </div>
              ) : (
                <>
                  <input
                    value={pendingName}
                    onChange={(e) => setPendingName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                    maxLength={32}
                    placeholder="Pick a name"
                    autoFocus={nameEditMode}
                  />
                  <button className="mini-btn" type="button" onClick={handleSaveName}>
                    Save
                  </button>
                  {nameEditMode && (
                    <button className="mini-btn ghost" type="button" onClick={() => {
                      setNameEditMode(false);
                      setNameLocked(true);
                      setPendingName(playerName);
                    }}>
                      Cancel
                    </button>
                  )}
                </>
              )}
            </label>

            {/* Device ID */}
            <div className="field inline">
              <span>Player ID</span>
              <div className="id-row">
                <code className="device-id">{deviceId.slice(0, 8)}…</code>
                <button type="button" className="mini-btn" onClick={handleCopyId} aria-label="Copy player ID">
                  Copy
                </button>
                {copyStatus && <span className="copy-toast">{copyStatus}</span>}
              </div>
            </div>

            {/* Difficulty */}
            <label className="field inline">
              <span>Difficulty</span>
              <div className="segmented">
                {['normal', 'hard', 'extreme'].map((d) => (
                  <button
                    key={d}
                    className={difficulty === d ? 'active' : ''}
                    onClick={() => setDifficulty(d)}
                  >
                    {d.charAt(0).toUpperCase() + d.slice(1)}
                  </button>
                ))}
              </div>
            </label>

            <p className="muted small-hint">Space: start / restart &nbsp;·&nbsp; P/Esc: pause</p>

            {/* ── Retention stats row ─── */}
            <div className="stats-row">
              <div className="stat-chip">
                <span className="stat-chip__label">Daily best</span>
                <span className="stat-chip__value">{dailyBest || '—'}</span>
              </div>
              <div className="stat-chip">
                <span className="stat-chip__label">All-time best</span>
                <span className="stat-chip__value">{personalBest || '—'}</span>
              </div>
              {loginStreak >= 1 && (
                <div className="stat-chip">
                  <span className="stat-chip__label">Day streak</span>
                  <span className="stat-chip__value">{loginStreak}</span>
                </div>
              )}
            </div>

            {/* Post-run results card */}
            {lastRun && (
              <div className="last-run-card">
                <div className="last-run-row">
                  <span className="last-run-label">Last score</span>
                  <span className="last-run-value accent">{lastRun.score}</span>
                </div>
                {lastRun.rank && (
                  <div className="last-run-row">
                    <span className="last-run-label">Global rank</span>
                    <span className="last-run-value">#{lastRun.rank}</span>
                  </div>
                )}
                {lastRun.isNewPB && (
                  <p className="new-best-inline">Personal best!</p>
                )}
                {lastRun.isNewDaily && !lastRun.isNewPB && (
                  <p className="new-best-inline">Best today!</p>
                )}
                <button className="share-btn" onClick={handleShare}>
                  Share score
                  {shareStatus && <span className="share-toast">{shareStatus}</span>}
                </button>
              </div>
            )}
          </div>

          {/* Leaderboard with weekly/all-time tabs */}
          <Leaderboard
            scores={scores}
            loading={loading}
            error={error}
            period={lbPeriod}
            onPeriodChange={(p) => setLbPeriod(p)}
            currentPlayerName={playerName}
          />
        </div>
      </div>

      {drawerOpen && <div className="scrim" onClick={() => setDrawerOpen(false)} />}
    </div>
  );
}

export default App;
