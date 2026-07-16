#!/usr/bin/env node

/**
 * Flora MCP Server — Entry Point
 *
 * This is the main entry point for the Flora MCP Server microservice.
 * It bootstraps and starts the Express application that provides:
 * - MCP (Model Context Protocol) tools for IDE/CLI agents
 * - Authentication via JWT tokens or MCP API keys
 * - Budget enforcement and context boundary checking
 * - Audit logging and compliance tracking
 *
 * Environment Variables Required:
 * - MONGODB_URI: MongoDB connection string
 * - JWT_SECRET: Secret for JWT token validation
 * - MONOLITH_API_URL: URL to main Flora API
 * - INTERNAL_SERVICE_TOKEN: Token for service-to-service auth
 * - PORT: Server port (default: 4005)
 *
 * For Railway/Docker deployment, this file must be self-contained
 * without dependencies on parent repository files.
 */

require('dotenv').config();

const logger = require('./src/config/logger');

// Debug: Log Railway environment variable injection
console.log('[SERVER.JS] Loaded dotenv, checking Railway environment...');
console.log('[SERVER.JS] NODE_ENV:', process.env.NODE_ENV);
console.log('[SERVER.JS] PORT:', process.env.PORT || 'NOT SET');
console.log('[SERVER.JS] RAILWAY_ENVIRONMENT:', process.env.RAILWAY_ENVIRONMENT || 'NOT SET');
console.log('[SERVER.JS] Total env vars:', Object.keys(process.env).length);

// Validate critical environment variables
const requiredEnvVars = ['MONGODB_URI', 'JWT_SECRET', 'MONOLITH_API_URL', 'INTERNAL_SERVICE_TOKEN'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  logger.error(`Missing required environment variables: ${missingVars.join(', ')}`);
  logger.error('Please configure these in Railway/Docker environment or .env file');
  process.exit(1);
}

// Import and start the microservice
const FloraMcpServerMicroservice = require('./src/index');
const { errorHandler, notFound } = require('./src/middleware/errorHandler');

const microservice = new FloraMcpServerMicroservice();

// Error handlers must be registered after all routes
microservice.app.use(notFound);
microservice.app.use(errorHandler);

async function main() {
  try {
    logger.info('Starting Flora MCP Server Microservice...');
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`MongoDB URI: ${process.env.MONGODB_URI ? '[configured]' : '[MISSING]'}`);

    await microservice.initialize();
    await microservice.start();

    logger.info('Flora MCP Server is ready to accept connections');
  } catch (error) {
    logger.error('Failed to start Flora MCP Server Microservice:', error);
    logger.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  logger.error('Stack trace:', error.stack);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
if (require.main === module) {
  main();
}

module.exports = microservice;
