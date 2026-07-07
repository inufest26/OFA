import React from 'react';

const BRANDS = {
  visa:       { label: 'VISA', symbol: '✦' },
  mastercard: { label: 'MASTERCARD', symbol: '◎' },
  troy:       { label: 'TROY', symbol: '⬡' },
};

function formatCardNumber(num) {
  const clean = (num || '').replace(/\D/g, '').padEnd(16, '•');
  return [clean.slice(0,4), clean.slice(4,8), clean.slice(8,12), clean.slice(12,16)].join(' ');
}

export default function CardPreview({ cardType = 'visa', cardNumber = '', expiry = '', generating }) {
  const brand = BRANDS[cardType] || BRANDS.visa;

  return (
    <div className="cc-wrap">
      <div className={`cc ${cardType} ${generating ? 'shimmer' : ''}`}>
        <div className="cc-chip" />
        <div className="cc-number">{formatCardNumber(cardNumber)}</div>
        <div className="cc-bottom">
          <div>
            <div className="cc-label">Son Kullanma</div>
            <div className="cc-value">{expiry || 'MM/YY'}</div>
          </div>
          <div className="cc-brand">{brand.label}</div>
        </div>
      </div>
    </div>
  );
}
