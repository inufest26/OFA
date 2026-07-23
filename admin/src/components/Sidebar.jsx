import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getTrafficStatus, toggleTraffic } from '../services/api';

const NAV = [
  {
    path: '/',
    label: 'Ana Panel',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <rect x="3" y="3" width="7" height="7" rx="1.5"/>
        <rect x="14" y="3" width="7" height="7" rx="1.5"/>
        <rect x="3" y="14" width="7" height="7" rx="1.5"/>
        <rect x="14" y="14" width="7" height="7" rx="1.5"/>
      </svg>
    ),
  },
  {
    path: '/acquirers',
    label: 'Sağlayıcılar',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M2 9h20M2 15h20M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/>
      </svg>
    ),
  },
  {
    path: '/transactions',
    label: 'İşlemler',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
      </svg>
    ),
  },
  {
    path: '/logs',
    label: 'Loglar',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14,2 14,8 20,8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
    ),
  },
  {
    path: '/agent',
    label: 'OFA Asistan',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <circle cx="12" cy="12" r="3"/>
        <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
      </svg>
    ),
  },
];

export default function Sidebar({ wsConnected }) {
  const nav      = useNavigate();
  const location = useLocation();
  const [trafficRunning, setTrafficRunning] = useState(true);

  useEffect(() => {
    getTrafficStatus().then(r => setTrafficRunning(r.isRunning)).catch(() => {});
  }, []);

  async function handleToggleTraffic() {
    try {
      const res = await toggleTraffic(trafficRunning ? 'stop' : 'start');
      setTrafficRunning(res.isRunning);
    } catch (err) {
      console.error(err);
    }
  }

  function logout() {
    localStorage.removeItem('token');
    nav('/login');
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="5" width="20" height="14" rx="2"/>
          <line x1="2" y1="10" x2="22" y2="10"/>
        </svg>
        <span className="sidebar-logo-text"><span>OFA</span> Admin</span>
      </div>

      <div className="sidebar-section-label">Gezinme</div>

      <nav className="sidebar-nav">
        {NAV.map((item) => (
          <button
            key={item.path}
            className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
            onClick={() => nav(item.path)}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button
          className="logout-btn"
          style={{ marginBottom: 12, justifyContent: 'center', backgroundColor: trafficRunning ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)', color: trafficRunning ? '#ef4444' : '#10b981', border: `1px solid ${trafficRunning ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)'}` }}
          onClick={handleToggleTraffic}
        >
          {trafficRunning ? '⏸ Trafiği Durdur' : '▶️ Trafiği Başlat'}
        </button>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10, fontSize: '0.75rem', color: 'var(--muted)' }}>
          <span className={`ws-dot ${wsConnected ? 'connected' : 'disconnected'}`} />
          {wsConnected ? 'Bağlı' : 'Bağlantı yok'}
        </div>
        <button className="logout-btn" onClick={logout}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16,17 21,12 16,7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Çıkış
        </button>
      </div>
    </aside>
  );
}
