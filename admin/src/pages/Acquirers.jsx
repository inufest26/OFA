import React, { useEffect, useState } from 'react';
import { getAcquirers } from '../services/api';
import { getSocket } from '../services/socket';

export default function Acquirers() {
  const [acquirers, setAcquirers] = useState([]);
  const [actionMessage, setActionMessage] = useState(null);

  useEffect(() => {
    getAcquirers().then(setAcquirers).catch(console.error);
    const socket = getSocket();
    socket.on('acquirer:update', setAcquirers);
    return () => socket.off('acquirer:update');
  }, []);

  function showMessage(msg, type = 'info') {
    setActionMessage({ text: msg, type });
    setTimeout(() => setActionMessage(null), 3500);
  }

  return (
    <div className="admin-main">
      <div className="page-header">
        <div>
          <h1>Acquirer Health</h1>
          <p>Ödeme sağlayıcılarının gerçek zamanlı durumları</p>
        </div>
      </div>

      {actionMessage && (
        <div style={{
          marginBottom: 16,
          padding: '10px 16px',
          borderRadius: 8,
          background: actionMessage.type === 'warn' ? 'rgba(234, 179, 8, 0.15)' : 'rgba(59, 130, 246, 0.15)',
          border: `1px solid ${actionMessage.type === 'warn' ? 'rgba(234,179,8,0.4)' : 'rgba(59,130,246,0.4)'}`,
          color: actionMessage.type === 'warn' ? 'var(--yellow)' : 'var(--cyan)',
          fontSize: '0.85rem',
        }}>
          {actionMessage.text}
        </div>
      )}

      <div className="acquirer-grid">
        {acquirers.map((acq) => {
          let badgeClass = 'ok', badgeText = 'Normal';
          let cardClass = 'normal';
          if (!acq.isActive) {
            badgeClass = 'isolated'; badgeText = 'Isolated'; cardClass = 'isolated';
          } else if (acq.anomalyMode) {
            badgeClass = 'critical'; badgeText = 'Anomaly'; cardClass = 'anomaly';
          } else if (acq.currentSuccessRate < 0.9) {
            badgeClass = 'warning'; badgeText = 'Degraded';
          }

          return (
            <div key={acq.id} className={`acq-card ${cardClass}`}>
              <div className="acq-header">
                <div className="acq-name">{acq.name}</div>
                <div className={`acq-badge ${badgeClass}`}>{badgeText}</div>
              </div>

              <div className="acq-metric">
                <div className="acq-metric-label">Başarı Oranı</div>
                <div className="acq-metric-row">
                  <div className="acq-metric-bar-track" style={{ flex: 1, marginRight: 12 }}>
                    <div className="acq-metric-bar-fill" style={{
                      width: `${Math.min(100, acq.currentSuccessRate * 100)}%`,
                      background: acq.currentSuccessRate > 0.9 ? 'var(--green)' : acq.currentSuccessRate > 0.7 ? 'var(--yellow)' : 'var(--red)'
                    }} />
                  </div>
                  <div className="acq-metric-value">{(acq.currentSuccessRate * 100).toFixed(1)}%</div>
                </div>
              </div>

              <div className="acq-metric" style={{ marginTop: 16 }}>
                <div className="acq-metric-label">Gecikme (ms)</div>
                <div className="acq-metric-row">
                  <div className="acq-metric-bar-track" style={{ flex: 1, marginRight: 12 }}>
                    <div className="acq-metric-bar-fill" style={{
                      width: `${Math.min(100, (acq.avgResponseTime / 1000) * 100)}%`,
                      background: acq.avgResponseTime < 400 ? 'var(--cyan)' : 'var(--yellow)'
                    }} />
                  </div>
                  <div className="acq-metric-value">{acq.avgResponseTime.toFixed(0)}</div>
                </div>
              </div>

              <div className="acq-stats-row">
                <div className="acq-stat-box">
                  <div className="acq-stat-box-label">Toplam İşlem</div>
                  <div className="acq-stat-box-value">{acq.totalTransactions.toLocaleString()}</div>
                </div>
                <div className="acq-stat-box">
                  <div className="acq-stat-box-label">Ardışık Hata</div>
                  <div className="acq-stat-box-value" style={{ color: acq.consecutiveFailures > 3 ? 'var(--red)' : 'inherit' }}>
                    {acq.consecutiveFailures}
                  </div>
                </div>
              </div>

              <div className="acq-stats-row">
                <div className="acq-stat-box">
                  <div className="acq-stat-box-label">Yönlendirme Ağırlığı</div>
                  <div className="acq-stat-box-value">{acq.routingWeight.toFixed(1)}x</div>
                </div>
              </div>

              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'space-between' }}>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                  onClick={() => showMessage(`${acq.name} ayarları Agent AI üzerinden yönetilir. "Agent AI" sekmesinden komut verebilirsiniz.`, 'info')}
                >
                  Ayarlar
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: '0.75rem', padding: '4px 8px', color: 'var(--red)' }}
                  onClick={() => showMessage(`Kapatma işlemi Agent AI tarafından anomali tespitinde otomatik gerçekleştirilir. Manuel için "Agent AI" sekmesinden komut verebilirsiniz.`, 'warn')}
                >
                  Kapat
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
