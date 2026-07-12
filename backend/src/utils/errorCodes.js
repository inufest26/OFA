/**
 * Error code registry.
 *
 * retryable: false → permanent failure, stop immediately
 * retryable: true  → transient failure, apply retry strategy
 *
 * strategy:
 *   'different_acquirer'    → route to next-best acquirer (max 2 retries)
 *   'same_acquirer_delayed' → retry same acquirer after 500 ms (max 1 retry)
 */
const ERROR_CODES = {
  // ── Permanent failures ──────────────────────────────────────────────────────
  INSUFFICIENT_FUNDS: {
    code: 'E001',
    retryable: false,
    description: 'Yetersiz bakiye',
    userMessage: 'Kartınızda bu işlem için yeterli bakiye bulunmuyor.',
  },
  CARD_EXPIRED: {
    code: 'E002',
    retryable: false,
    description: 'Süresi dolmuş kart',
    userMessage: 'Kartınızın süresi dolmuş. Lütfen başka bir kart kullanın.',
  },
  CARD_BLOCKED: {
    code: 'E003',
    retryable: false,
    description: 'Bloke kart',
    userMessage: 'Kartınız bloke edilmiştir. Lütfen bankanızla iletişime geçin.',
  },
  INVALID_CARD: {
    code: 'E004',
    retryable: false,
    description: 'Geçersiz kart',
    userMessage: 'Girdiğiniz kart bilgileri geçersizdir.',
  },
  FRAUD_SUSPECTED: {
    code: 'E005',
    retryable: false,
    description: 'Şüpheli işlem',
    userMessage: 'Bu işlem şüpheli bulunmuştur. Lütfen bankanızla iletişime geçin.',
  },

  // ── Transient failures ──────────────────────────────────────────────────────
  ACQUIRER_TIMEOUT: {
    code: 'E101',
    retryable: true,
    strategy: 'different_acquirer',
    description: 'Zaman aşımı',
    userMessage: 'Ödeme altyapısı zaman aşımına uğradı. Başka bir sağlayıcı ile tekrar deneniyor.',
  },
  ACQUIRER_ERROR: {
    code: 'E102',
    retryable: true,
    strategy: 'different_acquirer',
    description: 'Sistem hatası',
    userMessage: 'Ödeme sağlayıcısında bir hata oluştu. Tekrar deneniyor.',
  },
  NETWORK_ERROR: {
    code: 'E103',
    retryable: true,
    strategy: 'same_acquirer_delayed',
    description: 'Ağ hatası',
    userMessage: 'Ağ bağlantısında bir sorun oluştu. Kısa süre içinde tekrar denenecek.',
  },
  RATE_LIMIT: {
    code: 'E104',
    retryable: true,
    strategy: 'different_acquirer',
    description: 'Limit aşıldı',
    userMessage: 'Bu sağlayıcıya çok fazla istek gönderildi. Başka bir sağlayıcı ile tekrar deneniyor.',
  },
  TEMPORARY_UNAVAILABLE: {
    code: 'E105',
    retryable: true,
    strategy: 'different_acquirer',
    description: 'Geçici kesinti',
    userMessage: 'Ödeme sağlayıcısı geçici olarak hizmet veremiyor. Tekrar deneniyor.',
  },
};

/**
 * Look up an error definition by its short code string (e.g. 'ACQUIRER_TIMEOUT').
 * Falls back to a generic unknown error.
 */
function getError(key) {
  return (
    ERROR_CODES[key] || {
      code: 'E999',
      retryable: false,
      description: 'Bilinmeyen hata',
      userMessage: 'Bilinmeyen bir hata oluştu.',
    }
  );
}

module.exports = { ERROR_CODES, getError };
