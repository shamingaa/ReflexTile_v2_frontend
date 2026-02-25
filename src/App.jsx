import React, { useEffect, useRef, useState } from 'react';
import GameBoard from './components/GameBoard';
import StatsPage from './components/StatsPage';
import Leaderboard from './Leaderboard';
import { fetchScores, submitScore, registerPlayer, readBrandTaps, fetchTapLeaderboard } from './api';
import { checkAndUnlock } from './achievements';
import './styles.css';

const DEVICE_KEY   = 'arcade_arena_device';
const NAME_KEY     = 'arcade_arena_player';
const CONTACT_KEY  = 'arcade_arena_contact';
const PB_KEY       = 'arcade_arena_pb';
const DAILY_KEY   = 'arcade_arena_daily';    // { date, score }
const STREAK_KEY  = 'arcade_arena_streak';   // { lastDate, count }
const HISTORY_KEY = 'arcade_arena_history';  // { [dateStr]: { score, games } }
const RUNS_KEY    = 'arcade_arena_runs';     // RunRecord[] newest-first, max 20

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

const readStreak = () => {
  try {
    const data = JSON.parse(localStorage.getItem(STREAK_KEY) || 'null');
    if (!data) return 0;
    if (data.lastDate === todayStr() || data.lastDate === yesterdayStr()) return data.count;
    return 0;
  } catch { return 0; }
};
const touchStreak = () => {
  try {
    const data = JSON.parse(localStorage.getItem(STREAK_KEY) || 'null');
    const today = todayStr();
    const yesterday = yesterdayStr();
    let newCount = 1;
    if (data) {
      if (data.lastDate === today)          newCount = data.count;
      else if (data.lastDate === yesterday) newCount = data.count + 1;
    }
    localStorage.setItem(STREAK_KEY, JSON.stringify({ lastDate: today, count: newCount }));
    return newCount;
  } catch { return 1; }
};

// Daily history: best score per day, for the performance chart
const updateHistory = (dateStr, score) => {
  try {
    const hist = JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}');
    const prev = hist[dateStr] || { score: 0, games: 0 };
    hist[dateStr] = { score: Math.max(prev.score, score), games: prev.games + 1 };
    // Keep only last 60 days to prevent unbounded growth
    const keys = Object.keys(hist).sort();
    if (keys.length > 60) delete hist[keys[0]];
    localStorage.setItem(HISTORY_KEY, JSON.stringify(hist));
  } catch { /* noop */ }
};

// Individual run records, newest-first, capped at 20
const appendRun = (run) => {
  try {
    const runs = JSON.parse(localStorage.getItem(RUNS_KEY) || '[]');
    runs.unshift(run);
    if (runs.length > 20) runs.length = 20;
    localStorage.setItem(RUNS_KEY, JSON.stringify(runs));
  } catch { /* noop */ }
};

// ─── component ──────────────────────────────────────────────────────────────

function App() {
  const [playerName, setPlayerName]   = useState(() => localStorage.getItem(NAME_KEY) || '');
  const [pendingName, setPendingName] = useState(() => localStorage.getItem(NAME_KEY) || '');
  const [nameLocked, setNameLocked]   = useState(() => !!(localStorage.getItem(NAME_KEY) || '').trim());
  const [nameEditMode, setNameEditMode] = useState(false);

  const [contact, setContact]               = useState(() => localStorage.getItem(CONTACT_KEY) || '');
  const [pendingContact, setPendingContact] = useState(() => localStorage.getItem(CONTACT_KEY) || '');
  const [contactEditMode, setContactEditMode] = useState(false);

  const [deviceId] = useState(ensureDeviceId);
  const [mode]     = useState('solo');
  const difficulty = 'competition';
  const [view, setView]             = useState('game'); // 'game' | 'stats'

  const [scores,    setScores]    = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [lbPeriod,  setLbPeriod]  = useState('all');
  const [tapScores, setTapScores] = useState([]);

  const [nameGateError,   setNameGateError]   = useState('');
  const [nameGateLoading, setNameGateLoading] = useState(false);
  const [contactError,    setContactError]    = useState('');

  const [drawerOpen, setDrawerOpen]   = useState(false);
  const [copyStatus, setCopyStatus]   = useState('');
  const [shareStatus, setShareStatus] = useState('');
  const [challengeStatus, setChallengeStatus] = useState('');
  const [noNameWarning, setNoNameWarning] = useState(false);
  const [referralBonus, setReferralBonus] = useState(false);
  const [brandTaps, setBrandTaps] = useState(readBrandTaps);
  const referralRef = useRef(null);

  // ── Sponsor splash (show once on first ever visit) ─────────────────────
  const [splashDone, setSplashDone] = useState(
    () => localStorage.getItem('arcade_arena_splash_v1') === '1'
  );
  const dismissSplash = () => {
    localStorage.setItem('arcade_arena_splash_v1', '1');
    setSplashDone(true);
  };
  useEffect(() => {
    if (splashDone) return;
    const t = setTimeout(dismissSplash, 3000);
    return () => clearTimeout(t);
  }, [splashDone]); // eslint-disable-line

  // ── Referral detection ─────────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref    = params.get('ref');
    if (ref && ref !== deviceId) {
      referralRef.current = ref;
      // Clean URL without reload
      const clean = window.location.pathname;
      window.history.replaceState({}, '', clean);
    }
  }, []); // eslint-disable-line

  const [personalBest, setPersonalBest] = useState(readPersonalBest);
  const [dailyBest,    setDailyBest]    = useState(readDailyBest);
  const [loginStreak,  setLoginStreak]  = useState(readStreak);
  const [lastRun,      setLastRun]      = useState(null);

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

  const loadTapScores = async () => {
    try {
      const list = await fetchTapLeaderboard();
      setTapScores(list);
    } catch { /* silent — non-critical */ }
  };

  useEffect(() => { loadScores(mode, lbPeriod); }, [mode, lbPeriod]); // eslint-disable-line
  useEffect(() => { loadTapScores(); }, []); // eslint-disable-line

  const handleSaveName = async () => {
    const cleaned = pendingName.trim();
    const cleanedContact = pendingContact.trim();
    if (!cleaned || !cleanedContact) return;
    setNameGateError('');
    setNameGateLoading(true);
    try {
      await registerPlayer({ playerName: cleaned, deviceId, contact: cleanedContact });
    } catch (err) {
      setNameGateError(err.message);
      setNameGateLoading(false);
      return;
    }
    setNameGateLoading(false);
    setPlayerName(cleaned);
    localStorage.setItem(NAME_KEY, cleaned);
    setContact(cleanedContact);
    localStorage.setItem(CONTACT_KEY, cleanedContact);
    setNameLocked(true);
    setNameEditMode(false);
  };

  const handleEditName = () => {
    setPendingName(playerName);
    setPendingContact(contact);
    setNameEditMode(true);
    setNameLocked(false);
  };

  const handleSaveContact = async () => {
    const cleaned = pendingContact.trim();
    setContactError('');
    try {
      await registerPlayer({ playerName, deviceId, contact: cleaned });
    } catch (err) {
      setContactError(err.message);
      return;
    }
    setContact(cleaned);
    localStorage.setItem(CONTACT_KEY, cleaned);
    setContactEditMode(false);
  };

  const handleFinish = async ({
    score:        rawScore,
    hits          = 0,
    misses        = 0,
    accuracy      = null,
    fastestHit    = null,
    avgReaction   = null,
    maxStreak     = 0,
    logoTaps      = 0,
  }) => {
    // FIX: was a silent drop — now warns the user
    if (!playerName.trim() || !nameLocked) {
      setNoNameWarning(true);
      setTimeout(() => setNoNameWarning(false), 4000);
      return;
    }

    // Apply referral bonus on first-ever run
    let bonusApplied = false;
    let score = rawScore;
    if (referralRef.current) {
      try {
        const prevRuns = JSON.parse(localStorage.getItem('arcade_arena_runs') || '[]');
        if (prevRuns.length === 0) {
          score += 50;
          bonusApplied = true;
        }
      } catch { /* noop */ }
      referralRef.current = null; // use only once
    }

    const today = todayStr();

    // Persist locally first so stats are saved even if server fails
    updateHistory(today, score);
    appendRun({
      timestamp:   Date.now(),
      date:        today,
      score,
      difficulty,
      hits,
      misses,
      accuracy,
      fastestHit,
      avgReaction,
      maxStreak,
    });

    const newPB     = updatePersonalBest(score);
    const newDaily  = updateDailyBest(score);
    const newStreak = touchStreak();

    setPersonalBest(newPB);
    setDailyBest(newDaily);
    setLoginStreak(newStreak);

    if (bonusApplied) {
      setReferralBonus(true);
      setTimeout(() => setReferralBonus(false), 4000);
    }

    // Refresh brand tap counts in UI
    setBrandTaps(readBrandTaps());

    // Check achievements (silent — visible on Stats page)
    checkAndUnlock({ score, maxStreak, accuracy, fastestHit, logoTaps, loginStreak: newStreak });

    try {
      await submitScore({ playerName, score, mode, deviceId, contact });
      const updated = await fetchScores(mode, lbPeriod);
      setScores(updated);
      const rank = updated.findIndex((s) => s.playerName === playerName) + 1;
      setLastRun({
        score,
        rank:       rank > 0 ? rank : null,
        isNewPB:    score >= newPB,
        isNewDaily: score >= newDaily,
        streak:     newStreak,
      });
      loadTapScores();
    } catch (err) {
      console.error(err);
      setError(err.message || 'Could not save score');
    }
  };

  const handleCopyId = async () => {
    try {
      await navigator.clipboard?.writeText(deviceId);
      setCopyStatus('Copied');
    } catch {
      setCopyStatus('Failed');
    }
    setTimeout(() => setCopyStatus(''), 1500);
  };

  const handleShare = async () => {
    if (!lastRun) return;
    const rankText = lastRun.rank ? ` (rank #${lastRun.rank})` : '';
    const text = `I scored ${lastRun.score} on Reflex Tile ${difficulty}${rankText} ft. Tuberway & 1Percent — can you beat it?`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Reflex Tile', text });
      } else {
        await navigator.clipboard?.writeText(text);
        setShareStatus('Copied to clipboard');
        setTimeout(() => setShareStatus(''), 2000);
      }
    } catch { /* user cancelled */ }
  };

  const handleChallengeShare = async () => {
    const url  = `${window.location.origin}${window.location.pathname}?ref=${deviceId}`;
    const text = `Challenge accepted? Play Reflex Tile and beat my score ft. Tuberway & 1Percent: ${url}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Reflex Tile Challenge', text, url });
      } else {
        await navigator.clipboard?.writeText(url);
        setChallengeStatus('Link copied!');
        setTimeout(() => setChallengeStatus(''), 2000);
      }
    } catch { /* user cancelled */ }
  };

  return (
    <div className="app-shell">

      {/* ── Sponsor splash (first visit only) ── */}
      {!splashDone && (
        <div className="sponsor-splash" onClick={dismissSplash}>
          <div className="sponsor-splash__content">
            <p className="sponsor-splash__powered">Powered by</p>
            <div className="sponsor-splash__logos">
              <img src="/logo_one.png" alt="Tuberway" className="sponsor-splash__img sponsor-splash__img--one" draggable={false} />
              <img src="/logo_two.png" alt="1Percent"  className="sponsor-splash__img sponsor-splash__img--two" draggable={false} />
            </div>
            <p className="sponsor-splash__brands">Tuberway &amp; 1Percent</p>
            <p className="sponsor-splash__tap">Tap to continue</p>
          </div>
        </div>
      )}


      {referralBonus && (
        <div className="streak-banner referral-banner">+50 Referral bonus applied!</div>
      )}
      <header className="topbar">
        <div>
          <p className="eyebrow">Reflex Race</p>
          <h1>Reflex Tile</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className="mini-btn ghost"
            onClick={() => setView((v) => v === 'stats' ? 'game' : 'stats')}
          >
            {view === 'stats' ? '← Game' : 'Stats'}
          </button>
          {view === 'game' && (
            <button className="menu-btn" onClick={() => setDrawerOpen((v) => !v)}>&#9776;</button>
          )}
        </div>
      </header>

      {view === 'game' && nameLocked && (
        <p className="lede lede--tight">Tap the glowing orb before it fades. Keep the timer alive to climb the board.</p>
      )}

      {loginStreak >= 2 && view === 'game' && nameLocked && (
        <div className="streak-banner">{loginStreak} day streak — keep it going!</div>
      )}
      {noNameWarning && (
        <div className="warning-banner">Set a player name in Settings to save your score.</div>
      )}

      <main className="stack">
        {view === 'stats' ? (
          <StatsPage />
        ) : !nameLocked && !nameEditMode ? (
          <div className="name-gate">
            <p className="name-gate__eyebrow">Welcome</p>
            <h2 className="name-gate__title">Pick your player tag</h2>
            <p className="name-gate__sub">
              Your tag shows on the leaderboard and tracks your personal best.
            </p>
            <div className="name-gate__form">
              <input
                className="name-gate__input"
                value={pendingName}
                onChange={(e) => setPendingName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                maxLength={32}
                placeholder="Enter a player tag…"
                autoFocus
              />
              <input
                className="name-gate__input name-gate__input--contact"
                value={pendingContact}
                onChange={(e) => setPendingContact(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                maxLength={128}
                placeholder="Email or phone (required for prizes)"
              />
              {nameGateError && <p className="name-gate__error">{nameGateError}</p>}
              <button
                className="name-gate__btn"
                onClick={handleSaveName}
                disabled={!pendingName.trim() || !pendingContact.trim() || nameGateLoading}
              >
                {nameGateLoading ? 'Checking…' : "Let's play →"}
              </button>
            </div>
          </div>
        ) : (
          <GameBoard
            playerName={playerName}
            mode={mode}
            difficulty={difficulty}
            onFinish={handleFinish}
            personalBest={personalBest}
            lastRank={lastRun?.rank ?? null}
            deviceId={deviceId}
          />
        )}
      </main>

      {/* ── Drawer (game view only) ─── */}
      {view === 'game' && (
        <>
          <div className={`drawer ${drawerOpen ? 'drawer--open' : ''}`}>
            <div className="drawer__header">
              <h3>Settings &amp; Board</h3>
              <button className="menu-btn ghost" onClick={() => setDrawerOpen(false)}>&#x2715;</button>
            </div>
            <div className="drawer__content">
              <div className="card">
                {/* Player name */}
                <div className="field">
                  <span>Player tag</span>
                  {nameLocked && !nameEditMode ? (
                    <div className="id-row">
                      <span className="name-display">{playerName}</span>
                      <button className="mini-btn ghost" type="button" onClick={handleEditName}>Edit</button>
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
                      <button className="mini-btn" type="button" onClick={handleSaveName}>Save</button>
                      {nameEditMode && (
                        <button className="mini-btn ghost" type="button" onClick={() => {
                          setNameEditMode(false);
                          setNameLocked(true);
                          setPendingName(playerName);
                          setPendingContact(contact);
                          setContactEditMode(false);
                        }}>Cancel</button>
                      )}
                    </>
                  )}
                </div>

                {/* Contact */}
                <div className="field">
                  <span>Email or phone <span className="contact-optional">(for prizes)</span></span>
                  {!contactEditMode ? (
                    <div className="id-row">
                      <span className="name-display" style={{ fontSize: 13, color: contact ? 'var(--text)' : 'var(--muted)' }}>
                        {contact || 'Not set'}
                      </span>
                      <button className="mini-btn ghost" type="button" onClick={() => { setPendingContact(contact); setContactEditMode(true); }}>
                        {contact ? 'Edit' : 'Set'}
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        value={pendingContact}
                        onChange={(e) => setPendingContact(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSaveContact()}
                        maxLength={128}
                        placeholder="Email or phone number"
                        autoFocus
                      />
                      {contactError && <p style={{ fontSize: 12, color: 'var(--danger)', margin: '2px 0' }}>{contactError}</p>}
                      <button className="mini-btn" type="button" onClick={handleSaveContact}>Save</button>
                      <button className="mini-btn ghost" type="button" onClick={() => { setContactEditMode(false); setPendingContact(contact); setContactError(''); }}>Cancel</button>
                    </>
                  )}
                </div>

                {/* Device ID */}
                <div className="field inline">
                  <span>Player ID</span>
                  <div className="id-row">
                    <code className="device-id">{deviceId.slice(0, 8)}…</code>
                    <button type="button" className="mini-btn" onClick={handleCopyId}>Copy</button>
                    {copyStatus && <span className="copy-toast">{copyStatus}</span>}
                  </div>
                </div>


                {/* Retention stats */}
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

                {/* Post-run card */}
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
                    {lastRun.isNewPB  && <p className="new-best-inline">Personal best!</p>}
                    {lastRun.isNewDaily && !lastRun.isNewPB && <p className="new-best-inline">Best today!</p>}
                    <button className="share-btn" onClick={handleShare}>
                      Share score
                      {shareStatus && <span className="share-toast">{shareStatus}</span>}
                    </button>
                  </div>
                )}

                {/* ── Referral / Challenge a friend ── */}
                <div className="referral-section">
                  <p className="referral-section__label">Challenge a friend</p>
                  <p className="referral-section__sub">Share your personal link — they get a +50 bonus on their first run.</p>
                  <button className="referral-btn" onClick={handleChallengeShare}>
                    Copy invite link
                    {challengeStatus && <span className="share-toast">{challengeStatus}</span>}
                  </button>
                </div>

                {/* ── Brand tap analytics — always visible ── */}
                <div className="brand-analytics">
                  <p className="brand-analytics__label">Sponsor tile taps</p>
                  <div className="brand-analytics__row">
                    <div className="brand-analytics__item">
                      <img src="/logo_one.png" alt="Tuberway" className="brand-analytics__logo" />
                      <span className="brand-analytics__name">Tuberway</span>
                      <span className="brand-analytics__count">{brandTaps['Tuberway'] || 0}</span>
                    </div>
                    <div className="brand-analytics__item">
                      <img src="/logo_two.png" alt="1Percent" className="brand-analytics__logo" />
                      <span className="brand-analytics__name">1Percent</span>
                      <span className="brand-analytics__count">{brandTaps['1Percent'] || 0}</span>
                    </div>
                  </div>
                </div>
              </div>

              <Leaderboard
                scores={scores}
                loading={loading}
                error={error}
                period={lbPeriod}
                onPeriodChange={(p) => setLbPeriod(p)}
                currentPlayerName={playerName}
                tapChampion={tapScores[0] ?? null}
              />
            </div>
          </div>

          {drawerOpen && <div className="scrim" onClick={() => setDrawerOpen(false)} />}
        </>
      )}
    </div>
  );
}

export default App;
