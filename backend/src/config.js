require('dotenv').config();

module.exports = {
  port: parseInt(process.env.BACKEND_PORT || '4000', 10),
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  jwtSecret: process.env.JWT_SECRET || 'fallback-dev-secret',
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin',
  dbPath: process.env.DB_PATH || '/app/data/smartpay.db',
  nodeEnv: process.env.NODE_ENV || 'production',
};
