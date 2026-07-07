import React from 'react';
import { acknowledgeEscalation } from '../services/api';

export default function NotificationBanner({ escalations, onAck }) {
  if (!escalations || escalations.length === 0) return null;

  async function handleAck(id) {
    try {
      await acknowledgeEscalation(id);
      onAck(id);
    } catch (e) { console.error(e); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
      {escalations.map((esc) => (
        <div key={esc.id} className="escalation-banner">
          <div className="escalation-icon">🚨</div>
          <div className="escalation-body">
            <div className="escalation-title">
              [{esc.severity?.toUpperCase()}] {esc.title}
            </div>
            <div className="escalation-desc">{esc.description}</div>
            {esc.recommendation && (
              <div className="escalation-actions">
                💡 Öneri: {esc.recommendation}
              </div>
            )}
            {esc.attemptedActions?.length > 0 && (
              <div className="escalation-actions">
                Denenen aksiyonlar: {esc.attemptedActions.join(' • ')}
              </div>
            )}
          </div>
          <button className="ack-btn" onClick={() => handleAck(esc.id)}>
            Onaylandı
          </button>
        </div>
      ))}
    </div>
  );
}
