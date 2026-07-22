const logger = require('../utils/logger');

const CARD_TYPES = ['visa', 'mastercard', 'troy'];
const CARD_PREFIXES = { visa: '4532', mastercard: '5425', troy: '9793' };
// Reduced amounts to keep transaction rate lower
const AMOUNTS = [50, 100, 250, 500, 1000];

let _trafficInterval = null;
let _isRunning = false;

function randomDigits(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
  return s;
}

function randomCard() {
  const type = CARD_TYPES[Math.floor(Math.random() * CARD_TYPES.length)];
  return { cardNumber: CARD_PREFIXES[type] + randomDigits(12), cardType: type };
}

function randomAmount() {
  return AMOUNTS[Math.floor(Math.random() * AMOUNTS.length)];
}

async function postPayment(cardNumber, cardType, amount) {
  const port = process.env.PORT || 4000;
  try {
    await fetch(`http://localhost:${port}/api/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardNumber, cardType, amount, currency: 'TRY', source: 'simulator' }),
    });
  } catch (err) {
    logger.warn('Traffic simulator failed to send request', { error: err.message });
  }
}

async function normalTrafficTick() {
  if (!_isRunning) return;

  // Drastically reduced error injection rates to get ~2 failures per 5 minutes:
  // - 1% risky cards (was 5%)
  // - 0.5% timeout cards (was 3%)
  // - rest normal (high success rate cards)
  const roll = Math.random();
  let cardNumber, cardType;

  if (roll < 0.01) {
    cardType = CARD_TYPES[Math.floor(Math.random() * CARD_TYPES.length)];
    cardNumber = '5222' + randomDigits(12); // risky (was 5%)
  } else if (roll < 0.015) {
    cardType = 'visa';
    cardNumber = '4000' + randomDigits(12); // timeout → retry (was 3%)
  } else {
    const card = randomCard();
    cardNumber = card.cardNumber;
    cardType = card.cardType;
  }

  await postPayment(cardNumber, cardType, randomAmount());
}

async function anomalyTick() {
  if (!_isRunning) return;
  const cardType = CARD_TYPES[Math.floor(Math.random() * 2)]; // visa or mastercard
  logger.info('Traffic Simulator: injecting periodic anomaly scenario');
  await postPayment('5333' + randomDigits(12), cardType, randomAmount());
}

function scheduleAnomaly() {
  if (!_isRunning) return;
  // Every 8–10 minutes (was 2–3 minutes) — much less frequent anomaly injection
  const delay = 480_000 + Math.random() * 120_000;
  setTimeout(async () => {
    await anomalyTick().catch(() => {});
    scheduleAnomaly();
  }, delay);
}

function start() {
  if (_isRunning) return;
  _isRunning = true;
  // Interval: 2.5 seconds → ~120 transactions per 5 min
  _trafficInterval = setInterval(() => {
    normalTrafficTick().catch(() => {});
  }, 2500);

  // First anomaly after 90s, then recurring every 8-10 minutes
  setTimeout(async () => {
    await anomalyTick().catch(() => {});
    scheduleAnomaly();
  }, 90_000);

  logger.info('Traffic Simulator started — normal: 2.5s interval, anomaly: ~8-10min cycle');
}

function stop() {
  if (!_isRunning) return;
  _isRunning = false;
  clearInterval(_trafficInterval);
  _trafficInterval = null;
  logger.info('Traffic Simulator stopped');
}

module.exports = { start, stop };
