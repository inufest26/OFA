/**
 * Retry Engine
 *
 * Applies retry strategies based on error codes.
 * - 'different_acquirer': route to next-best acquirer from ML scores
 * - 'same_acquirer_delayed': retry same acquirer after 500 ms
 */

const { processPayment, getRankedAcquirers } = require('./acquirerSimulator');
const { getError } = require('../utils/errorCodes');
const logger = require('../utils/logger');

const MAX_RETRIES_DIFFERENT = 2;
const MAX_RETRIES_SAME = 1;
const SAME_DELAY_MS = 500;

/**
 * Execute payment with automatic retry logic.
 *
 * @param {object} transaction
 * @param {string} initialAcquirerId   - First acquirer chosen by ML router
 * @param {object} mlScores            - { [acquirerId]: number } from ML router
 * @returns {{ success, acquirerId, errorKey, responseTimeMs, retryCount, retryHistory }}
 */
async function executeWithRetry(transaction, initialAcquirerId, mlScores) {
  const retryHistory = [];
  let currentAcquirerId = initialAcquirerId;
  let usedAcquirers = new Set([initialAcquirerId]);

  // First attempt
  let result = await processPayment(currentAcquirerId, transaction);
  retryHistory.push({
    attempt: 1,
    acquirerId: currentAcquirerId,
    success: result.success,
    errorKey: result.errorKey,
    responseTimeMs: result.responseTimeMs,
    timestamp: new Date().toISOString(),
  });

  if (result.success) {
    return _buildResult(result, currentAcquirerId, 0, retryHistory);
  }

  const errorDef = getError(result.errorKey);

  if (!errorDef.retryable) {
    logger.info('Non-retryable error, stopping', { errorKey: result.errorKey });
    return _buildResult(result, currentAcquirerId, 0, retryHistory);
  }

  // Retry loop
  const strategy = errorDef.strategy;
  const maxRetries =
    strategy === 'different_acquirer' ? MAX_RETRIES_DIFFERENT : MAX_RETRIES_SAME;

  for (let attempt = 2; attempt <= maxRetries + 1; attempt++) {
    let nextAcquirerId;

    if (strategy === 'different_acquirer') {
      nextAcquirerId = _pickNextAcquirer(mlScores, usedAcquirers);
      if (!nextAcquirerId) {
        logger.warn('No more acquirers available for retry');
        break;
      }
      usedAcquirers.add(nextAcquirerId);
      currentAcquirerId = nextAcquirerId;
    } else {
      // same_acquirer_delayed
      await new Promise((r) => setTimeout(r, SAME_DELAY_MS));
      nextAcquirerId = currentAcquirerId;
    }

    logger.info(`Retry attempt ${attempt}`, {
      acquirerId: currentAcquirerId,
      strategy,
    });

    result = await processPayment(currentAcquirerId, transaction);
    retryHistory.push({
      attempt,
      acquirerId: currentAcquirerId,
      success: result.success,
      errorKey: result.errorKey,
      responseTimeMs: result.responseTimeMs,
      timestamp: new Date().toISOString(),
    });

    if (result.success) {
      return _buildResult(result, currentAcquirerId, attempt - 1, retryHistory);
    }

    // If the new error is non-retryable, stop
    const newErrorDef = getError(result.errorKey);
    if (!newErrorDef.retryable) break;
  }

  return _buildResult(result, currentAcquirerId, retryHistory.length - 1, retryHistory);
}

function _buildResult(result, acquirerId, retryCount, retryHistory) {
  return {
    success: result.success,
    acquirerId,
    errorKey: result.errorKey || null,
    responseTimeMs: result.responseTimeMs,
    retryCount,
    retryHistory,
  };
}

/**
 * Pick the next best acquirer not yet tried, weighted by ML scores.
 */
function _pickNextAcquirer(mlScores, usedAcquirers) {
  const ranked = getRankedAcquirers()
    .filter((a) => !usedAcquirers.has(a.id))
    .sort((a, b) => {
      const scoreA = mlScores?.[a.id] || a.currentSuccessRate;
      const scoreB = mlScores?.[b.id] || b.currentSuccessRate;
      return scoreB - scoreA;
    });

  return ranked[0]?.id || null;
}

module.exports = { executeWithRetry };
