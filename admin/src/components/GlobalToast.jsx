import React, { useEffect, useState } from 'react';
import { getSocket } from '../services/socket';

export default function GlobalToast() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const socket = getSocket();

    function addToast(title, type, id) {
      const newToast = { id, title, type };
      setToasts((prev) => [...prev, newToast]);
      // Auto dismiss after 6 seconds
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 6000);
    }

    // Escalate to admin triggers a toast
    const onEscalation = (esc) => {
      addToast(`🚨 Yeni Vaka: ${esc.title}`, 'error', `esc-${esc.id || Date.now()}`);
    };

    // Agent investigation starts
    const onAction = (data) => {
      if (data.type === 'investigate') {
        addToast(`🤖 Agent Otonom Müdahalesi: ${data.acquirerId}`, 'info', `inc-${data.incidentId || Date.now()}`);
      }
    };

    socket.on('agent:escalation', onEscalation);
    socket.on('agent:action', onAction);

    return () => {
      socket.off('agent:escalation', onEscalation);
      socket.off('agent:action', onAction);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="global-toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className={`global-toast toast-${toast.type} fade-in-toast`}>
          <div className="toast-icon">
            {toast.type === 'error' ? '🚨' : '🤖'}
          </div>
          <div className="toast-content">
            <div className="toast-title">{toast.title}</div>
            <div className="toast-desc">
              {toast.type === 'error' ? 'Admin müdahalesi gerekiyor' : 'Sistem tarafından inceleniyor'}
            </div>
          </div>
          <button className="toast-close" onClick={() => setToasts((p) => p.filter(t => t.id !== toast.id))}>×</button>
        </div>
      ))}
    </div>
  );
}
