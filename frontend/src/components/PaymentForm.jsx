import React, { useState, useEffect } from 'react';
import CardPreview from './CardPreview';
import { processPayment } from '../services/api';
import api from '../services/api';

function luhnChecksum(num) {
  let sum = 0, alt = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let n = parseInt(num[i], 10);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return sum % 10;
}

function generateCardNumber(type) {
  const prefixes = { visa: '4532', mastercard: '5425', troy: '9792' };
  const prefix = prefixes[type] || '4532';
  let partial = prefix;
  while (partial.length < 15) partial += Math.floor(Math.random() * 10);
  const check = (10 - luhnChecksum(partial + '0')) % 10;
  return partial + check;
}

function generateExpiry() {
  const now = new Date();
  const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
  const year = String(now.getFullYear() + 2 + Math.floor(Math.random() * 3)).slice(-2);
  return `${month}/${year}`;
}

function generateCVV() { return String(Math.floor(100 + Math.random() * 900)); }

const DEMO_SCENARIOS = [
  { label: 'Başarılı İşlem Senaryosu', cardPrefix: '4111', type: 'visa', dot: '#10b981' },
  { label: 'Riskli İşlem (Yüksek Ret İhtimali)', cardPrefix: '5222', type: 'mastercard', dot: '#a1a1aa' },
  { label: 'Yetersiz Bakiye Simülasyonu', cardPrefix: '9792', type: 'troy', dot: '#ef4444' },
  { label: 'Zaman Aşımı ve Retry', cardPrefix: '4000', type: 'visa', dot: '#f59e0b' },
  { label: 'Anomali ve Agent Devreye Girme', cardPrefix: '5333', type: 'mastercard', dot: '#3b82f6' },
];

const AMOUNT_PRESETS = [50, 100, 250, 500];
const CARD_TYPES = ['visa', 'mastercard', 'troy'];

// Fallback list in case API is unavailable
const FALLBACK_ACQUIRERS = [
  { id: 'acquirer_garanti',   name: 'Garanti Sanal POS' },
  { id: 'acquirer_yapikredi', name: 'Yapı Kredi Sanal POS' },
  { id: 'acquirer_isbank',    name: 'İş Bankası Sanal POS' },
  { id: 'acquirer_akbank',    name: 'Akbank Sanal POS' },
  { id: 'acquirer_qnb',       name: 'QNB Finansbank Sanal POS' },
  { id: 'acquirer_denizbank', name: 'DenizBank Sanal POS' },
];

export default function PaymentForm({ onResult }) {
  const [cardType, setCardType] = useState('visa');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [amount, setAmount] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [acquirers, setAcquirers] = useState(FALLBACK_ACQUIRERS);
  const [selectedAcquirerId, setSelectedAcquirerId] = useState('acquirer_garanti');

  const activeAmount = amount || customAmount;

  // Load acquirers from API for real-time success rates
  useEffect(() => {
    api.get('/api/metrics/acquirers')
      .then(({ data }) => {
        if (Array.isArray(data) && data.length > 0) {
          setAcquirers(data);
        }
      })
      .catch(() => { /* use fallback */ });
  }, []);

  function handleTypeSelect(t) {
    setCardType(t); setCardNumber(''); setExpiry(''); setCvv('');
  }

  function handleGenerate() {
    setGenerating(true);
    setTimeout(() => {
      setCardNumber(generateCardNumber(cardType));
      setExpiry(generateExpiry());
      setCvv(generateCVV());
      setGenerating(false);
    }, 300);
  }

  function handleDemoScenario(scenario) {
    setCardType(scenario.type);
    const rest = '0000000000'.slice(0, 12 - scenario.cardPrefix.length);
    setCardNumber(scenario.cardPrefix + rest);
    setExpiry('12/28'); setCvv('123'); setAmount('100'); setCustomAmount('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const finalAmount = parseFloat(activeAmount);
    if (!cardNumber || !expiry || !cvv || !finalAmount) {
      setError('Lütfen tüm alanları doldurun.'); return;
    }
    setError(''); setLoading(true);
    try {
      const result = await processPayment({ cardNumber, cardType, amount: finalAmount, currency: 'TRY' });
      onResult(result);
    } catch (err) {
      setError(err?.response?.data?.error || 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.');
    } finally { setLoading(false); }
  }

  async function handleInstantAgentTest() {
    setLoading(true);
    setError('Agent test başlatılıyor... (Arka arkaya hatalı işlemler gönderiliyor)');
    try {
      for (let i = 0; i < 8; i++) {
        try {
          await processPayment({ cardNumber: '5333000000000000', cardType: 'mastercard', amount: 100, currency: 'TRY' });
        } catch (e) {
          // ignore rejection, we want rejections
        }
      }
      setError('Test işlemleri gönderildi! Birkaç saniye içinde Agent (OFA) devreye girecektir.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="fade-in">
      {/* Card preview now shows acquirer-specific colors */}
      <CardPreview
        cardType={cardType}
        cardNumber={cardNumber}
        expiry={expiry}
        generating={generating}
        acquirerId={selectedAcquirerId}
      />

      <div className="form-section">
        <label>Kart Tipi</label>
        <div className="select-grid">
          {CARD_TYPES.map((t) => (
            <button key={t} type="button"
              className={`type-btn ${cardType === t ? 'active' : ''}`}
              onClick={() => handleTypeSelect(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Acquirer selector — each acquirer changes the card color */}
      <div className="form-section">
        <label>Ödeme Altyapısı</label>
        <div className="acquirer-grid">
          {acquirers.map((acq) => (
            <button
              key={acq.id}
              type="button"
              className={`acquirer-btn ${acq.id} ${selectedAcquirerId === acq.id ? 'active' : ''}`}
              onClick={() => setSelectedAcquirerId(acq.id)}
            >
              <span className="acquirer-dot" />
              <span className="acquirer-name">{acq.name}</span>
              {acq.currentSuccessRate != null && (
                <span className="acquirer-rate">%{(acq.currentSuccessRate * 100).toFixed(0)}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <button type="button" className="gen-btn" onClick={handleGenerate} disabled={generating}>
        {generating ? 'Kart Üretiliyor...' : 'Rastgele Kart Üret'}
      </button>

      <div className="form-section">
        <label>Tutar (₺)</label>
        <div className="amount-grid">
          {AMOUNT_PRESETS.map((a) => (
            <button key={a} type="button"
              className={`amount-btn ${amount === String(a) ? 'active' : ''}`}
              onClick={() => { setAmount(String(a)); setCustomAmount(''); }}
            >
              ₺{a}
            </button>
          ))}
        </div>
        <input className="input" type="number" placeholder="Özel tutar girin"
          min="1" value={customAmount}
          onChange={(e) => { setCustomAmount(e.target.value); setAmount(''); }}
        />
      </div>

      <div className="demo-section-title">Test Senaryoları</div>
      <div className="demo-grid">
        {DEMO_SCENARIOS.map((s) => (
          <button key={s.label} type="button" className="demo-btn"
            onClick={() => handleDemoScenario(s)}
          >
            <span style={{
              display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
              background: s.dot, marginRight: 12, flexShrink: 0
            }} />
            {s.label}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 12 }}>
        <button type="button" className="demo-btn" style={{ width: '100%', justifyContent: 'center' }} onClick={handleInstantAgentTest} disabled={loading}>
          Tek Hamlede OFA Testi Başlat
        </button>
      </div>

      {error && (
        <p style={{ color: error.includes('başlatılıyor') || error.includes('gönderildi') ? 'var(--blue)' : 'var(--red)', fontSize: '0.85rem', marginTop: 24, textAlign: 'center' }}>
          {error}
        </p>
      )}

      <button type="submit" className="pay-btn"
        disabled={loading || !cardNumber || !activeAmount}
        id="pay-button"
      >
        {loading ? 'İşleniyor...' : `Ödemeyi Tamamla${activeAmount ? ` ₺${parseFloat(activeAmount).toLocaleString('tr-TR')}` : ''}`}
      </button>
    </form>
  );
}
