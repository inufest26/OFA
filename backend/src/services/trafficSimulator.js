const logger = require('../utils/logger');

let _interval = null;
let _isRunning = false;

function generateRandomCard() {
  const types = ['visa', 'mastercard', 'troy'];
  const normalPrefixes = { visa: '4532', mastercard: '5425', troy: '9793' };
  
  const type = types[Math.floor(Math.random() * types.length)];
  const prefix = normalPrefixes[type];
  
  let number = prefix;
  for (let i = 0; i < 12; i++) {
    number += Math.floor(Math.random() * 10).toString();
  }
  return { cardNumber: number, cardType: type };
}

function generateRandomAmount() {
  const amounts = [50, 100, 250, 500, 1000, 2500];
  return amounts[Math.floor(Math.random() * amounts.length)];
}

async function simulateTrafficTick() {
  if (!_isRunning) return;
  const port = process.env.PORT || 4000;
  const { cardNumber, cardType } = generateRandomCard();
  const amount = generateRandomAmount();

  try {
    const res = await fetch(`http://localhost:${port}/api/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardNumber, cardType, amount, currency: 'TRY' })
    });
  } catch (err) {
    logger.warn('Traffic simulator failed to send request', { error: err.message });
  }
}

function start() {
  if (_isRunning) return;
  _isRunning = true;
  logger.info('Traffic Simulator started (interval: 3s)');
  _interval = setInterval(simulateTrafficTick, 3000);
}

function stop() {
  if (!_isRunning) return;
  _isRunning = false;
  clearInterval(_interval);
  _interval = null;
  logger.info('Traffic Simulator stopped');
}

module.exports = { start, stop };
