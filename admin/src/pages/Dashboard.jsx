import React, { useEffect, useState } from 'react';
import { getMetrics, getAcquirers, getEscalations, getTransactions } from '../services/api';
import { getSocket } from '../services/socket';
import StatsCard from '../components/StatsCard';
import LiveFeed from '../components/LiveFeed';
import SuccessRateChart from '../components/SuccessRateChart';

const IconCredit = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="5" width="20" height="14" rx="3"/>
    <line x1="2" y1="10" x2="22" y2="10"/>
  </svg>
);
const IconCheck = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20,6 9,17 4,12"/>
  </svg>
);
const IconServer = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="8" rx="3"/>
    <rect x="2" y="14" width="20" height="8" rx="3"/>
    <line x1="6" y1="6" x2="6.01" y2="6"/>
    <line x1="6" y1="18" x2="6.01" y2="18"/>
  </svg>
);
const IconAlert = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);

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

  const successPct = metrics ? (metrics.successRate * 100).toFixed(1) : null;

  return (
    <div className="admin-main">
      <div className="page-header">
        <div>
          <h1>Genel Bakış</h1>
          <p>Sistem metrikleri ve gerçek zamanlı işlemler</p>
        </div>
        {metrics != null && (
          <div className="savings-counter">
            <div className="savings-counter-label">ML Yönlendirme Tasarrufu</div>
            <div className="savings-counter-value">
              ₺{(metrics.totalSavings || 0).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        )}
      </div>

      <div className="stats-grid">
        <StatsCard
          icon={IconCredit}
          label="Toplam İşlem"
          value={metrics ? metrics.totalTransactions.toLocaleString('tr-TR') : '—'}
        />
        <StatsCard
          icon={IconCheck}
          label="Başarı Oranı"
          value={successPct != null ? `%${successPct}` : '—'}
        />
        <StatsCard
          icon={IconServer}
          label="Aktif Acquirer"
          value={metrics ? `${metrics.activeAcquirers} / 3` : '—'}
        />
        <StatsCard
          icon={IconAlert}
          label="Açık Olay"
          value={metrics ? metrics.openIncidents : '—'}
        />
      </div>

      <SuccessRateChart />

      <div className="grid-2" style={{ marginTop: '48px' }}>
        <div className="card">
          <div className="section-title">Acquirer Durumları</div>
          <div>
            {acquirers.map((acq) => {
              const rate = acq.currentSuccessRate;
              const rateColor = rate > 0.9 ? 'var(--text)' : rate > 0.7 ? 'var(--yellow)' : 'var(--red)';
              let status = 'Normal';
              if (!acq.isActive) status = 'İzole';
              else if (acq.anomalyMode) status = 'Anomali';
              else if (acq.predictiveRisk) status = 'Riskli';
              else if (rate < 0.9) status = 'Bozulmuş';

              return (
                <div key={acq.id} className="acq-item">
                  <div>
                    <div className="acq-item-name">{acq.name}</div>
                    <div className="acq-item-meta">
                      Ağırlık {acq.routingWeight.toFixed(1)}x · {acq.avgResponseTime.toFixed(0)} ms
                    </div>
                  </div>
                  <div>
                    <div className="acq-item-rate" style={{ color: rateColor }}>
                      %{(rate * 100).toFixed(1)}
                    </div>
                    {status !== 'Normal' && (
                      <div className={`acq-item-status tag ${acq.anomalyMode ? 'critical' : 'warning'}`}>
                        {status}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {acquirers.length === 0 && <div className="empty-state">Yükleniyor...</div>}
          </div>
        </div>

        <div className="card">
          <div className="section-title">Son İşlemler</div>
          <LiveFeed transactions={txs.slice(0, 8)} />
        </div>
      </div>
    </div>
  );
}
