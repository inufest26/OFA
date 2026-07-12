import React, { useEffect, useState, useRef } from 'react';
import { getIncidents, getIncident, askAgent, acknowledgeIncident, triggerAcquirerFault, triggerMerchantFault } from '../services/api';
import { getSocket } from '../services/socket';

const ACQUIRER_NAMES = {
  acquirer_garanti:   'Garanti',
  acquirer_yapikredi: 'Yapı Kredi',
  acquirer_isbank:    'İş Bankası',
};

const STATUS_NAMES = {
  open: 'açık',
  resolved: 'çözüldü',
  escalated: 'iletildi'
};

const TOOL_LABELS = {
  query_transaction_logs:    '🔍 Transaction logları sorgulanıyor...',
  get_acquirer_metrics:      '📊 Acquirer metrikleri okunuyor...',
  get_error_distribution:    '📈 Hata dağılımı analiz ediliyor...',
  get_all_acquirer_statuses: '🌐 Tüm acquirer durumları kontrol ediliyor...',
  update_routing_weight:     '⚙️ Routing ağırlığı güncelleniyor...',
  isolate_acquirer:          '⛔ Acquirer izole ediliyor...',
  restore_acquirer:          '✅ Acquirer geri yükleniyor...',
  create_incident_report:    '📋 Incident raporu oluşturuluyor...',
  escalate_to_admin:         '🚨 Admin\u2019e escalate ediliyor...',
};

export default function Agent() {
  const [incidents, setIncidents] = useState([]);
  const [activeIncident, setActiveIncident] = useState(null);
  const [liveSteps, setLiveSteps] = useState([]); // streaming steps
  const [agentRunning, setAgentRunning] = useState(false);
  const [chat, setChat] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const chatRef = useRef(null);
  const reasoningRef = useRef(null);
  const activeIncidentRef = useRef(null);

  // Keep ref in sync for use inside socket callbacks
  useEffect(() => { activeIncidentRef.current = activeIncident; }, [activeIncident]);

  useEffect(() => {
    loadIncidents();
    const socket = getSocket();

    // New incident started by agent
    socket.on('agent:action', (data) => {
      if (data.type === 'investigate') {
        setAgentRunning(true);
        setLiveSteps([]);
        // Don't auto-open it to preserve chat. Instead, send a notification to the chat.
        setChat((c) => [...c, { 
          role: 'agent', 
          text: `🚨 **Yeni Otonom Müdahale Başladı**\n\nSistemde bir anomali tespit ettim (${data.acquirerId}). Arka planda incelemeye başladım. Detayları sol paneldeki olay listesinden görebilir veya bana buradan sorabilirsin.` 
        }]);
      }
    });

    // Live reasoning step
    socket.on('agent:step', (data) => {
      setLiveSteps((prev) => [...prev, data.step]);
      // Auto scroll
      if (reasoningRef.current) {
        setTimeout(() => {
          if (reasoningRef.current) reasoningRef.current.scrollTop = reasoningRef.current.scrollHeight;
        }, 50);
      }
    });

    // Investigation finished
    socket.on('agent:incident', async (data) => {
      setAgentRunning(false);
      await loadIncidents();
      // If the active incident is the one that finished, reload its detail
      if (activeIncidentRef.current?.id === data.incidentId || activeIncidentRef.current?.status === 'open') {
        try {
          const detail = await getIncident(data.incidentId);
          setActiveIncident(detail);
          setLiveSteps([]);
        } catch (e) { console.error(e); }
      }
    });

    return () => {
      socket.off('agent:action');
      socket.off('agent:step');
      socket.off('agent:incident');
    };
  }, []);

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
      setLiveSteps([]); 
      // Do not kill agentRunning if it's currently running on an open incident
      if (detail.status !== 'open') {
        setAgentRunning(false);
      }
    } catch (e) { console.error(e); }
  }

  function handleBackToChat() {
    setActiveIncident(null);
    if (!agentRunning) {
      setLiveSteps([]);
    }
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
    await submitQuestion(input);
  }

  async function handleQuickAsk(q) {
    if (loading) return;
    await submitQuestion(q);
  }

  async function submitQuestion(q) {
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

  const [triggeringAcquirer, setTriggeringAcquirer] = useState(false);
  const [triggeringMerchant, setTriggeringMerchant] = useState(false);

  async function handleAcquirerFault() {
    setTriggeringAcquirer(true);
    try {
      await triggerAcquirerFault();
    } catch (err) {
      console.error('Failed to trigger acquirer fault', err);
    } finally {
      setTimeout(() => setTriggeringAcquirer(false), 1000);
    }
  }

  async function handleMerchantFault() {
    setTriggeringMerchant(true);
    try {
      await triggerMerchantFault();
    } catch (err) {
      console.error('Failed to trigger merchant fault', err);
    } finally {
      setTimeout(() => setTriggeringMerchant(false), 1000);
    }
  }

  // Merge liveSteps with incident's stored reasoningChain for display
  const displaySteps = (activeIncident?.status === 'open' || agentRunning)
    ? liveSteps
    : (activeIncident?.reasoningChain || []);

  return (
    <div className="admin-main" style={{ padding: '24px 32px' }}>
      <div className="page-header" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Agent AI İzleme & Chat</h1>
          <p>Otonom sistem kararları ve AI asistan</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={handleAcquirerFault} disabled={triggeringAcquirer || agentRunning} style={{ backgroundColor: (triggeringAcquirer || agentRunning) ? '#9ca3af' : '#ef4444', color: 'white', border: 'none', padding: '10px 16px', borderRadius: '4px', cursor: (triggeringAcquirer || agentRunning) ? 'not-allowed' : 'pointer', fontWeight: 'bold', transition: 'background-color 0.2s' }}>
            {triggeringAcquirer ? '⏳ Başlatılıyor...' : agentRunning ? '🔄 Agent Çalışıyor...' : '🔴 Acquirer Arızası Başlat'}
          </button>
          <button onClick={handleMerchantFault} disabled={triggeringMerchant || agentRunning} style={{ backgroundColor: (triggeringMerchant || agentRunning) ? '#9ca3af' : '#eab308', color: 'white', border: 'none', padding: '10px 16px', borderRadius: '4px', cursor: (triggeringMerchant || agentRunning) ? 'not-allowed' : 'pointer', fontWeight: 'bold', transition: 'background-color 0.2s' }}>
            {triggeringMerchant ? '⏳ Başlatılıyor...' : '🟡 Üye İşyeri Sorunu Başlat'}
          </button>
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
                <div className={`badge ${inc.status}`}>{STATUS_NAMES[inc.status] || inc.status}</div>
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
                  <button className="btn btn-ghost" style={{ padding: '8px 12px', fontSize: '0.85rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer' }} onClick={handleBackToChat}>
                    ← Chat'e Dön
                  </button>
                  <h2 style={{ fontSize: '1.2rem' }}>{activeIncident.title}</h2>
                  <div style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: 4 }}>
                    Acquirer: {ACQUIRER_NAMES[activeIncident.acquirer_id]} • {new Date(activeIncident.created_at).toLocaleString('tr-TR')}
                    {agentRunning && <span style={{ marginLeft: 12, color: '#f59e0b', fontWeight: 'bold' }}>● Canlı Analiz</span>}
                  </div>
                </div>
                {activeIncident.status === 'resolved' && (
                  <button className="btn btn-primary" onClick={handleAck}>Kapat / Onayla</button>
                )}
              </div>

              <div className="reasoning-scroll" ref={reasoningRef}>
                <div className="section-title">Kök Neden & Öneriler</div>
                <div style={{ fontSize: '0.85rem', lineHeight: 1.5, marginBottom: 10 }}>
                  <strong>Kök Neden:</strong> {activeIncident.root_cause}
                </div>
                {activeIncident.recommendations?.length > 0 && (
                  <ul style={{ fontSize: '0.85rem', paddingLeft: 20, color: 'var(--muted)', marginBottom: 20 }}>
                    {activeIncident.recommendations.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                )}

                <div className="section-title">
                  Agent Düşünce Süreci (Reasoning Chain)
                  {agentRunning && (
                    <span style={{ marginLeft: 8, fontSize: '0.75rem', color: '#f59e0b' }}>
                      ● düşünüyor...
                    </span>
                  )}
                </div>

                {displaySteps.length === 0 && agentRunning && (
                  <div style={{ padding: '16px', color: 'var(--muted)', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                    Agent başlatılıyor, veriler toplanıyor...
                  </div>
                )}

                {displaySteps.map((step, i) => (
                  <div key={i} className={`reasoning-step ${step.type}`} style={{ animation: 'fadeIn 0.3s ease' }}>
                    <div className="step-type">
                      {step.type === 'tool_call'   ? (TOOL_LABELS[step.tool] || `🛠️ ${step.tool}`) :
                       step.type === 'tool_result' ? `✅ Sonuç: ${step.tool}` :
                       '🧠 Sonuç / Karar'}
                    </div>
                    {step.type === 'tool_call' && step.args && Object.keys(step.args).length > 0 && (
                      <pre style={{ fontSize: '0.75rem', margin: '4px 0 0', opacity: 0.8 }}>{JSON.stringify(step.args, null, 2)}</pre>
                    )}
                    {step.type === 'tool_result' && (
                      <pre style={{ fontSize: '0.75rem', margin: '4px 0 0', opacity: 0.8, maxHeight: 120, overflow: 'auto' }}>{JSON.stringify(step.result, null, 2)}</pre>
                    )}
                    {step.type === 'conclusion' && <div style={{ marginTop: 6, lineHeight: 1.6 }}>{step.text}</div>}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="chat-layout">
              <div className="chat-messages" ref={chatRef}>
                <div className="chat-bubble agent">
                  Merhaba, ben OFA (Otonom Finans Asistanı). Sistem sağlığını arka planda sürekli izliyorum. Bir anomali algılarsam müdahale ederim. Bana sistemin durumu, belirli bir sağlayıcının sağlığı veya genel metrikler hakkında sorular sorabilirsiniz. Ayrıca "Şu bankayı kapat" gibi komutlar da verebilirsiniz.
                </div>
                {chat.map((msg, i) => (
                  <div key={i} className={`chat-bubble ${msg.role}`} style={{ whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>
                    {msg.text.split(/(\*\*.*?\*\*)/g).map((part, idx) => {
                      if (part.startsWith('**') && part.endsWith('**')) {
                        return <strong key={idx}>{part.slice(2, -2)}</strong>;
                      }
                      return part;
                    })}
                  </div>
                ))}
                {loading && <div className="chat-bubble agent thinking">Düşünüyor...</div>}
              </div>
              <div className="chat-input-container" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div className="quick-actions" style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                  <button onClick={() => handleQuickAsk('Şu anki sistem metrikleri nasıl?')} className="quick-btn" disabled={loading} style={{ whiteSpace: 'nowrap', fontSize: '0.75rem', padding: '6px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '16px', color: 'var(--text)', cursor: 'pointer' }}>
                    📊 Metrikleri İncele
                  </button>
                  <button onClick={() => handleQuickAsk('Açık olan veya incelenen vakalar var mı?')} className="quick-btn" disabled={loading} style={{ whiteSpace: 'nowrap', fontSize: '0.75rem', padding: '6px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '16px', color: 'var(--text)', cursor: 'pointer' }}>
                    🚨 Vakaları Raporla
                  </button>
                  <button onClick={() => handleQuickAsk('Sorunlu olan bankaları kapat')} className="quick-btn" disabled={loading} style={{ whiteSpace: 'nowrap', fontSize: '0.75rem', padding: '6px 12px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '16px', color: 'var(--red)', cursor: 'pointer' }}>
                    ⛔ Sorunluları Kapat
                  </button>
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
