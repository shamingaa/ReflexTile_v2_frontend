import React from 'react';

function Leaderboard({ scores, loading, error }) {
  const topFive = scores.slice(0, 5);
  return (
    <div className="card leaderboard">
      <div className="card-header">
        <h3>Leaderboard</h3>
        <div className="segmented">
          <button className="active">Solo</button>
        </div>
      </div>
      {loading && <p className="muted">Loading…</p>}
      {error && <p className="error">{error}</p>}
      {!loading && scores.length === 0 && <p className="muted">No scores yet. Be first!</p>}
      {topFive.length > 0 && (
        <>
          <p className="muted">Top 5</p>
          <ol className="list top5">
            {topFive.map((entry, idx) => (
              <li key={`top-${entry.id || entry.playerName}-${idx}`}>
                <span className="badge rank">{idx + 1}</span>
                <span className="name">{entry.playerName}</span>
                <span className="score">{entry.score}</span>
              </li>
            ))}
          </ol>
        </>
      )}
      <p className="muted">All players</p>
      <ol className="list all">
        {scores.map((entry, idx) => (
          <li key={`all-${entry.id || entry.playerName}-${idx}`}>
            <span className="name">{entry.playerName}</span>
            <span className="score">{entry.score}</span>
            <span className="time">{new Date(entry.created_at || entry.createdAt).toLocaleString()}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default Leaderboard;
