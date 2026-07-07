import React, { useState } from 'react';
import CardPreview from './CardPreview';
import { processPayment } from '../services/api';

// ── Luhn algorithm for card number generation ────────────────────────────────
function luhnChecksum(num) {
  let sum = 0;
  let alt = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let n = parseInt(num[i], 10);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    alt = !alt;
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

function generateCVV() {
  return String(Math.floor(100 + Math.random() * 900));
}

// ── Demo scenario special card numbers ───────────────────────────────────────
const DEMO_SCENARIOS = [
  { label: '🟢 Her Zaman Başarılı',   cardPrefix: '4111', type: 'visa',       desc: 'Başarılı işlem' },
  { label: '🟡 Riskli İşlem',          cardPrefix: '5222', type: 'mastercard', desc: '%70 başarı' },
  { label: '🔴 Bakiye Yetersiz',       cardPrefix: '9792', type: 'troy',       desc: 'E001 hatası' },
  { label: '⏱️ Timeout → Retry',       cardPrefix: '4000', type: 'visa',       desc: 'Retry tetikler' },
  { label: '🤖 Anomali Tetikle',       cardPrefix: '5333', type: 'mastercard', desc: 'Agent devreye girer' },
];

const AMOUNT_PRESETS = [50, 100, 250, 500];
const CARD_TYPES = ['visa', 'mastercard', 'troy'];

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

  const activeAmount = amount || customAmount;

  function handleTypeSelect(t) {
    setCardType(t);
    setCardNumber('');
    setExpiry('');
    setCvv('');
  }

  function handleGenerate() {
    setGenerating(true);
    setTimeout(() => {
      setCardNumber(generateCardNumber(cardType));
      setExpiry(generateExpiry());
      setCvv(generateCVV());
      setGenerating(false);
    }, 400);
  }

  function handleDemoScenario(scenario) {
    setCardType(scenario.type);
    // Fill the rest of card number after prefix (not Luhn valid but that's fine for demo)
    const rest = '0000000000'.slice(0, 12 - scenario.cardPrefix.length);
    setCardNumber(scenario.cardPrefix + rest);
    setExpiry('12/28');
    setCvv('123');
    setAmount('100');
    setCustomAmount('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const finalAmount = parseFloat(activeAmount);
    if (!cardNumber || !expiry || !cvv || !finalAmount) {
      setError('Lütfen tüm alanları doldurun.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const result = await processPayment({
        cardNumber,
        cardType,
        amount: finalAmount,
        currency: 'TRY',
      });
      onResult(result);
    } catch (err) {
      setError(err?.response?.data?.error || 'Sunucu hatası. Tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* ── Card Preview ─────────────────────────────────────────────────── */}
      <CardPreview
        cardType={cardType}
        cardNumber={cardNumber}
        expiry={expiry}
        generating={generating}
      />

      {/* ── Card Type ─────────────────────────────────────────────────────── */}
      <div className="form-section">
        <label>Kart Tipi</label>
        <div className="select-grid">
          {CARD_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className={`type-btn ${cardType === t ? 'active' : ''}`}
              onClick={() => handleTypeSelect(t)}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Generate button ───────────────────────────────────────────────── */}
      <button type="button" className="gen-btn" onClick={handleGenerate} disabled={generating}>
        {generating ? <span className="spinner" /> : '⟳'}
        {generating ? 'Üretiliyor…' : 'Rastgele Kart Üret'}
      </button>

      {/* ── Amount ────────────────────────────────────────────────────────── */}
      <div className="form-section">
        <label>Tutar (₺)</label>
        <div className="amount-grid">
          {AMOUNT_PRESETS.map((a) => (
            <button
              key={a}
              type="button"
              className={`amount-btn ${amount === String(a) ? 'active' : ''}`}
              onClick={() => { setAmount(String(a)); setCustomAmount(''); }}
            >
              ₺{a}
            </button>
          ))}
        </div>
        <input
          className="input"
          type="number"
          placeholder="Özel tutar girin…"
          min="1"
          value={customAmount}
          onChange={(e) => { setCustomAmount(e.target.value); setAmount(''); }}
        />
      </div>

      {/* ── Demo scenarios ────────────────────────────────────────────────── */}
      <div className="divider">Demo Senaryoları</div>
      <div className="demo-grid">
        {DEMO_SCENARIOS.map((s) => (
          <button
            key={s.label}
            type="button"
            className="demo-btn"
            onClick={() => handleDemoScenario(s)}
            title={s.desc}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <p style={{ color: 'var(--red)', fontSize: '0.83rem', marginTop: 16, textAlign: 'center' }}>
          {error}
        </p>
      )}

      {/* ── Pay ───────────────────────────────────────────────────────────── */}
      <button
        type="submit"
        className="pay-btn"
        disabled={loading || !cardNumber || !activeAmount}
        style={{ marginTop: 20 }}
        id="pay-button"
      >
        {loading ? (
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <span className="spinner" /> İşleniyor…
          </span>
        ) : (
          `Ödeme Yap${activeAmount ? ` — ₺${parseFloat(activeAmount).toLocaleString('tr-TR')}` : ''}`
        )}
      </button>
    </form>
  );
}
