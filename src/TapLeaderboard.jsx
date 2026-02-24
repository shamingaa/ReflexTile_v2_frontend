import React, { useState, useEffect, useMemo } from 'react';

const PAGE_SIZE = 10;
const MEDALS    = ['🥇', '🥈', '🥉'];

function TapLeaderboard({ tapScores = [], currentPlayerName = '' }) {
  const top3 = tapScores.slice(0, 3);
  const rest  = tapScores.slice(3);

  const totalPages = Math.ceil(rest.length / PAGE_SIZE);

  const myPageInRest = useMemo(() => {
    const idx = rest.findIndex((s) => s.playerName === currentPlayerName);
    return idx >= 0 ? Math.floor(idx / PAGE_SIZE) : 0;
  }, [rest, currentPlayerName]);

  const [page, setPage] = useState(myPageInRest);

  useEffect(() => {
    setPage(myPageInRest);
  }, [myPageInRest]);

  const pageSlice = rest.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (tapScores.length === 0) return null;

  return (
    <div className="card leaderboard">

      <div className="card-header">
        <h3>Tap Champions</h3>
        <span className="tap-lb-badge">Sponsor Tiles</span>
      </div>

      <p className="lb-tap-desc">Most sponsor tiles tapped — across all games</p>

      {/* Top 3 podium */}
      {top3.length > 0 && (
        <div className="lb-podium">
          {top3.map((entry, idx) => (
            <div
              key={entry.playerName}
              className={[
                'lb-podium__card',
                `lb-podium__card--${idx + 1}`,
                entry.playerName === currentPlayerName ? 'lb-podium__card--me' : '',
              ].join(' ').trim()}
            >
              <span className="lb-podium__medal">{MEDALS[idx]}</span>
              <span className="lb-podium__name">{entry.playerName}</span>
              <span className="lb-podium__score">{Number(entry.totalTaps).toLocaleString()} taps</span>
              <span className="lb-podium__tap-breakdown">
                <span className="tap-brand tap-brand--tube">
                  Tuberway&nbsp;{Number(entry.tuberwayTaps).toLocaleString()}
                </span>
                <span className="tap-brand-sep"> · </span>
                <span className="tap-brand tap-brand--pct">
                  1Percent&nbsp;{Number(entry.percentTaps).toLocaleString()}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Paginated rest (rank 4+) */}
      {rest.length > 0 && (
        <>
          <p className="lb-section-label">All players</p>
          <ol className="list all lb-list--paged">
            {pageSlice.map((entry, idx) => {
              const rank = page * PAGE_SIZE + idx + 4;
              const isMe = entry.playerName === currentPlayerName;
              return (
                <li key={entry.playerName} className={isMe ? 'lb-row--me' : ''}>
                  <span className="lb-rank-num">#{rank}</span>
                  <span className="name">{entry.playerName}</span>
                  <span className="score">{Number(entry.totalTaps).toLocaleString()}</span>
                </li>
              );
            })}
          </ol>

          {totalPages > 1 && (
            <div className="lb-pagination">
              <button
                className="lb-pagination__btn"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                ← Prev
              </button>
              <span className="lb-pagination__info">{page + 1} / {totalPages}</span>
              <button
                className="lb-pagination__btn"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page === totalPages - 1}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}

    </div>
  );
}

export default TapLeaderboard;
