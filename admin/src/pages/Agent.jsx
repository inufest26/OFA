import React, { useEffect, useState, useRef } from 'react';
import { getIncidents, getIncident, askAgent, acknowledgeIncident } from '../services/api';
import { getSocket } from '../services/socket';

const ACQUIRER_NAMES = {
  acquirer_garanti:   'Garanti',
  acquirer_yapikredi: 'Yapı Kredi',
  acquirer_isbank:    'İş Bankası',
};

export default function Agent() {
  const [incidents, setIncidents] = useState([]);
  const [activeIncident, setActiveIncident] = useState(null);
  const [chat, setChat] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const chatRef = useRef(null);

  useEffect(() => {
    loadIncidents();
    const socket = getSocket();
    socket.on('agent:incident', loadIncidents);
    socket.on('agent:reasoning', (data) => {
      if (activeIncident && data.incidentId === activeIncident.id) {
        loadIncidentDetail(activeIncident.id); // Refresh detail
      }
    });
    return () => {
      socket.off('agent:incident');
      socket.off('agent:reasoning');
    };
  }, [activeIncident]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [chat]);

  async function loadIncidents() {
    try {
      setIncidents(await getIncidents({ limit: 50 }));
    } catch (e) { console.error(e); }
  }

  async function loadIncidentDetail(id) {
    try {
      const detail = await getIncident(id);
      setActiveIncident(detail);
    } catch (e) { console.error(e); }
  }

  async function handleAck() {
    if (!activeIncident) return;
    try {
      await acknowledgeIncident(activeIncident.id);
      await loadIncidentDetail(activeIncident.id);
      await loadIncidents();
    } catch (e) { console.error(e); }
  }

  async function handleAsk(e) {
    e.preventDefault();
    if (!input.trim()) return;
    const q = input;
    setInput('');
    setChat((c) => [...c, { role: 'user', text: q }]);
    setLoading(true);
    try {
      const { answer } = await askAgent(q);
      setChat((c) => [...c, { role: 'agent', text: answer }]);
    } catch (err) {
      setChat((c) => [...c, { role: 'agent', text: 'Bağlantı hatası: ' + err.message }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-main" style={{ padding: '24px 32px' }}>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div>
          <h1>Agent AI İzleme & Chat</h1>
          <p>Otonom sistem kararları ve AI asistan</p>
        </div>
      </div>

      <div className="agent-layout">
        {/* Left column: Incidents */}
        <div className="card incident-list" style={{ padding: 16 }}>
          <div className="section-title">Otonom Müdahaleler (Incidents)</div>
          {incidents.map((inc) => (
            <div
              key={inc.id}
              className={`incident-item ${activeIncident?.id === inc.id ? 'active' : ''}`}
              onClick={() => loadIncidentDetail(inc.id)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <div className="incident-item-title">{inc.title}</div>
                <div className={`badge ${inc.status}`}>{inc.status}</div>
              </div>
              <div className="incident-item-meta">
                {ACQUIRER_NAMES[inc.acquirer_id] || inc.acquirer_id} • {new Date(inc.created_at).toLocaleTimeString('tr-TR')}
              </div>
            </div>
          ))}
          {incidents.length === 0 && <div className="empty-state">Hiç olay yok</div>}
        </div>

        {/* Right column: Details OR Chat */}
        <div className="incident-detail">
          {activeIncident ? (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <button className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: '0.75rem', marginBottom: 10 }} onClick={() => setActiveIncident(null)}>
                    ← Chat'e Dön
                  </button>
                  <h2 style={{ fontSize: '1.2rem' }}>{activeIncident.title}</h2>
                  <div style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: 4 }}>
                    Acquirer: {ACQUIRER_NAMES[activeIncident.acquirer_id]} • {new Date(activeIncident.created_at).toLocaleString('tr-TR')}
                  </div>
                </div>
                {activeIncident.status === 'resolved' && (
                  <button className="btn btn-primary" onClick={handleAck}>Kapat / Acknowledge</button>
                )}
              </div>

              <div className="reasoning-scroll">
                <div className="section-title">Kök Neden & Öneriler</div>
                <div style={{ fontSize: '0.85rem', lineHeight: 1.5, marginBottom: 10 }}>
                  <strong>Kök Neden:</strong> {activeIncident.root_cause}
                </div>
                {activeIncident.recommendations?.length > 0 && (
                  <ul style={{ fontSize: '0.85rem', paddingLeft: 20, color: 'var(--muted)', marginBottom: 20 }}>
                    {activeIncident.recommendations.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                )}

                <div className="section-title">Agent Düşünce Süreci (Reasoning Chain)</div>
                {activeIncident.reasoningChain?.map((step, i) => (
                  <div key={i} className={`reasoning-step ${step.type}`}>
                    <div className="step-type">
                      {step.type === 'tool_call' ? '🛠️ ARAÇ KULLANIMI: ' + step.tool :
                       step.type === 'tool_result' ? '✅ SONUÇ: ' + step.tool :
                       '🧠 SONUÇ / KARAR'}
                    </div>
                    {step.type === 'tool_call' && <pre>{JSON.stringify(step.args, null, 2)}</pre>}
                    {step.type === 'tool_result' && <pre>{JSON.stringify(step.result, null, 2)}</pre>}
                    {step.type === 'conclusion' && <div>{step.text}</div>}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="chat-layout">
              <div className="chat-messages" ref={chatRef}>
                <div className="chat-bubble agent">
                  Merhaba, ben SmartPay Agent. Sistem sağlığını arka planda sürekli izliyorum. Bir anomali algılarsam müdahale ederim. Bana sistemin durumu, belirli bir sağlayıcının sağlığı veya genel metrikler hakkında sorular sorabilirsiniz.
                </div>
                {chat.map((msg, i) => (
                  <div key={i} className={`chat-bubble ${msg.role}`}>{msg.text}</div>
                ))}
                {loading && <div className="chat-bubble agent thinking">Düşünüyor...</div>}
              </div>
              <form className="chat-input-row" onSubmit={handleAsk}>
                <input
                  type="text" className="chat-input"
                  placeholder="Sistem durumu nasıl? Garanti'de sorun mu var?..."
                  value={input} onChange={(e) => setInput(e.target.value)}
                  disabled={loading}
                />
                <button type="submit" className="chat-send-btn" disabled={loading || !input.trim()}>Sor</button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
