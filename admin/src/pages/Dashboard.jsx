import React, { useEffect, useState } from 'react';
import { getMetrics, getAcquirers, getEscalations, getTransactions } from '../services/api';
import { getSocket } from '../services/socket';
import StatsCard from '../components/StatsCard';
import LiveFeed from '../components/LiveFeed';
import NotificationBanner from '../components/NotificationBanner';
import SuccessRateChart from '../components/SuccessRateChart';

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
    socket.on('metrics:savings_update', (data) => {
      setMetrics((m) => m ? { ...m, totalSavings: data.totalSavings } : null);
    });

    return () => {
      socket.off('transaction:new');
      socket.off('acquirer:update');
      socket.off('agent:escalation');
      socket.off('metrics:savings_update');
    };
  }, []);

  return (
    <div className="admin-main">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Dashboard</h1>
          <p>Sistem geneli metrikler ve gerçek zamanlı izleme</p>
        </div>
        
        {metrics && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.1), rgba(16, 185, 129, 0.2))',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            borderRadius: '12px',
            padding: '12px 24px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            boxShadow: '0 4px 20px rgba(34, 197, 94, 0.15)',
            position: 'relative',
            overflow: 'hidden'
          }}>
            <div style={{
              position: 'absolute', top: '-50%', left: '-50%', width: '200%', height: '200%',
              background: 'radial-gradient(circle, rgba(34,197,94,0.1) 0%, transparent 70%)',
              animation: 'spin 10s linear infinite', zIndex: 0
            }} />
            <div style={{ fontSize: '0.85rem', color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, zIndex: 1 }}>
              ML Yönlendirme Tasarrufu
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#fff', textShadow: '0 2px 10px rgba(34,197,94,0.3)', zIndex: 1 }}>
              ₺{metrics.totalSavings?.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>

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

      <SuccessRateChart />

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
