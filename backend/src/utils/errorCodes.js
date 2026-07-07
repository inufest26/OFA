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
    description: 'Insufficient funds',
    userMessage: 'Your card has insufficient funds for this transaction.',
  },
  CARD_EXPIRED: {
    code: 'E002',
    retryable: false,
    description: 'Card expired',
    userMessage: 'Your card has expired. Please use a different card.',
  },
  CARD_BLOCKED: {
    code: 'E003',
    retryable: false,
    description: 'Card blocked',
    userMessage: 'Your card has been blocked. Please contact your bank.',
  },
  INVALID_CARD: {
    code: 'E004',
    retryable: false,
    description: 'Invalid card',
    userMessage: 'The card information provided is invalid.',
  },
  FRAUD_SUSPECTED: {
    code: 'E005',
    retryable: false,
    description: 'Fraud suspected',
    userMessage: 'This transaction has been flagged. Please contact your bank.',
  },

  // ── Transient failures ──────────────────────────────────────────────────────
  ACQUIRER_TIMEOUT: {
    code: 'E101',
    retryable: true,
    strategy: 'different_acquirer',
    description: 'Acquirer timeout',
    userMessage: 'The payment gateway timed out. Retrying with another provider.',
  },
  ACQUIRER_ERROR: {
    code: 'E102',
    retryable: true,
    strategy: 'different_acquirer',
    description: 'Acquirer system error',
    userMessage: 'The payment provider experienced an error. Retrying.',
  },
  NETWORK_ERROR: {
    code: 'E103',
    retryable: true,
    strategy: 'same_acquirer_delayed',
    description: 'Network error',
    userMessage: 'A network issue occurred. Retrying momentarily.',
  },
  RATE_LIMIT: {
    code: 'E104',
    retryable: true,
    strategy: 'different_acquirer',
    description: 'Rate limit exceeded',
    userMessage: 'Too many requests to this provider. Retrying with another.',
  },
  TEMPORARY_UNAVAILABLE: {
    code: 'E105',
    retryable: true,
    strategy: 'different_acquirer',
    description: 'Temporary service unavailability',
    userMessage: 'The payment provider is temporarily unavailable. Retrying.',
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
      description: 'Unknown error',
      userMessage: 'An unknown error occurred.',
    }
  );
}

module.exports = { ERROR_CODES, getError };
