/**
 * Jest test setup
 * Configures test environment and mocks
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only';
process.env.MONOLITH_API_URL = 'http://localhost:3001';
process.env.INTERNAL_SERVICE_TOKEN = 'test-internal-token';
process.env.MCP_TRANSPORT_MODE = 'stdio';

// Suppress console output during tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
