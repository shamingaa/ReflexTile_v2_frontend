import React, { useMemo } from 'react';

// Returns a human-readable "X days Y hours" until next Sunday midnight UTC
function nextSundayCountdown() {
  const now     = new Date();
  const day     = now.getUTCDay(); // 0=Sun
  const daysLeft = day === 0 ? 7 : 7 - day;
  const next    = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysLeft));
  const diff    = next - now;
  const d       = Math.floor(diff / 86_400_000);
  const h       = Math.floor((diff % 86_400_000) / 3_600_000);
  if (d === 0) return `${h}h`;
  return `${d}d ${h}h`;
}

function Leaderboard({ scores, loading, error, period = 'all', onPeriodChange, currentPlayerName = '' }) {
  const topFive  = scores.slice(0, 5);
  const resetIn  = useMemo(nextSundayCountdown, []);

  return (
    <div className="card leaderboard">
      <div className="card-header">
        <h3>Leaderboard</h3>
        <div className="segmented">
          <button
            className={period === 'all' ? 'active' : ''}
            onClick={() => onPeriodChange?.('all')}
          >
            All-time
          </button>
          <button
            className={period === 'week' ? 'active' : ''}
            onClick={() => onPeriodChange?.('week')}
          >
            This week
          </button>
        </div>
      </div>
      {period === 'week' && (
        <p className="lb-reset-label">Resets in {resetIn}</p>
      )}

      {loading && <p className="muted">Loading…</p>}
      {error   && <p className="error">{error}</p>}
      {!loading && scores.length === 0 && (
        <p className="muted">No scores yet{period === 'week' ? ' this week' : ''}. Be first!</p>
      )}

      {topFive.length > 0 && (
        <>
          <p className="muted lb-section-label">Top 5</p>
          <ol className="list top5">
            {topFive.map((entry, idx) => (
              <li
                key={`top-${entry.id ?? entry.playerName}-${idx}`}
                className={entry.playerName === currentPlayerName ? 'lb-row--me' : ''}
              >
                <span className="badge rank">{idx + 1}</span>
                <span className="name">{entry.playerName}</span>
                <span className="score">{entry.score}</span>
              </li>
            ))}
          </ol>
        </>
      )}

      {scores.length > 5 && (
        <>
          <p className="muted lb-section-label">All players</p>
          <ol className="list all">
            {scores.map((entry, idx) => (
              <li
                key={`all-${entry.id ?? entry.playerName}-${idx}`}
                className={entry.playerName === currentPlayerName ? 'lb-row--me' : ''}
              >
                <span className="lb-rank-num">#{idx + 1}</span>
                <span className="name">{entry.playerName}</span>
                <span className="score">{entry.score}</span>
                <span className="time">
                  {new Date(entry.updated_at || entry.updatedAt || entry.created_at || entry.createdAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

export default Leaderboard;
