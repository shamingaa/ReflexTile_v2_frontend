export const ACHIEVEMENTS = [
  { id: 'first_score',  title: 'First Blood',   desc: 'Complete your first run',               icon: '🎯' },
  { id: 'score_300',    title: 'Triple Threat',  desc: 'Score 300 or more in a run',            icon: '🔥' },
  { id: 'score_500',    title: 'High Flyer',     desc: 'Score 500 or more in a run',            icon: '⚡' },
  { id: 'score_1000',   title: 'Legendary',      desc: 'Score 1000 or more in a run',           icon: '👑' },
  { id: 'streak_10',    title: 'On Fire',        desc: '10x combo in one run',                  icon: '🔥' },
  { id: 'streak_20',    title: 'Unstoppable',    desc: '20x combo in one run',                  icon: '💥' },
  { id: 'logo_tap',     title: 'Brand Scout',    desc: 'Tap a sponsor tile',                    icon: '⭐' },
  { id: 'logo_5',       title: 'Brand Fan',      desc: 'Tap 5 sponsor tiles total',             icon: '🌟' },
  { id: 'accuracy_90',  title: 'Sharpshooter',   desc: '90%+ accuracy in one run',              icon: '🎯' },
  { id: 'snap_200',     title: 'Quick Draw',     desc: 'React in under 200 ms',                 icon: '⚡' },
  { id: 'day_streak_3', title: 'Regular',        desc: '3-day login streak',                    icon: '📅' },
  { id: 'day_streak_7', title: 'Dedicated',      desc: '7-day login streak',                    icon: '🏆' },
];

const ACH_KEY       = 'arcade_arena_achievements';
const LOGO_TAPS_KEY = 'arcade_arena_logo_taps_total';

export const readAchievements = () => {
  try { return JSON.parse(localStorage.getItem(ACH_KEY) || '{}'); }
  catch { return {}; }
};

export const readTotalLogoTaps = () =>
  parseInt(localStorage.getItem(LOGO_TAPS_KEY) || '0', 10);

/**
 * Check and unlock achievements based on a completed run.
 * Returns an array of newly-unlocked achievement objects.
 */
export const checkAndUnlock = ({ score, maxStreak, accuracy, fastestHit, logoTaps = 0, loginStreak }) => {
  const stored        = readAchievements();
  const newOnes       = [];
  const totalLogoTaps = readTotalLogoTaps() + logoTaps;
  localStorage.setItem(LOGO_TAPS_KEY, String(totalLogoTaps));

  const check = (id, condition) => {
    if (!stored[id] && condition) {
      stored[id] = Date.now();
      const def = ACHIEVEMENTS.find((a) => a.id === id);
      if (def) newOnes.push(def);
    }
  };

  check('first_score',  true);
  check('score_300',    score >= 300);
  check('score_500',    score >= 500);
  check('score_1000',   score >= 1000);
  check('streak_10',    maxStreak >= 10);
  check('streak_20',    maxStreak >= 20);
  check('logo_tap',     logoTaps > 0);
  check('logo_5',       totalLogoTaps >= 5);
  check('accuracy_90',  accuracy != null && accuracy >= 90);
  check('snap_200',     fastestHit != null && fastestHit < 200);
  check('day_streak_3', loginStreak >= 3);
  check('day_streak_7', loginStreak >= 7);

  if (newOnes.length > 0) {
    localStorage.setItem(ACH_KEY, JSON.stringify(stored));
  }
  return newOnes;
};
