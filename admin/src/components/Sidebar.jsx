import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const NAV = [
  { path: '/',            label: 'Dashboard',    icon: '⊞' },
  { path: '/acquirers',   label: 'Acquirers',    icon: '⬡' },
  { path: '/transactions',label: 'İşlemler',     icon: '↔' },
  { path: '/logs',        label: 'Loglar',       icon: '≡' },
  { path: '/agent',       label: 'Agent AI',     icon: '◈' },
];

export default function Sidebar({ wsConnected }) {
  const nav      = useNavigate();
  const location = useLocation();

  function logout() {
    localStorage.removeItem('token');
    nav('/login');
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="4" width="22" height="16" rx="2"/>
          <line x1="1" y1="10" x2="23" y2="10"/>
        </svg>
        <span className="sidebar-logo-text">Smart<span>Pay</span></span>
      </div>

      <nav className="sidebar-nav">
        {NAV.map((item) => (
          <button
            key={item.path}
            className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
            onClick={() => nav(item.path)}
          >
            <span>{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: '0.75rem', color: 'var(--muted)' }}>
          <span className={`ws-dot ${wsConnected ? 'connected' : 'disconnected'}`} />
          {wsConnected ? 'Bağlı' : 'Bağlantı yok'}
        </div>
        <button className="logout-btn" onClick={logout}>
          ⊗ Çıkış
        </button>
      </div>
    </aside>
  );
}
