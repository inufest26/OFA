import React from 'react';

const BRANDS = {
  visa:       { label: 'VISA',       symbol: '✦' },
  mastercard: { label: 'MASTERCARD', symbol: '◎' },
  troy:       { label: 'TROY',       symbol: '⬡' },
};

// Acquirer-specific gradient palettes (takes priority over card type)
const ACQUIRER_THEMES = {
  acquirer_garanti:   'garanti',
  acquirer_yapikredi: 'yapikredi',
  acquirer_isbank:    'isbank',
  acquirer_akbank:    'akbank',
  acquirer_qnb:       'qnb',
  acquirer_denizbank: 'denizbank',
};

function formatCardNumber(num) {
  const clean = (num || '').replace(/\D/g, '').padEnd(16, '•');
  return [clean.slice(0,4), clean.slice(4,8), clean.slice(8,12), clean.slice(12,16)].join(' ');
}

export default function CardPreview({ cardType = 'visa', cardNumber = '', expiry = '', generating, acquirerId }) {
  const brand = BRANDS[cardType] || BRANDS.visa;
  const acquirerTheme = ACQUIRER_THEMES[acquirerId];
  
  // Use acquirer class if available, otherwise fall back to card type
  const themeClass = acquirerTheme || cardType;

  return (
    <div className="cc-wrap">
      <div className={`cc ${themeClass} ${generating ? 'shimmer' : ''}`}>
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
