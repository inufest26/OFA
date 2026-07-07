import React from 'react';

export default function StatsCard({ icon, label, value, sub, color = 'var(--accent)', iconBg }) {
  return (
    <div className="stat-card">
      <div className="stat-card-icon" style={{ background: iconBg || `${color}20` }}>
        <span style={{ color }}>{icon}</span>
      </div>
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value" style={{ color }}>{value}</div>
      {sub && <div className="stat-card-sub">{sub}</div>}
    </div>
  );
}
