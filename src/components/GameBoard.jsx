import React, { useEffect, useMemo, useRef, useState } from 'react';

const FLASH_DURATION = 180;

const getGrid = () => {
  if (typeof window === 'undefined') return { cols: 5, rows: 5 };
  return window.innerWidth <= 540 ? { cols: 4, rows: 4 } : { cols: 5, rows: 5 };
};

const COMBO_LABELS = {
  5: 'HOT',
  10: 'ON FIRE',
  20: 'UNSTOPPABLE',
  30: 'GODLIKE',
  50: 'LEGENDARY',
};

// ─── Logo bonus tile ────────────────────────────────────────────────────────
const LOGOS = [
  { src: '/logo_one.png', brand: 'Tuberway'  },
  { src: '/logo_two.png', brand: '1Percent' },
];
const LOGO_BONUS = 25;    // points for tapping the logo
const LOGO_TTL   = 2200;  // ms before it auto-expires
const LOGO_EVERY = [8, 12]; // spawn after [min, max] correct hits

// ─── Tap melody — C minor pentatonic, mirrors the key of "Lonely at the Top" ─
// Notes advance sequentially on every correct hit, looping through the phrase.
const TAP_MELODY = [
  784, 698, 622, 523,  622, 698, 784, 784,
  698, 622, 523, 466,  523, 622, 698, 784,
  784, 784, 698, 622,  698, 784, 932, 784,
  698, 622, 523, 466,  523, 622, 523, 392,
  784, 698, 784, 932,  784, 698, 622, 698,
  622, 523, 466, 392,  466, 523, 622, 523,
];

// ─── Difficulty presets ─────────────────────────────────────────────────────
const DIFFICULTY = {
  normal: {
    startTime: 30, missPenalty: 4, hazardChance: 0,
    timeRewardCap: 50, paceBase: 1900, paceFloor: 900,
    paceScoreFactor: 4.5, paceStreakFactor: 9,
    rewardBonus: 0.8, rewardFloor: 0.55, rewardSlope: 940, rewardStreakFactor: 0.012,
    minGain: 1.1, wrongClickPenalty: 1.4,
  },
  hard: {
    startTime: 25, missPenalty: 4.5, hazardChance: 0.08,
    timeRewardCap: 40, paceBase: 1500, paceFloor: 700,
    paceScoreFactor: 6.5, paceStreakFactor: 12,
    rewardBonus: 0.65, rewardFloor: 0.38, rewardSlope: 900, rewardStreakFactor: 0.018,
    minGain: 0.85, wrongClickPenalty: 1.6,
  },
  extreme: {
    startTime: 20, missPenalty: 5, hazardChance: 0.14,
    timeRewardCap: 34, paceBase: 1250, paceFloor: 550,
    paceScoreFactor: 8.5, paceStreakFactor: 15,
    rewardBonus: 0.55, rewardFloor: 0.32, rewardSlope: 860, rewardStreakFactor: 0.023,
    minGain: 0.75, wrongClickPenalty: 1.9,
  },
};

const pickCell = (previous, banned = [], count) => {
  const disallow = new Set([previous, ...banned]);
  let attempts = 0, next = previous;
  while (disallow.has(next) && attempts < 40) { next = Math.floor(Math.random() * count); attempts++; }
  return next;
};

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

// ─── Component ──────────────────────────────────────────────────────────────

function GameBoard({ playerName, mode, difficulty = 'normal', onFinish, personalBest = 0 }) {
  const [grid, setGrid]           = useState(getGrid);
  const cellCount                 = grid.cols * grid.rows;
  const [status, setStatus]       = useState('idle');
  const [timeLeft, setTimeLeft]   = useState(() => DIFFICULTY[difficulty]?.startTime ?? 30);
  const [score, setScore]         = useState(0);
  const [streak, setStreak]       = useState(0);
  const [misses, setMisses]       = useState(0);
  const [hits, setHits]           = useState(0);
  const [activeCell, setActiveCell] = useState(() => pickCell(-1, [], cellCount));
  const [hazardCell, setHazardCell] = useState(null);
  const [flashMap, setFlashMap]   = useState({});
  const [fastestHit, setFastestHit] = useState(null);
  const [totalReactionMs, setTotalReactionMs] = useState(0);
  const [pops, setPops]           = useState([]);
  const [comboMsg, setComboMsg]   = useState('');
  const [logoTile, setLogoTile]   = useState(null); // { cell, logo } | null

  // Sound toggle — persisted to localStorage
  const [soundOn, setSoundOn] = useState(
    () => localStorage.getItem('arcade_arena_sound') !== '0'
  );
  const soundRef = useRef(soundOn);

  // ── Refs ─────────────────────────────────────────────────────────────────
  const spawnTimeRef     = useRef(performance.now());
  const finishedRef      = useRef(false);
  const scoreRef         = useRef(0);
  const timeLeftRef      = useRef(DIFFICULTY[difficulty]?.startTime ?? 30);
  const flashTimeoutsRef = useRef({});
  const audioCtxRef      = useRef(null);
  const popIdRef         = useRef(0);
  const comboTimerRef    = useRef(null);
  const statusRef        = useRef('idle');
  const songPosRef       = useRef(0);      // position in TAP_MELODY sequence
  const songRef          = useRef(null);   // HTMLAudioElement for background track
  const songGainRef      = useRef(null);   // GainNode — controls background volume
  const logoTimerRef     = useRef(null);   // auto-expire timer for logo tile
  const nextLogoAtRef    = useRef(8 + Math.floor(Math.random() * 5)); // hit count for first logo
  const logoIdxRef       = useRef(0);      // alternates between logo_one / logo_two
  // Stat refs — synchronous counterparts for state; read by endRun
  const hitsRef          = useRef(0);
  const missesRef        = useRef(0);
  const fastestHitRef    = useRef(null);
  const totalReactionRef = useRef(0);
  const maxStreakRef     = useRef(0);

  const settings         = useMemo(() => DIFFICULTY[difficulty] ?? DIFFICULTY.normal, [difficulty]);
  const difficultyWindow = useMemo(
    () => Math.max(settings.paceFloor, settings.paceBase - score * settings.paceScoreFactor - streak * settings.paceStreakFactor),
    [score, streak, settings]
  );

  // ── Audio helpers ─────────────────────────────────────────────────────────

  const getAudioCtx = () => {
    if (typeof window === 'undefined') return null;
    const Ctx = window.AudioContext || (window).webkitAudioContext;
    if (!Ctx) return null;
    const ctx = audioCtxRef.current || new Ctx();
    audioCtxRef.current = ctx;
    ctx.resume?.();
    return ctx;
  };

  // UI beeps (start, pause, miss, wrong-click, combos)
  const playTone = (freq, durationMs = 90, volume = 0.12) => {
    if (!soundRef.current) return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.value = volume;
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
    osc.stop(now + durationMs / 1000);
  };

  // ── Background song helpers ───────────────────────────────────────────────

  const setupSong = () => {
    if (songRef.current) return;
    const audio = new Audio('/Asake-Lonely-At-The-Top.mp3');
    audio.loop    = true;
    audio.preload = 'auto';
    songRef.current = audio;
    const ctx = getAudioCtx();
    if (!ctx) return;
    try {
      const src  = ctx.createMediaElementSource(audio);
      const gain = ctx.createGain();
      gain.gain.value = soundRef.current ? 0.75 : 0;
      src.connect(gain);
      gain.connect(ctx.destination);
      songGainRef.current = gain;
    } catch (_) { /* already routed */ }
  };

  const playSong = () => {
    setupSong();
    if (songGainRef.current) songGainRef.current.gain.value = soundRef.current ? 0.75 : 0;
    songRef.current?.play().catch(() => {});
  };

  const pauseSong = () => { songRef.current?.pause(); };

  const stopSong = () => {
    if (songRef.current) { songRef.current.pause(); songRef.current.currentTime = 0; }
  };

  // ── Tap melody synth — marimba-style, plays the next note in TAP_MELODY ──

  const playMelodyNote = (freq, volume = 0.2) => {
    if (!soundRef.current) return;
    const ctx = getAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc  = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 1.007, now);
    osc.frequency.exponentialRampToValueAtTime(freq, now + 0.01);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(volume * 0.3, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);
    // bright overtone for the "wood" character
    const ot     = ctx.createOscillator();
    ot.type = 'sine';
    ot.frequency.value = freq * 4.0;
    const otGain = ctx.createGain();
    otGain.gain.setValueAtTime(volume * 0.15, now);
    otGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    osc.connect(gain).connect(ctx.destination);
    ot.connect(otGain).connect(ctx.destination);
    osc.start(now); osc.stop(now + 0.9);
    ot.start(now);  ot.stop(now + 0.08);
  };

  useEffect(() => { scoreRef.current = score; }, [score]);
  useEffect(() => { statusRef.current = status; }, [status]);

  // Drive background song with game state
  useEffect(() => {
    if (status === 'playing')     playSong();
    else if (status === 'paused') pauseSong();
    else                          stopSong();
  }, [status]); // eslint-disable-line

  // Sound toggle — mute/unmute background, stop if turning off
  useEffect(() => {
    soundRef.current = soundOn;
    localStorage.setItem('arcade_arena_sound', soundOn ? '1' : '0');
    if (songGainRef.current) songGainRef.current.gain.value = soundOn ? 0.75 : 0;
    if (!soundOn) pauseSong();
    else if (statusRef.current === 'playing') playSong();
  }, [soundOn]); // eslint-disable-line

  // ── Core helpers ──────────────────────────────────────────────────────────

  const flashCell = (cell, type) => {
    if (cell == null) return;
    if (flashTimeoutsRef.current[cell]) clearTimeout(flashTimeoutsRef.current[cell]);
    setFlashMap((prev) => ({ ...prev, [cell]: type }));
    flashTimeoutsRef.current[cell] = setTimeout(() => {
      setFlashMap((prev) => { const n = { ...prev }; delete n[cell]; return n; });
    }, FLASH_DURATION);
  };

  const spawnPop = (cellIdx, text, color) => {
    const id  = ++popIdRef.current;
    const col = cellIdx % grid.cols;
    const row = Math.floor(cellIdx / grid.cols);
    setPops((prev) => [...prev, { id, text, color: color || null, x: ((col + 0.5) / grid.cols) * 100, y: ((row + 0.5) / grid.rows) * 100 }]);
    setTimeout(() => setPops((prev) => prev.filter((p) => p.id !== id)), 750);
  };

  // ── Logo tile helpers ───────────────────────────────────────────────────

  const clearLogoTile = () => {
    if (logoTimerRef.current) { clearTimeout(logoTimerRef.current); logoTimerRef.current = null; }
    setLogoTile(null);
  };

  const trySpawnLogo = (hitCount, bannedCells) => {
    if (hitCount < nextLogoAtRef.current) return;
    const interval = LOGO_EVERY[0] + Math.floor(Math.random() * (LOGO_EVERY[1] - LOGO_EVERY[0] + 1));
    nextLogoAtRef.current = hitCount + interval;
    const cell  = pickCell(-1, bannedCells.filter((x) => x != null), cellCount);
    const entry = LOGOS[logoIdxRef.current % LOGOS.length];
    logoIdxRef.current++;
    clearLogoTile();
    setLogoTile({ cell, src: entry.src, brand: entry.brand });
    logoTimerRef.current = setTimeout(() => {
      setLogoTile(null);
      logoTimerRef.current = null;
    }, LOGO_TTL);
  };

  const showCombo = (newStreak) => {
    const label = COMBO_LABELS[newStreak];
    if (!label) return;
    if (comboTimerRef.current) clearTimeout(comboTimerRef.current);
    setComboMsg(label);
    playTone(newStreak >= 20 ? 1000 : 820, 220, 0.18);
    comboTimerRef.current = setTimeout(() => setComboMsg(''), 1200);
  };

  const endRun = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setStatus('done');
    const totalHits   = hitsRef.current;
    const totalMisses = missesRef.current;
    const attempts    = totalHits + totalMisses;
    onFinish?.({
      score:       scoreRef.current,
      playerName,
      mode,
      hits:        totalHits,
      misses:      totalMisses,
      accuracy:    attempts > 0 ? Math.round((totalHits / attempts) * 100) : null,
      fastestHit:  fastestHitRef.current,
      avgReaction: totalHits > 0 ? Math.round(totalReactionRef.current / totalHits) : null,
      maxStreak:   maxStreakRef.current,
    });
  };

  // Synchronous time penalty — uses timeLeftRef to avoid async setState lag
  const applyTimePenalty = (amount) => {
    const newTime = Math.max(0, timeLeftRef.current - amount);
    timeLeftRef.current = newTime;
    setTimeLeft(newTime);
    if (newTime <= 0) { endRun(); return true; }
    return false;
  };

  const spawnNewTarget = () => {
    setActiveCell((prev) => {
      const next = pickCell(prev, [], cellCount);
      spawnTimeRef.current = performance.now();
      setHazardCell(Math.random() < settings.hazardChance ? pickCell(next, [next], cellCount) : null);
      // Evict logo tile if it would overlap with the new active cell
      setLogoTile((lt) => {
        if (lt && lt.cell === next) {
          if (logoTimerRef.current) { clearTimeout(logoTimerRef.current); logoTimerRef.current = null; }
          return null;
        }
        return lt;
      });
      return next;
    });
  };

  const resetRefs = () => {
    scoreRef.current = 0;
    hitsRef.current = 0;
    missesRef.current = 0;
    fastestHitRef.current = null;
    totalReactionRef.current = 0;
    maxStreakRef.current = 0;
    songPosRef.current = 0;
    nextLogoAtRef.current = 8 + Math.floor(Math.random() * 5);
    logoIdxRef.current = 0;
  };

  const reset = () => {
    if (!playerName || playerName.trim().length === 0) return;
    clearLogoTile();
    finishedRef.current = false;
    const startT = settings.startTime;
    timeLeftRef.current = startT;
    resetRefs();
    setStatus('playing');
    setTimeLeft(startT);
    setScore(0); setStreak(0); setMisses(0); setHits(0);
    setFastestHit(null); setTotalReactionMs(0);
    setPops([]); setComboMsg(''); setFlashMap({});
    const next = pickCell(-1, [], cellCount);
    spawnTimeRef.current = performance.now();
    setActiveCell(next);
    setHazardCell(settings.hazardChance > 0 && Math.random() < settings.hazardChance
      ? pickCell(next, [next], cellCount) : null);
    playTone(640, 120, 0.16);
  };

  // ── Effects ───────────────────────────────────────────────────────────────

  // Timer countdown
  useEffect(() => {
    if (status !== 'playing') return undefined;
    const id = setInterval(() => {
      setTimeLeft((prev) => {
        const next = +(prev - 0.1).toFixed(2);
        timeLeftRef.current = next;
        if (next <= 0) { clearInterval(id); endRun(); return 0; }
        return next;
      });
    }, 100);
    return () => clearInterval(id);
  }, [status]); // eslint-disable-line

  // Miss timeout — restarts whenever the active tile or pacing changes
  useEffect(() => {
    if (status !== 'playing') return undefined;
    const timeout = setTimeout(() => registerMiss(), difficultyWindow);
    return () => clearTimeout(timeout);
  }, [status, activeCell, difficultyWindow]); // eslint-disable-line

  // Block accidental refresh while playing
  useEffect(() => {
    if (status !== 'playing') return undefined;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [status]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e) => {
      // Block F5 / Ctrl+R / Cmd+R refresh while playing
      if (status === 'playing') {
        const isRefresh = e.code === 'F5' || ((e.ctrlKey || e.metaKey) && e.code === 'KeyR');
        if (isRefresh) { e.preventDefault(); return; }
      }
      if (e.code === 'Space') {
        e.preventDefault();
        if ((status === 'idle' || status === 'done') && playerName?.trim()) reset();
      }
      if (e.code === 'KeyP' || e.code === 'Escape') {
        if (status === 'playing') setStatus('paused');
        else if (status === 'paused') setStatus('playing');
      }
      if (e.code === 'KeyM') setSoundOn((v) => !v);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [status, playerName]); // eslint-disable-line

  // Cleanup timers on unmount
  useEffect(() => () => {
    Object.values(flashTimeoutsRef.current).forEach(clearTimeout);
    if (comboTimerRef.current) clearTimeout(comboTimerRef.current);
    if (logoTimerRef.current)  clearTimeout(logoTimerRef.current);
    stopSong();
  }, []); // eslint-disable-line

  // Reset when difficulty changes
  useEffect(() => {
    finishedRef.current = false;
    const startT = settings.startTime;
    timeLeftRef.current = startT;
    resetRefs();
    setStatus('idle'); setTimeLeft(startT);
    setScore(0); setStreak(0); setMisses(0); setHits(0);
    setFastestHit(null); setTotalReactionMs(0);
    setPops([]); setComboMsg(''); setFlashMap({});
    setActiveCell(pickCell(-1, [], cellCount)); setHazardCell(null);
  }, [settings, cellCount]); // eslint-disable-line

  // Resize
  useEffect(() => {
    const onResize = () => {
      const next = getGrid();
      setGrid((prev) => (prev.cols === next.cols && prev.rows === next.rows ? prev : next));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ── Game actions ──────────────────────────────────────────────────────────

  const registerMiss = () => {
    if (status !== 'playing') return;
    setStreak(0);
    setMisses((m) => m + 1);
    missesRef.current += 1;
    flashCell(activeCell, 'miss');
    playTone(220, 140, 0.13);
    const ended = applyTimePenalty(settings.missPenalty);
    if (!ended) spawnNewTarget();
  };

  const resumeGame = () => {
    if (status === 'paused') { setStatus('playing'); playTone(520, 120, 0.1); }
  };

  const registerHit = (cellIndex) => {
    if (status !== 'playing') return;

    // ── Logo bonus tile ──
    if (cellIndex === logoTile?.cell) {
      const brand = logoTile.brand;
      clearLogoTile();
      setScore((s) => { const v = s + LOGO_BONUS; scoreRef.current = v; return v; });
      spawnPop(cellIndex, brand, '#ffd700');
      flashCell(cellIndex, 'logo');
      playTone(1047, 200, 0.22);
      if (navigator?.vibrate) navigator.vibrate([25, 15, 25]);
      return;
    }

    // ── Hazard tile ──
    if (cellIndex === hazardCell) {
      flashCell(cellIndex, 'hazard');
      playTone(140, 180, 0.15);
      setHazardCell(null);
      setStreak(0);
      missesRef.current += 1;
      setScore((s) => { const v = Math.max(s - 10, 0); scoreRef.current = v; return v; });
      const ended = applyTimePenalty(settings.missPenalty + 1);
      if (!ended) spawnNewTarget();
      return;
    }

    // ── Wrong tile ──
    if (cellIndex !== activeCell) {
      setStreak(0);
      missesRef.current += 1;
      flashCell(cellIndex, 'miss');
      playTone(185, 120, 0.12);
      applyTimePenalty(settings.wrongClickPenalty ?? 2.5);
      if (navigator?.vibrate) navigator.vibrate(70);
      return;
    }

    // ── Correct hit ──
    const reaction = performance.now() - spawnTimeRef.current;
    const reactionRounded = Math.round(reaction);

    setFastestHit((prev) => (prev === null ? reactionRounded : Math.min(prev, reactionRounded)));
    setTotalReactionMs((prev) => prev + reaction);
    setHits((prev) => prev + 1);
    hitsRef.current += 1;
    totalReactionRef.current += reaction;
    if (fastestHitRef.current === null || reactionRounded < fastestHitRef.current) {
      fastestHitRef.current = reactionRounded;
    }

    flashCell(cellIndex, 'hit');

    // Maybe spawn a logo bonus tile
    trySpawnLogo(hitsRef.current, [cellIndex, hazardCell]);

    // Play the next melody note on top of the background track
    playMelodyNote(TAP_MELODY[songPosRef.current % TAP_MELODY.length]);
    songPosRef.current++;

    const speedBonus  = Math.max(2, Math.round((1200 - reaction) / 30));
    const streakBonus = Math.max(0, streak - 1) * 4;
    const gained      = 15 + speedBonus + streakBonus;

    setScore((s) => { const v = Math.max(s + gained, 0); scoreRef.current = v; return v; });
    spawnPop(cellIndex, `+${gained}`);

    const newStreak = streak + 1;
    setStreak(newStreak);
    if (newStreak > maxStreakRef.current) maxStreakRef.current = newStreak;
    showCombo(newStreak);

    const timeReward = Math.max(settings.rewardFloor,
      1.25 - reaction / settings.rewardSlope - streak * settings.rewardStreakFactor);
    const gain    = Math.max(settings.minGain, timeReward + settings.rewardBonus);
    const newTime = clamp(timeLeftRef.current + gain, 0, settings.timeRewardCap);
    timeLeftRef.current = newTime;
    setTimeLeft(newTime);

    spawnNewTarget();
  };

  // ── Derived display values ────────────────────────────────────────────────

  const totalAttempts = hits + misses;
  const accuracy      = totalAttempts > 0 ? Math.round((hits / totalAttempts) * 100) : null;
  const avgReaction   = hits > 0 ? Math.round(totalReactionMs / hits) : null;
  const isNewBest     = status === 'done' && personalBest > 0 && score > personalBest;
  const isFirstBest   = status === 'done' && personalBest === 0 && score > 0;
  const timebarBanked = timeLeft > settings.startTime;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="game-panel">
      {/* HUD */}
      <div className="hud hud--compact">
        <div className="hud-block">
          <p className="label">Player</p>
          <p className="value">{playerName || '—'}</p>
        </div>
        <div className="hud-block">
          <p className="label">Score</p>
          <p className="value score">{score}</p>
          <p className="value small" style={{ color: 'var(--accent)', marginTop: 2, visibility: streak >= 3 && status === 'playing' ? 'visible' : 'hidden' }}>x{streak}</p>
        </div>
        <div className="hud-block">
          {personalBest > 0 && <p className="value small pb-line">PB {personalBest}</p>}
          <div className="timebar">
            <div
              className={`timebar-fill${timebarBanked ? ' timebar-fill--banked' : ''}`}
              style={{ width: `${Math.min(100, (timeLeft / settings.startTime) * 100)}%` }}
            />
          </div>
          <p className="value small">{timeLeft.toFixed(1)}s</p>
        </div>
      </div>

      {/* Arena */}
      <div
        className="arena"
        style={{ gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))` }}
        onTouchMove={(e) => e.preventDefault()}
      >
        {[...Array(cellCount)].map((_, idx) => (
          <button
            key={idx}
            type="button"
            className={[
              'cell',
              idx === activeCell     ? 'cell--active cell--life' : '',
              idx === hazardCell     ? 'cell--hazard'            : '',
              idx === logoTile?.cell ? 'cell--logo'              : '',
              flashMap[idx]          ? `cell--flash-${flashMap[idx]}` : '',
            ].join(' ').trim()}
            style={idx === activeCell ? { '--life': `${difficultyWindow}ms` } : undefined}
            onPointerDown={(e) => { e.preventDefault(); registerHit(idx); }}
            aria-label={idx === activeCell ? 'Active target' : idx === hazardCell ? 'Hazard' : idx === logoTile?.cell ? 'Bonus' : 'Tile'}
          >
            {idx === logoTile?.cell && (
              <img
                src={logoTile.src}
                alt={logoTile.brand}
                className="cell-logo-img"
                style={logoTile.src === '/logo_two.png' ? { transform: 'scale(1.25)' } : { transform: 'scale(1.15)' }}
                draggable={false}
              />
            )}
          </button>
        ))}

        {/* Floating score popups */}
        {pops.map((pop) => (
          <div
            key={pop.id}
            className="score-pop"
            style={{ left: `${pop.x}%`, top: `${pop.y}%`, ...(pop.color ? { color: pop.color, textShadow: `0 0 12px ${pop.color}` } : {}) }}
          >
            {pop.text}
          </div>
        ))}

        {/* Combo announcement */}
        {comboMsg && <div className="combo-msg">{comboMsg}</div>}

        {/* Overlays (idle / paused / done) */}
        {status !== 'playing' && (
          <div className="overlay">
            <div className="overlay-card">
              {status === 'paused' ? (
                <>
                  <p className="headline">Paused</p>
                  <p className="sub">Press P or Esc to continue.</p>
                  <button className="cta" onClick={resumeGame}>Resume</button>
                  <button className="mini-btn ghost" onClick={reset}>Restart</button>
                </>
              ) : (
                <>
                  <p className="headline">{status === 'idle' ? 'Arcade Arena' : 'Run Complete'}</p>

                  {status === 'done' ? (
                    <>
                      {(isNewBest || isFirstBest) && (
                        <p className="new-best-badge">
                          {isFirstBest ? 'FIRST SCORE SET' : 'NEW PERSONAL BEST'}
                        </p>
                      )}
                      <div className="end-stats">
                        <div className="end-stat">
                          <span className="end-stat-label">Score</span>
                          <span className="end-stat-value accent">{score}</span>
                        </div>
                        {accuracy !== null && (
                          <div className="end-stat">
                            <span className="end-stat-label">Accuracy</span>
                            <span className="end-stat-value">{accuracy}%</span>
                          </div>
                        )}
                        {fastestHit !== null && (
                          <div className="end-stat">
                            <span className="end-stat-label">Best snap</span>
                            <span className="end-stat-value">{fastestHit} ms</span>
                          </div>
                        )}
                        {avgReaction !== null && (
                          <div className="end-stat">
                            <span className="end-stat-label">Avg reaction</span>
                            <span className="end-stat-value">{avgReaction} ms</span>
                          </div>
                        )}
                        {personalBest > 0 && (
                          <div className="end-stat">
                            <span className="end-stat-label">Personal best</span>
                            <span className="end-stat-value">{Math.max(score, personalBest)}</span>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="sub">
                      Tap green tiles fast — each hit plays a melody note.
                      {settings.hazardChance > 0 ? ' Dodge red decoys.' : ''}
                    </p>
                  )}

                  <button className="cta" onClick={reset}>
                    {status === 'idle' ? 'Start' : 'Play Again  (Space)'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Sound toggle — always accessible below the arena */}
      <div className="sound-bar">
        <button
          className={`sound-toggle${soundOn ? '' : ' sound-toggle--off'}`}
          onClick={() => setSoundOn((v) => !v)}
          title="Toggle sound (M)"
        >
          <span className="sound-icon">♪</span>
          {soundOn ? 'Sound on' : 'Sound off'}
        </button>
        {soundOn && (
          <span className="now-playing">Lonely at the Top – Asake</span>
        )}
      </div>
    </div>
  );
}

export default GameBoard;
