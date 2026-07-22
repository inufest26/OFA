const logger = require('../utils/logger');

// eslint-disable-next-line no-unused-vars
async function errorHandler(err, req, res, next) {
  logger.error('Unhandled error', { message: err.message, stack: err.stack });

  try {
    const { getDb } = require('../database/init');
    const db = getDb();
    if (db) {
      await db.run(
        `INSERT INTO error_logs (transaction_id, acquirer_id, error_code, error_message, retry_attempted) VALUES (?, ?, ?, ?, ?)`,
        'system', 'system', 'E500', err.message || 'Internal server error', 0
      );
    }
  } catch (dbErr) {
    logger.error('Failed to write error to DB log', { error: dbErr.message });
  }

  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
}

module.exports = errorHandler;
