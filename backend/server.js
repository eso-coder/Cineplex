require('./src/config/env'); // Validate env vars first
const app = require('./src/app');
const connectDB = require('./src/config/db');
const logger = require('./src/utils/logger');
const { port } = require('./src/config/env');

const startServer = async () => {
  await connectDB();

  const server = app.listen(port, () => {
    logger.info(`Server running in ${process.env.NODE_ENV} mode on port ${port}`);
  });

  // Graceful shutdown
  const shutdown = (signal) => {
    logger.info(`${signal} received. Shutting down gracefully...`);
    server.close(() => {
      logger.info('HTTP server closed');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Unhandled promise rejections
  process.on('unhandledRejection', (err) => {
    logger.error('Unhandled rejection:', err);
    server.close(() => process.exit(1));
  });
};

startServer();
