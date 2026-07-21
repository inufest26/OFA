import React from 'react';

export default function StatsCard({ label, value, sub, color = 'var(--accent)', icon }) {
  return (
    <div className="stat-card">
      {icon && (
        <div className="stat-card-icon" style={{ background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
          <span style={{ color }}>{icon}</span>
        </div>
      )}
      <div className="stat-card-label">{label}</div>
      <div className="stat-card-value" style={{ color }}>{value}</div>
      {sub && <div className="stat-card-sub">{sub}</div>}
    </div>
  );
}
