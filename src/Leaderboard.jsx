import React from 'react';

function Leaderboard({ scores, loading, error }) {
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
      <ol>
        {scores.map((entry) => (
          <li key={entry.id}>
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
