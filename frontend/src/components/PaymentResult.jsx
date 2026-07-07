import React from 'react';

const ACQUIRER_NAMES = {
  acquirer_garanti:   'Garanti Sanal POS',
  acquirer_yapikredi: 'Yapı Kredi Sanal POS',
  acquirer_isbank:    'İş Bankası Sanal POS',
};

export default function PaymentResult({ result, onBack }) {
  const { success, acquirerId, responseTimeMs, retryCount, retryHistory, mlScores, error, transactionId } = result;

  const topAcquirer = mlScores
    ? Object.entries(mlScores).sort((a, b) => b[1] - a[1])[0]
    : null;

  return (
    <div className="result fade-in">
      {/* ── Icon ──────────────────────────────────────────────────────────── */}
      <div className={`result-icon ${success ? 'success' : 'fail'}`}>
        {success ? '✓' : '✕'}
      </div>

      {/* ── Title ─────────────────────────────────────────────────────────── */}
      <h2 className={success ? 'success' : 'fail'}>
        {success ? 'Ödeme Başarılı!' : 'Ödeme Reddedildi'}
      </h2>

      {/* ── Message ───────────────────────────────────────────────────────── */}
      <p>{error?.message || (success ? 'İşleminiz başarıyla tamamlandı.' : 'İşlem gerçekleştirilemedi.')}</p>

      {/* ── ML Badge ─────────────────────────────────────────────────────── */}
      {topAcquirer && (
        <div className="ml-badge">
          🤖 ML — En yüksek skor: {ACQUIRER_NAMES[topAcquirer[0]] || topAcquirer[0]} ({(topAcquirer[1] * 100).toFixed(1)}%)
        </div>
      )}

      {/* ── Detail Card ───────────────────────────────────────────────────── */}
      <div className="result-details">
        <div className="detail-row">
          <span className="label">İşlem ID</span>
          <span className="value" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            {transactionId?.slice(0, 8)}…
          </span>
        </div>
        <div className="detail-row">
          <span className="label">Acquirer</span>
          <span className="value">{ACQUIRER_NAMES[acquirerId] || acquirerId || '—'}</span>
        </div>
        <div className="detail-row">
          <span className="label">Yanıt Süresi</span>
          <span className="value">{responseTimeMs}ms</span>
        </div>
        <div className="detail-row">
          <span className="label">Durum</span>
          <span className={`value ${success ? 'green' : 'red'}`}>
            {success ? '✓ Onaylandı' : error?.code ? `✕ ${error.code}` : '✕ Reddedildi'}
          </span>
        </div>
        {retryCount > 0 && (
          <div className="detail-row">
            <span className="label">Retry</span>
            <span className="value" style={{ color: 'var(--yellow)' }}>{retryCount} deneme</span>
          </div>
        )}
      </div>

      {/* ── Retry timeline ───────────────────────────────────────────────── */}
      {retryCount > 0 && retryHistory?.length > 0 && (
        <div className="retry-badge">
          ⟳ {retryCount} farklı acquirer denendi — {
            retryHistory.map((r, i) => `#${i + 1}: ${ACQUIRER_NAMES[r.acquirerId] || r.acquirerId} ${r.success ? '✓' : '✕'}`).join(' → ')
          }
        </div>
      )}

      {/* ── ML Scores ─────────────────────────────────────────────────────── */}
      {mlScores && Object.keys(mlScores).length > 0 && (
        <div className="result-details">
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            ML Routing Skorları
          </div>
          {Object.entries(mlScores).sort((a, b) => b[1] - a[1]).map(([id, score]) => (
            <div key={id} className="detail-row">
              <span className="label">{ACQUIRER_NAMES[id] || id}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 80, height: 6,
                  background: 'var(--surface2)',
                  borderRadius: 3, overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${score * 100}%`, height: '100%',
                    background: id === acquirerId ? 'var(--green)' : 'var(--accent)',
                    borderRadius: 3,
                    transition: 'width 0.6s ease'
                  }} />
                </div>
                <span className="value" style={{ fontSize: '0.8rem' }}>{(score * 100).toFixed(1)}%</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Back ──────────────────────────────────────────────────────────── */}
      <button className="back-btn" onClick={onBack} id="back-button">
        ← Yeni Ödeme
      </button>
    </div>
  );
}
