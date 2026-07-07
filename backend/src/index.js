require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const config = require('./config');
const { initDb } = require('./database/init');
const { initSocket } = require('./socket');
const { startMonitoring, setAgentService } = require('./services/monitoringService');
const agentService = require('./services/agentService');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');

const { router: paymentRouter, setSocketIo: paymentSetIo } = require('./routes/payment');
const transactionsRouter = require('./routes/transactions');
const adminRouter = require('./routes/admin');
const metricsRouter = require('./routes/metrics');
const agentRouter = require('./routes/agent');

// ── Bootstrap ──────────────────────────────────────────────────────────────────

async function bootstrap() {
  // 1. Database
  await initDb();

  // 2. Express
  const app = express();
  app.use(cors({ origin: '*' }));
  app.use(express.json());

  // 3. HTTP + Socket.IO
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  // 4. Inject io into services
  initSocket(io);
  paymentSetIo(io);
  setAgentService(agentService);
  agentService.setSocketIo(io);

  // 5. Routes
  app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
  app.use('/api/payment', paymentRouter);
  app.use('/api/transactions', transactionsRouter);
  app.use('/api/auth', adminRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/metrics', metricsRouter);
  app.use('/api/agent', agentRouter);

  // 6. Error handler (must be last)
  app.use(errorHandler);

  // 7. Start monitoring
  startMonitoring();

  // 8. Listen
  server.listen(config.port, () => {
    logger.info(`SmartPay Agent backend running on port ${config.port}`);
  });
}

bootstrap().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
