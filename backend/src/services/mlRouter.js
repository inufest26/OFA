/**
 * ML Routing Engine — Pluggable Interface
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * INTEGRATION GUIDE FOR REAL ML MODEL
 * ───────────────────────────────────────────────────────────────────────────
 * Replace the `_placeholderPredict` method with your actual model call.
 *
 * INPUT  → buildFeatures(transaction, acquirerMetrics) returns:
 * {
 *   cardBin:          string,   // first 6 digits of card number
 *   cardType:         string,   // 'visa' | 'mastercard' | 'troy'
 *   amount:           number,   // TRY
 *   currency:         string,
 *   hour:             number,   // 0-23
 *   dayOfWeek:        number,   // 0 (Sun) – 6 (Sat)
 *   isWeekend:        boolean,
 *   acquirerMetrics: {
 *     [acquirerId]: {
 *       successRate:       number,  // last 1 hour
 *       avgResponseTime:   number,  // ms
 *       transactionCount:  number,
 *       errorRate:         number,
 *     }
 *   }
 * }
 *
 * OUTPUT ← your model must return:
 * {
 *   scores: { [acquirerId]: number },   // 0..1 probability scores
 *   selectedAcquirer: string,           // highest-scored acquirer id
 *   confidence: number,                 // score of selected acquirer
 * }
 *
 * Integration options:
 *   A) ONNX.js    → load .onnx file, call session.run(inputTensor)
 *   B) TF.js      → tf.loadLayersModel(), model.predict(tensor)
 *   C) HTTP       → POST to external model server, await response
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { getAllAcquirers, getRankedAcquirers } = require('./acquirerSimulator');
const logger = require('../utils/logger');

class MLRouter {
  constructor() {
    this.useRealModel = true; // flip to true when real model is attached
  }

  /**
   * Main entry point.
   * @param {object} transaction - { cardNumber, cardType, amount, currency }
   * @returns {{ scores, selectedAcquirer, confidence, features, method }}
   */
  async predict(transaction) {
    const acquirerMetrics = this._buildAcquirerMetrics();
    const features = this._buildFeatures(transaction, acquirerMetrics);

    let result;
    if (this.useRealModel) {
      result = await this._realModelPredict(features);
    } else {
      result = this._placeholderPredict(features, acquirerMetrics);
    }

    logger.info('ML routing decision', {
      selectedAcquirer: result.selectedAcquirer,
      confidence: result.confidence.toFixed(3),
      method: result.method,
    });

    return { ...result, features };
  }

  // ── Feature builder ─────────────────────────────────────────────────────────

  _buildFeatures(transaction, acquirerMetrics) {
    const now = new Date();
    const cardNumber = (transaction.cardNumber || '').replace(/\s/g, '');
    return {
      cardBin: cardNumber.slice(0, 6),
      cardType: transaction.cardType || 'visa',
      amount: transaction.amount || 0,
      currency: transaction.currency || 'TRY',
      hour: now.getHours(),
      dayOfWeek: now.getDay(),
      isWeekend: now.getDay() === 0 || now.getDay() === 6,
      acquirerMetrics,
    };
  }

  _buildAcquirerMetrics() {
    const acquirers = getAllAcquirers();
    const metrics = {};
    for (const a of acquirers) {
      metrics[a.id] = {
        successRate: a.currentSuccessRate,
        avgResponseTime: a.avgResponseTime,
        transactionCount: a.totalTransactions,
        errorRate: 1 - a.currentSuccessRate,
        commissionRate: a.commissionRate || 0.02,
      };
    }
    return metrics;
  }

  // ── Placeholder heuristic ───────────────────────────────────────────────────
  // Score formula:
  //   successRate × 0.50
  //   + (1 − normalizedResponseTime) × 0.20
  //   + cardTypeAffinity × 0.15
  //   + timeSlotBonus × 0.15

  _placeholderPredict(features, acquirerMetrics) {
    const activeAcquirers = getRankedAcquirers().filter((a) => a.isActive);

    if (activeAcquirers.length === 0) {
      return { scores: {}, selectedAcquirer: null, confidence: 0, method: 'placeholder' };
    }

    // Normalize response times
    const times = activeAcquirers.map((a) => acquirerMetrics[a.id]?.avgResponseTime || 300);
    const maxTime = Math.max(...times);
    const minTime = Math.min(...times);
    const timeRange = maxTime - minTime || 1;

    // Card-type affinity per acquirer (demo values)
    const cardAffinity = {
      acquirer_garanti:   { visa: 0.90, mastercard: 0.85, troy: 0.70 },
      acquirer_yapikredi: { visa: 0.80, mastercard: 0.90, troy: 0.75 },
      acquirer_isbank:    { visa: 0.75, mastercard: 0.80, troy: 0.95 },
      acquirer_akbank:    { visa: 0.92, mastercard: 0.88, troy: 0.80 },
      acquirer_qnb:       { visa: 0.85, mastercard: 0.92, troy: 0.72 },
      acquirer_denizbank: { visa: 0.78, mastercard: 0.82, troy: 0.88 },
    };

    // Time-of-day bonus (peak hours 9-18 = higher traffic = lower bonus)
    const isPeak = features.hour >= 9 && features.hour < 18;
    const timeBonus = isPeak ? 0.5 : 0.8;

    // Cost optimization: Find the most expensive active acquirer
    const commissions = activeAcquirers.map((a) => a.commissionRate || 0.02);
    const maxCommission = Math.max(...commissions);
    const minCommission = Math.min(...commissions);
    const costRange = maxCommission - minCommission || 1;

    const scores = {};
    for (const acq of activeAcquirers) {
      const m = acquirerMetrics[acq.id] || {};
      const successScore = (m.successRate || acq.currentSuccessRate) * 0.40; // Reduced from 50
      const normTime = (maxTime - (m.avgResponseTime || 300)) / timeRange;
      const respScore = normTime * 0.15; // Reduced from 20
      
      // Cost score (Cheaper = higher score, weight 20%)
      const acqCommission = acq.commissionRate || 0.02;
      const costScore = ((maxCommission - acqCommission) / costRange) * 0.20;

      const affinity = cardAffinity[acq.id]?.[features.cardType] ?? 0.8;
      const affinityScore = affinity * 0.15;
      const slotScore = timeBonus * 0.10; // Reduced from 15

      scores[acq.id] = parseFloat(
        (successScore + respScore + costScore + affinityScore + slotScore).toFixed(4)
      );
    }

    // Pick winner
    const selectedAcquirer = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];

    // Calculate savings
    const selectedCommission = activeAcquirers.find(a => a.id === selectedAcquirer)?.commissionRate || 0.02;
    const costSavingPct = maxCommission - selectedCommission;

    return {
      scores,
      selectedAcquirer,
      confidence: scores[selectedAcquirer],
      method: 'placeholder-heuristic',
      costSavingPct: costSavingPct > 0 ? parseFloat((costSavingPct * 100).toFixed(2)) : 0
    };
  }

  // ── Real model stub ─────────────────────────────────────────────────────────
  // Calls the FastAPI routing service.

  async _realModelPredict(features) {
    const activeAcquirers = getRankedAcquirers().filter((a) => a.isActive).map((a) => a.id);
    if (activeAcquirers.length === 0) {
      return { scores: {}, selectedAcquirer: null, confidence: 0, method: 'real-model-no-active' };
    }

    const payload = {
      acquirer_ids: activeAcquirers,
      card_type: features.cardType,
      amount: features.amount,
      hour_of_day: features.hour,
      day_of_week: features.dayOfWeek,
      is_retry: 0, // In a real system this would track retries
      issuer_id: "I01", // Placeholder issuer
    };

    try {
      const routingUrl = process.env.ROUTING_URL || 'http://routing:5050/predict';
      const response = await fetch(routingUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Routing service returned ${response.status}`);
      }

      const data = await response.json();
      return {
        scores: data.scores,
        selectedAcquirer: data.selected_acquirer,
        confidence: data.confidence,
        method: data.method || 'ml-random-forest',
      };
    } catch (err) {
      logger.error('Real model predict failed, falling back to heuristic', { error: err.message });
      // Fallback
      return this._placeholderPredict(features, features.acquirerMetrics);
    }
  }
}

module.exports = new MLRouter();
