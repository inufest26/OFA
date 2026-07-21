import React from 'react';
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

export default function NotificationBanner({ escalations, onAck }) {
  if (!escalations || escalations.length === 0) return null;

  async function handleAck(id) {
    try {
      await acknowledgeEscalation(id);
      onAck(id);
    } catch (e) { console.error(e); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
      {escalations.map((esc) => (
        <div key={esc.id} className="escalation-banner">
          <div className="escalation-icon"><AlertIcon /></div>
          <div className="escalation-body">
            <div className="escalation-title">
              <span style={{ marginRight: 6, opacity: 0.6, fontSize: '0.75rem' }}>{esc.severity?.toUpperCase()}</span>
              {esc.title}
            </div>
            <div className="escalation-desc">{esc.description}</div>
            {esc.recommendation && (
              <div className="escalation-actions">
                Öneri: {esc.recommendation}
              </div>
            )}
            {esc.attemptedActions?.length > 0 && (
              <div className="escalation-actions">
                Denenen aksiyonlar: {esc.attemptedActions.join(' · ')}
              </div>
            )}
          </div>
          <button className="ack-btn" onClick={() => handleAck(esc.id)}>
            Okundu
          </button>
        </div>
      ))}
    </div>
  );
}
