// Only load .env in non-production — Railway injects env vars natively at runtime
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

// Debug: log critical env var presence at startup (remove after env var issue is resolved)
const mongoKeys = Object.keys(process.env).filter(k => k.includes('MONGO') || k.includes('URI') || k.includes('DATABASE'));
console.log('[CONFIG DEBUG] ENV keys matching MONGO/URI/DATABASE:', mongoKeys.join(', ') || 'NONE FOUND');
console.log('[CONFIG DEBUG] MONGODB_URI:', process.env.MONGODB_URI ? `present (${process.env.MONGODB_URI.substring(0, 25)}...)` : 'UNDEFINED');
console.log('[CONFIG DEBUG] NODE_ENV:', process.env.NODE_ENV || 'undefined');
console.log('[CONFIG DEBUG] PORT from process.env.PORT:', process.env.PORT || 'UNDEFINED');
console.log('[CONFIG DEBUG] All PORT-related env keys:', Object.keys(process.env).filter(k => k.includes('PORT')).join(', ') || 'NONE FOUND');

// In production, Railway MUST inject PORT - fail explicitly if it doesn't
const getPort = () => {
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.PORT) {
      console.error('[CRITICAL] Railway did not inject PORT environment variable!');
      console.error('[CRITICAL] Available env keys:', Object.keys(process.env).join(', '));
      throw new Error('PORT environment variable is required in production but was not provided by Railway');
    }
    return parseInt(process.env.PORT, 10);
  }
  // Development fallback
  return parseInt(process.env.PORT || '4005', 10);
};

module.exports = {
  // Server
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: getPort(),
  SERVICE_NAME: process.env.SERVICE_NAME || 'flora-mcp-server',

  // Database (isolated per microservice per Flora Development Rules)
  MONGODB_URI: process.env.MONGODB_URI,
  MONGODB_TEST_URI: process.env.MONGODB_TEST_URI,

  // Monolith API (for proxying to command-center-service and core services)
  MONOLITH_API_URL: process.env.MONOLITH_API_URL || 'http://api.railway.internal:3001',
  COMMAND_CENTER_API_URL: process.env.COMMAND_CENTER_API_URL || 'http://flora-command-center.railway.internal:4000',

  // Encryption
  CREDENTIAL_ENCRYPTION_KEY: process.env.CREDENTIAL_ENCRYPTION_KEY,
  JWT_SECRET: process.env.JWT_SECRET,
  INTERNAL_SERVICE_TOKEN: process.env.INTERNAL_SERVICE_TOKEN,

  // MCP-specific
  MCP_API_KEY_PREFIX: process.env.MCP_API_KEY_PREFIX || 'flora_mcp_',
  MCP_SESSION_TIMEOUT_MS: parseInt(process.env.MCP_SESSION_TIMEOUT_MS || '3600000'),
  MCP_IDLE_TIMEOUT_MS: parseInt(process.env.MCP_IDLE_TIMEOUT_MS || '300000'),
  MCP_MAX_CONNECTIONS_PER_USER: parseInt(process.env.MCP_MAX_CONNECTIONS_PER_USER || '3'),
  MCP_MAX_TOOL_CALLS_PER_MINUTE: parseInt(process.env.MCP_MAX_TOOL_CALLS_PER_MINUTE || '60'),

  // CORS
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['https://flora.passbook.vc'],

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'),
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),

  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
};
