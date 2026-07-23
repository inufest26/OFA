import React, { useEffect, useState, useRef } from 'react';
import { getIncidents, getIncident, askAgent, acknowledgeIncident, triggerAcquirerFault, triggerMerchantFault } from '../services/api';
import { getSocket } from '../services/socket';

const ACQUIRER_NAMES = {
  acquirer_garanti:   'Garanti',
  acquirer_yapikredi: 'Yapı Kredi',
  acquirer_isbank:    'İş Bankası',
  acquirer_akbank:    'Akbank',
  acquirer_qnb:       'QNB Finansbank',
  acquirer_denizbank: 'DenizBank',
};

const STATUS_ICONS = {
  open: '🔴',
  resolved: '✅',
  escalated: '⚠️'
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
  escalate_to_admin:         '🚨 Admin\'e escalate ediliyor...',
};

// Simülasyon: OFA'nın geçmişte çözdüğü örnek vakalar
const SAMPLE_RESOLVED = [
  {
    id: 'sim-001',
    time: '09:14',
    severity: 'critical',
    acquirer: 'Yapı Kredi Sanal POS',
    title: 'Yapı Kredi — ACQUIRER_TIMEOUT oranı kritik eşiği aştı',
    rootCause: 'Yapı Kredi POS altyapısında ağ katmanı kaynaklı geçici bir kesinti. 5 dakikada 312 TIMEOUT hatası tetiklendi.',
    steps: [
      { icon: '🚨', text: 'Hata oranı %78\'e ulaştı — anomali eşiği aşıldı' },
      { icon: '📊', text: 'Son 300 transaction\'ın %74\'ü ACQUIRER_TIMEOUT ile sonuçlandı' },
      { icon: '⚙️', text: 'Routing ağırlığı güncellendi: YapıKredi %5 → Garanti %60' },
      { icon: '⛔', text: 'Yapı Kredi altyapısı izole moduna alındı' },
      { icon: '✅', text: 'Başarı oranı %78 → %96\'ya yükseldi, 847 işlem kurtarıldı' },
    ],
    saving: '₺124.800 işlem hacmi korundu',
    duration: '2dk 14sn',
  },
  {
    id: 'sim-002',
    time: '11:52',
    severity: 'high',
    acquirer: 'Akbank Sanal POS',
    title: 'Akbank — Yüksek gecikme + INSUFFICIENT_FUNDS anomalisi',
    rootCause: 'Akbank sisteminde anlık yük artışı. Ortalama yanıt süresi 3.200ms\'e çıktı; bazı işlemler hatalı INSUFFICIENT_FUNDS kodu döndürdü.',
    steps: [
      { icon: '📈', text: 'Avg response time 3.200ms — normal seviyenin 8x\'i' },
      { icon: '🧠', text: 'ML skoru: Akbank 0.12 → İş Bankası 0.81 (en iyi rota)' },
      { icon: '⚙️', text: 'Anlık trafik İş Bankası\'na kaydırıldı (%70 ağırlık)' },
      { icon: '📋', text: 'Incident raporu oluşturuldu, Akbank ekibine bildirim gönderildi' },
      { icon: '✅', text: 'Akbank 8 dakika sonra normale döndü, ağırlıklar dengelendi' },
    ],
    saving: '₺67.200 işlem hacmi korundu',
    duration: '8dk 03sn',
  },
  {
    id: 'sim-003',
    time: '14:37',
    severity: 'medium',
    acquirer: 'QNB Finansbank Sanal POS',
    title: 'QNB — Gece bakımı sonrası sertifika hatası',
    rootCause: 'QNB POS sisteminde planlı bakım sonrası TLS sertifika yenilenmedi. İşlemler SSL handshake hatası ile reddedildi.',
    steps: [
      { icon: '🔍', text: 'SSL hatası tespit edildi — 43 işlem art arda reddedildi' },
      { icon: '📊', text: 'Hata kodu analizi: %100 ACQUIRER_ERROR (SSL bağlantı katmanı)' },
      { icon: '⚙️', text: 'QNB\'nin routing payı %3\'e düşürüldü (sadece TROY kartlar)' },
      { icon: '🚨', text: 'QNB teknik ekibine otomatik uyarı gönderildi' },
      { icon: '✅', text: 'QNB 22 dakika içinde sertifikayı yeniledi, sistem normale döndü' },
    ],
    saving: '₺18.400 işlem hacmi korundu',
    duration: '22dk 41sn',
  },
];


export default function Agent() {
  const [incidents, setIncidents] = useState([]);
  const [activeIncident, setActiveIncident] = useState(null);
  const [liveSteps, setLiveSteps] = useState([]); // streaming steps
  const [agentRunning, setAgentRunning] = useState(false);
  const [chat, setChat] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedSample, setSelectedSample] = useState(null);
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
                <div className="incident-item-title">{inc.title.replace(inc.acquirer_id, ACQUIRER_NAMES[inc.acquirer_id] || inc.acquirer_id)}</div>
                <div style={{ fontSize: '1.2rem', lineHeight: 1 }}>{STATUS_ICONS[inc.status] || '❓'}</div>
              </div>
              <div className="incident-item-meta">
                {ACQUIRER_NAMES[inc.acquirer_id] || inc.acquirer_id} • {new Date(inc.created_at).toLocaleTimeString('tr-TR')}
              </div>
            </div>
          ))}
          {incidents.length === 0 && <div className="empty-state" style={{ marginBottom: 8 }}>Henüz gerçek zamanlı olay yok</div>}

          {/* Simülasyon vakaları */}
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>OFA Geçmiş Çözümler (Demo)</div>
            {SAMPLE_RESOLVED.map((s) => (
              <div
                key={s.id}
                className={`incident-item ${selectedSample?.id === s.id ? 'active' : ''}`}
                onClick={() => { setSelectedSample(s); setActiveIncident(null); }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div className="incident-item-title" style={{ fontSize: '0.8rem' }}>{s.title}</div>
                  <div style={{ fontSize: '1rem', lineHeight: 1 }}>✅</div>
                </div>
                <div className="incident-item-meta">
                  {s.acquirer} • Bugün {s.time} • {s.duration}
                </div>
              </div>
            ))}
          </div>
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
                  <h2 style={{ fontSize: '1.2rem' }}>{activeIncident.title.replace(activeIncident.acquirer_id, ACQUIRER_NAMES[activeIncident.acquirer_id] || activeIncident.acquirer_id)}</h2>
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
          ) : selectedSample ? (
            /* Sample incident detail */
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
                <button className="btn btn-ghost" style={{ padding: '8px 12px', fontSize: '0.85rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer' }} onClick={() => setSelectedSample(null)}>
                  ← Listeye Dön
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{
                    fontSize: '0.7rem', fontWeight: 700, padding: '3px 8px', borderRadius: 4,
                    background: selectedSample.severity === 'critical' ? 'rgba(239,68,68,0.15)' : selectedSample.severity === 'high' ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.15)',
                    color: selectedSample.severity === 'critical' ? '#ef4444' : selectedSample.severity === 'high' ? '#f59e0b' : '#3b82f6',
                    textTransform: 'uppercase',
                  }}>{selectedSample.severity}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>OFA tarafından otonom olarak çözüldü • Bugün {selectedSample.time}</span>
                </div>
                <h2 style={{ fontSize: '1.1rem' }}>{selectedSample.title}</h2>
              </div>
              <div className="reasoning-scroll">
                <div className="section-title">Kök Neden</div>
                <div style={{ fontSize: '0.85rem', lineHeight: 1.6, marginBottom: 20, color: 'var(--muted)' }}>{selectedSample.rootCause}</div>

                <div className="section-title">OFA Aksiyon Adımları</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                  {selectedSample.steps.map((step, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 12px', background: 'var(--surface2)', borderRadius: 6, borderLeft: `3px solid ${i === selectedSample.steps.length - 1 ? '#10b981' : 'var(--border2)'}` }}>
                      <span style={{ fontSize: '1rem', flexShrink: 0 }}>{step.icon}</span>
                      <span style={{ fontSize: '0.83rem', color: 'var(--text)', lineHeight: 1.5 }}>{step.text}</span>
                    </div>
                  ))}
                </div>

                <div style={{ padding: '14px 16px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: 8 }}>
                  <div style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: 700, marginBottom: 4 }}>✅ Sonuç</div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.6 }}>
                    Müdahale süresi: <strong style={{ color: 'var(--text)' }}>{selectedSample.duration}</strong> &nbsp;•&nbsp; {selectedSample.saving}
                  </div>
                </div>
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
