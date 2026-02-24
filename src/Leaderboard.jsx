import React, { useState, useEffect, useMemo } from 'react';

const PAGE_SIZE = 10;

function nextSundayCountdown() {
  const now      = new Date();
  const day      = now.getUTCDay();
  const daysLeft = day === 0 ? 7 : 7 - day;
  const next     = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysLeft));
  const diff     = next - now;
  const d        = Math.floor(diff / 86_400_000);
  const h        = Math.floor((diff % 86_400_000) / 3_600_000);
  if (d === 0) return `${h}h`;
  return `${d}d ${h}h`;
}

const MEDALS = ['🥇', '🥈', '🥉'];

function Leaderboard({ scores, loading, error, period = 'all', onPeriodChange, currentPlayerName = '' }) {
  const [page, setPage] = useState(0);
  const resetIn = useMemo(nextSundayCountdown, []);

  const top3 = scores.slice(0, 3);
  const rest  = scores.slice(3);

  const totalPages = Math.ceil(rest.length / PAGE_SIZE);
  const pageSlice  = rest.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset to page 0 when period or scores change
  useEffect(() => { setPage(0); }, [period, scores.length]);

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

      {/* ── Top 3 podium ── */}
      {top3.length > 0 && (
        <div className="lb-podium">
          {top3.map((entry, idx) => (
            <div
              key={entry.id ?? entry.playerName}
              className={`lb-podium__card lb-podium__card--${idx + 1}${entry.playerName === currentPlayerName ? ' lb-podium__card--me' : ''}`}
            >
              <span className="lb-podium__medal">{MEDALS[idx]}</span>
              <span className="lb-podium__name">{entry.playerName}</span>
              <span className="lb-podium__score">{entry.score.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Paginated rest ── */}
      {rest.length > 0 && (
        <>
          <p className="lb-section-label">All players</p>
          <ol className="list all lb-list--paged">
            {pageSlice.map((entry, idx) => {
              const rank = page * PAGE_SIZE + idx + 4;
              const isMe = entry.playerName === currentPlayerName;
              return (
                <li
                  key={entry.id ?? entry.playerName}
                  className={isMe ? 'lb-row--me' : ''}
                >
                  <span className="lb-rank-num">#{rank}</span>
                  <span className="name">{entry.playerName}</span>
                  <span className="score">{entry.score.toLocaleString()}</span>
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
              <span className="lb-pagination__info">
                {page + 1} / {totalPages}
              </span>
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

export default Leaderboard;
