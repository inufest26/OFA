import React, { useState } from 'react';
import { acknowledgeEscalation } from '../services/api';

function AlertIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  );
}

function ChevronIcon({ expanded }) {
  return (
    <svg
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      style={{ width: 14, height: 14, transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)' }}
    >
      <polyline points="6 9 12 15 18 9"/>
    </svg>
  );
}

const SEVERITY_COLORS = {
  critical: { border: 'rgba(239,68,68,0.6)',  bg: 'rgba(239,68,68,0.08)',  text: '#ef4444' },
  high:     { border: 'rgba(239,68,68,0.4)',  bg: 'rgba(239,68,68,0.05)',  text: '#ef4444' },
  medium:   { border: 'rgba(245,158,11,0.4)', bg: 'rgba(245,158,11,0.05)', text: '#f59e0b' },
  low:      { border: 'rgba(14,165,233,0.4)', bg: 'rgba(14,165,233,0.05)', text: '#0ea5e9' },
};

function EscalationCard({ esc, isActive, onClick, onAck }) {
  const colors = SEVERITY_COLORS[esc.severity] || SEVERITY_COLORS.medium;

  return (
    <div
      className={`escalation-card ${isActive ? 'expanded' : 'collapsed'}`}
      style={{ borderColor: colors.border, background: colors.bg }}
      onClick={!isActive ? onClick : undefined}
    >
      {/* ── Collapsed header (always visible) ── */}
      <div className="escalation-card-header" onClick={isActive ? onClick : undefined}>
        <div className="escalation-icon" style={{ color: colors.text }}>
          <AlertIcon />
        </div>
        <div className="escalation-card-title" style={{ color: colors.text }}>
          <span className="escalation-severity-tag">{esc.severity?.toUpperCase()}</span>
          <span className="escalation-card-name">{esc.title}</span>
        </div>
        <ChevronIcon expanded={isActive} />
      </div>

      {/* ── Expanded body ── */}
      {isActive && (
        <div className="escalation-card-body">
          <div className="escalation-desc">{esc.description}</div>
          {esc.recommendation && (
            <div className="escalation-actions">
              <strong>Öneri:</strong> {esc.recommendation}
            </div>
          )}
          {esc.attemptedActions?.length > 0 && (
            <div className="escalation-actions">
              <strong>Denenen:</strong> {esc.attemptedActions.join(' · ')}
            </div>
          )}
          <div className="escalation-card-footer">
            <span className="escalation-time">
              {new Date(esc.created_at || Date.now()).toLocaleTimeString('tr-TR')}
            </span>
            <button className="ack-btn" onClick={(e) => { e.stopPropagation(); onAck(esc.id); }}>
              Okundu ✓
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function NotificationBanner({ escalations, onAck }) {
  // Track which card is expanded; default = most recent (index 0)
  const [activeId, setActiveId] = useState(null);

  if (!escalations || escalations.length === 0) return null;

  // Ensure activeId defaults to the first escalation when list is populated
  const effectiveActiveId = activeId ?? escalations[0]?.id;

  async function handleAck(id) {
    try {
      await acknowledgeEscalation(id);
      onAck(id);
      // If we just acked the active one, move focus to next
      if (id === effectiveActiveId) setActiveId(null);
    } catch (e) { console.error(e); }
  }

  return (
    <div className="escalation-carousel-wrap">
      {/* Horizontal scrollable track */}
      <div className="escalation-carousel">
        {escalations.map((esc) => (
          <EscalationCard
            key={esc.id}
            esc={esc}
            isActive={esc.id === effectiveActiveId}
            onClick={() => setActiveId(esc.id === effectiveActiveId ? null : esc.id)}
            onAck={handleAck}
          />
        ))}
      </div>
      {escalations.length > 1 && (
        <div className="escalation-count-badge">
          {escalations.length} açık olay
        </div>
      )}
    </div>
  );
}
