import React, { useEffect, useState } from 'react';
import { getAcquirers, toggleAcquirer, updateAcquirerSettings } from '../services/api';
import { getSocket } from '../services/socket';

export default function Acquirers() {
  const [acquirers, setAcquirers] = useState([]);
  const [actionMessage, setActionMessage] = useState(null);

  const [settingsModal, setSettingsModal] = useState(null);

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

  async function handleToggle(id, isActive) {
    try {
      await toggleAcquirer(id, isActive ? 'isolate' : 'restore');
      showMessage(isActive ? 'Sağlayıcı izole edildi' : 'Sağlayıcı tekrar devreye alındı', 'success');
    } catch (e) {
      showMessage('İşlem başarısız oldu', 'warn');
    }
  }

  async function handleSaveSettings(e) {
    e.preventDefault();
    try {
      await updateAcquirerSettings(settingsModal.id, settingsModal.weight);
      setSettingsModal(null);
      showMessage('Ayarlar kaydedildi', 'success');
    } catch (err) {
      showMessage('Ayarlar kaydedilemedi', 'warn');
    }
  }

  return (
    <div className="admin-main">
      <div className="page-header">
        <div>
          <h1>Sağlayıcı Sağlığı</h1>
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
            badgeClass = 'isolated'; badgeText = 'İzole Edildi'; cardClass = 'isolated';
          } else if (acq.anomalyMode) {
            badgeClass = 'critical'; badgeText = 'Anomali'; cardClass = 'anomaly';
          } else if (acq.predictiveRisk) {
            badgeClass = 'warning'; badgeText = 'Risk Tahmini 📉'; cardClass = 'degraded';
          } else if (acq.currentSuccessRate < 0.9) {
            badgeClass = 'warning'; badgeText = 'Performans Düşük';
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

              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', gap: 10, justifyContent: 'space-between' }}>
                <button
                  className="btn"
                  style={{ flex: 1, fontSize: '0.8rem', padding: '8px', background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '6px' }}
                  onClick={() => setSettingsModal({ id: acq.id, name: acq.name, weight: acq.routingWeight })}
                >
                  ⚙️ Ayarlar
                </button>
                <button
                  className="btn"
                  style={{ flex: 1, fontSize: '0.8rem', padding: '8px', background: acq.isActive ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)', color: acq.isActive ? 'var(--red)' : 'var(--green)', border: `1px solid ${acq.isActive ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`, borderRadius: '6px' }}
                  onClick={() => handleToggle(acq.id, acq.isActive)}
                >
                  {acq.isActive ? '🛑 Kapat' : '✅ Geri Aç'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {settingsModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, animation: 'fadeSlide 0.3s ease' }}>
          <div style={{ background: 'var(--surface)', padding: 32, borderRadius: 'var(--radius-lg)', width: 420, border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
            <h2 style={{ margin: '0 0 24px', fontSize: '1.4rem', color: 'var(--text)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: 10 }}>
              ⚙️ {settingsModal.name} Ayarları
            </h2>
            <form onSubmit={handleSaveSettings}>
              <div style={{ marginBottom: 28 }}>
                <label style={{ display: 'block', marginBottom: 12, color: 'var(--muted)', fontSize: '0.9rem', fontWeight: '500' }}>Yönlendirme Ağırlığı (0.0 - 2.0)</label>
                <input
                  type="number" step="0.1" min="0" max="2" required
                  style={{ width: '100%', padding: '14px 16px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--text)', fontSize: '1.05rem', outline: 'none', transition: 'border-color 0.2s', boxSizing: 'border-box' }}
                  value={settingsModal.weight}
                  onChange={(e) => setSettingsModal({ ...settingsModal, weight: e.target.value })}
                  onFocus={(e) => e.target.style.borderColor = 'var(--text)'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                />
                <p style={{ marginTop: 10, fontSize: '0.8rem', color: 'var(--dim)', lineHeight: 1.4 }}>
                  Ağırlık 0 ise bu bankaya işlem gönderilmez. Yüksek ağırlıklar trafik hacmini oransal olarak artırır.
                </p>
              </div>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <button type="button" className="btn btn-ghost" style={{ padding: '12px 24px', fontSize: '0.95rem' }} onClick={() => setSettingsModal(null)}>İptal</button>
                <button type="submit" className="btn" style={{ background: 'var(--text)', color: 'var(--bg)', padding: '12px 28px', fontSize: '0.95rem', fontWeight: '600', borderRadius: '8px' }}>Kaydet</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
