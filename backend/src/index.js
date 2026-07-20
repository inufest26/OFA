require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const config = require('./config');
const { initDb } = require('./database/init');
const { initSocket } = require('./socket');
const { startMonitoring, setAgentService } = require('./services/monitoringService');
const trafficSimulator = require('./services/trafficSimulator');
const agentService = require('./services/agentService');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');

const { router: paymentRouter, setSocketIo: paymentSetIo } = require('./routes/payment');
const transactionsRouter = require('./routes/transactions');
const adminRouter = require('./routes/admin');
const metricsRouter = require('./routes/metrics');
const agentRouter = require('./routes/agent');

async function bootstrap() {
  await initDb();

  const app = express();
  app.use(cors({ origin: '*' }));
  app.use(express.json());

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  initSocket(io);
  paymentSetIo(io);
  setAgentService(agentService);
  agentService.setSocketIo(io);

  app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
  app.use('/api/payment', paymentRouter);
  app.use('/api/transactions', transactionsRouter);
  app.use('/api/auth', adminRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/metrics', metricsRouter);
  app.use('/api/agent', agentRouter);

  app.use(errorHandler);

  startMonitoring();

  server.listen(config.port, () => {
    logger.info(`SmartPay Agent backend running on port ${config.port}`);
    // Start organic traffic simulation after DB and routes are fully ready
    setTimeout(() => trafficSimulator.start(), 5000);
  });
}

bootstrap().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
