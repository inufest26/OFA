import React, { useState } from 'react';
import PaymentForm from './components/PaymentForm';
import PaymentResult from './components/PaymentResult';

export default function App() {
  const [result, setResult] = useState(null);

  return (
    <div className="app">
      <div className="logo-bar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
          <line x1="1" y1="10" x2="23" y2="10"/>
        </svg>
        <h1><span>Otonom Finans Asistanı</span> (OFA)</h1>
      </div>

      <div className={`card ${result ? 'fade-in' : ''}`}>
        {result ? (
          <PaymentResult result={result} onBack={() => setResult(null)} />
        ) : (
          <PaymentForm onResult={setResult} />
        )}
      </div>

      <p style={{ marginTop: 20, fontSize: '0.75rem', color: 'var(--text-dim)', textAlign: 'center' }}>
        Moka United AI Ideathon & Hackathon • Demo Sistemi
      </p>
    </div>
  );
}
