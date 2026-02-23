import React from 'react';

function Leaderboard({ scores, loading, error, period = 'all', onPeriodChange, currentPlayerName = '' }) {
  const topFive = scores.slice(0, 5);

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
