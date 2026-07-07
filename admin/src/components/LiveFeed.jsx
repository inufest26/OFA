import React from 'react';

const ACQUIRER_NAMES = {
  acquirer_garanti:   'Garanti',
  acquirer_yapikredi: 'Yapı Kredi',
  acquirer_isbank:    'İş Bankası',
};

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

export default function LiveFeed({ transactions }) {
  if (!transactions || transactions.length === 0) {
    return <div className="empty-state">Henüz işlem yok</div>;
  }

  return (
    <div className="live-feed">
      {transactions.slice(0, 15).map((tx) => (
        <div key={tx.id} className="feed-item">
          <span className={`feed-status ${tx.status}`} />
          <span className="feed-id">{(tx.id || tx.transactionId || '').slice(0, 8)}</span>
          <span className="feed-type">{ACQUIRER_NAMES[tx.acquirerId || tx.acquirer_id] || '—'}</span>
          <span className="feed-acq">
            <span className={`badge ${tx.status}`}>{tx.status}</span>
            {tx.retryCount > 0 && (
              <span style={{ marginLeft: 6, fontSize: '0.72rem', color: 'var(--yellow)' }}>
                ⟳ {tx.retryCount}
              </span>
            )}
          </span>
          <span className="feed-amt">₺{(tx.amount || 0).toLocaleString('tr-TR')}</span>
          <span className="feed-time">{timeAgo(tx.createdAt || tx.created_at)}</span>
        </div>
      ))}
    </div>
  );
}
