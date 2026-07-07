import React, { useEffect, useState } from 'react';
import { getMetrics, getAcquirers, getEscalations, getTransactions } from '../services/api';
import { getSocket } from '../services/socket';
import StatsCard from '../components/StatsCard';
import LiveFeed from '../components/LiveFeed';
import NotificationBanner from '../components/NotificationBanner';

export default function Dashboard() {
  const [metrics, setMetrics] = useState(null);
  const [acquirers, setAcquirers] = useState([]);
  const [txs, setTxs] = useState([]);
  const [escalations, setEscalations] = useState([]);

  useEffect(() => {
    async function load() {
      try {
        const [m, a, e, t] = await Promise.all([
          getMetrics(), getAcquirers(), getEscalations({ open: true }), getTransactions({ limit: 15 })
        ]);
        setMetrics(m); setAcquirers(a); setEscalations(e); setTxs(t.transactions);
      } catch (err) { console.error(err); }
    }
    load();

    const socket = getSocket();
    socket.on('transaction:new', (tx) => {
      setTxs((prev) => [tx, ...prev].slice(0, 15));
      setMetrics((m) => m ? { ...m, totalTransactions: m.totalTransactions + 1 } : null);
    });
    socket.on('acquirer:update', (data) => setAcquirers(data));
    socket.on('agent:escalation', (esc) => setEscalations((prev) => [esc, ...prev]));

    return () => {
      socket.off('transaction:new');
      socket.off('acquirer:update');
      socket.off('agent:escalation');
    };
  }, []);

  return (
    <div className="admin-main">
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Sistem geneli metrikler ve gerçek zamanlı izleme</p>
        </div>
      </div>

      <NotificationBanner
        escalations={escalations}
        onAck={(id) => setEscalations((p) => p.filter((e) => e.id !== id))}
      />

      <div className="stats-grid">
        <StatsCard
          icon="💳" label="Toplam İşlem" color="var(--accent)"
          value={metrics ? metrics.totalTransactions.toLocaleString('tr-TR') : '...'}
        />
        <StatsCard
          icon="✓" label="Genel Başarı Oranı" color="var(--green)"
          value={metrics ? `${(metrics.successRate * 100).toFixed(1)}%` : '...'}
        />
        <StatsCard
          icon="🔌" label="Aktif Acquirer" color="var(--cyan)"
          value={metrics ? `${metrics.activeAcquirers} / 3` : '...'}
        />
        <StatsCard
          icon="🚨" label="Açık Incident" color={metrics?.openIncidents > 0 ? 'var(--red)' : 'var(--muted)'}
          value={metrics ? metrics.openIncidents : '...'}
        />
      </div>

      <div className="grid-2">
        {/* Acquirers */}
        <div className="card">
          <div className="section-title">Acquirer Durumları</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {acquirers.map((acq) => (
              <div key={acq.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{acq.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 2 }}>
                    Ağırlık: {acq.routingWeight.toFixed(1)}x • Gecikme: {acq.avgResponseTime.toFixed(0)}ms
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: acq.currentSuccessRate > 0.9 ? 'var(--green)' : 'var(--yellow)' }}>
                    {(acq.currentSuccessRate * 100).toFixed(1)}%
                  </div>
                  {acq.anomalyMode && (
                    <div className="tag critical" style={{ marginTop: 4 }}>Anomaly</div>
                  )}
                  {!acq.isActive && (
                    <div className="tag warning" style={{ marginTop: 4 }}>Isolated</div>
                  )}
                </div>
              </div>
            ))}
            {acquirers.length === 0 && <div className="empty-state">Yükleniyor...</div>}
          </div>
        </div>

        {/* Live feed */}
        <div className="card">
          <div className="section-title">Son İşlemler (Canlı)</div>
          <LiveFeed transactions={txs} />
        </div>
      </div>
    </div>
  );
}
