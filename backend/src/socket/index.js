/**
 * Socket.IO event manager
 * Wires up all real-time events and injects the io instance into services.
 */

const { setSocketIo: monitoringSetIo, broadcastAcquirerStates } = require('../services/monitoringService');
const { setSocketIo: agentSetIo } = require('../services/agentService');
const logger = require('../utils/logger');

function initSocket(io) {
  // Inject io into services
  monitoringSetIo(io);
  agentSetIo(io);

  io.on('connection', (socket) => {
    logger.info('Admin dashboard connected', { socketId: socket.id });

    // Send current acquirer states immediately on connect
    broadcastAcquirerStates();

    socket.on('disconnect', () => {
      logger.info('Admin dashboard disconnected', { socketId: socket.id });
    });
  });

  logger.info('Socket.IO initialized');
}

module.exports = { initSocket };
