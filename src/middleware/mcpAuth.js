const crypto = require('crypto');
const logger = require('../config/logger');
const config = require('../config');
const McpApiKey = require('../models/McpApiKey');
const McpConnection = require('../models/McpConnection');

/**
 * MCP Authentication Middleware
 * Validates API key from .mcp.json config and manages session lifecycle
 *
 * Authentication flow:
 * 1. IDE/CLI agent sends API key in Authorization header: "Bearer flora_mcp_xxxxxxxx..."
 * 2. Middleware hashes the key and looks up McpApiKey by hash
 * 3. Validates key status, budget, agent type, IP whitelist
 * 4. Creates or resumes McpConnection session
 * 5. Attaches auth context to req.mcpAuth for downstream tool handlers
 */

/**
 * Hash a raw API key using SHA-256 (same method as McpApiKey model)
 */
function hashApiKey(rawKey) {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

/**
 * Extract API key from request
 * Supports: Authorization header (Bearer token), X-MCP-API-Key header, query param
 */
function extractApiKey(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }

  const mcpHeader = req.headers['x-mcp-api-key'];
  if (mcpHeader) {
    return mcpHeader.trim();
  }

  const queryKey = req.query.api_key;
  if (queryKey) {
    return queryKey.trim();
  }

  return null;
}

/**
 * Extract agent type from request headers
 */
function extractAgentType(req) {
  const agentHeader = req.headers['x-mcp-agent-type'];
  if (agentHeader) {
    const normalized = agentHeader.toLowerCase().replace(/[-\s]/g, '_');
    if (['claude_code', 'cursor', 'vs_code', 'qwen_code', 'copilot', 'other'].includes(normalized)) {
      return normalized;
    }
  }

  const clientName = req.headers['x-mcp-client-name'] || req.headers['user-agent'] || '';
  if (clientName.toLowerCase().includes('claude')) return 'claude_code';
  if (clientName.toLowerCase().includes('cursor')) return 'cursor';
  if (clientName.toLowerCase().includes('vscode') || clientName.toLowerCase().includes('visual studio code')) return 'vs_code';
  if (clientName.toLowerCase().includes('qwen')) return 'qwen_code';
  if (clientName.toLowerCase().includes('copilot')) return 'copilot';

  return 'other';
}

/**
 * Main MCP authentication middleware
 */
const mcpAuthMiddleware = async (req, res, next) => {
  try {
    const rawKey = extractApiKey(req);

    if (!rawKey) {
      return res.status(401).json({
        success: false,
        message: 'MCP API key required. Provide via Authorization: Bearer <key> or X-MCP-API-Key header.',
        code: 'MCP_AUTH_MISSING'
      });
    }

    if (!rawKey.startsWith(config.MCP_API_KEY_PREFIX)) {
      return res.status(401).json({
        success: false,
        message: 'Invalid MCP API key format. Key must start with flora_mcp_ prefix.',
        code: 'MCP_AUTH_INVALID_FORMAT'
      });
    }

    const keyHash = hashApiKey(rawKey);
    const apiKey = await McpApiKey.findByKeyHash(keyHash);

    if (!apiKey) {
      logger.warn(`MCP auth failed: key not found for prefix ${rawKey.substring(0, 16)}...`);
      return res.status(401).json({
        success: false,
        message: 'Invalid MCP API key.',
        code: 'MCP_AUTH_INVALID_KEY'
      });
    }

    if (apiKey.status !== 'active') {
      logger.warn(`MCP auth failed: key ${apiKey._id} status is ${apiKey.status}`);
      return res.status(401).json({
        success: false,
        message: `API key is ${apiKey.status}. Contact your admin for a new key.`,
        code: 'MCP_AUTH_KEY_INACTIVE'
      });
    }

    const agentType = extractAgentType(req);

    if (apiKey.security.allowedAgentTypes.length > 0 && !apiKey.security.allowedAgentTypes.includes(agentType)) {
      logger.warn(`MCP auth failed: agent type ${agentType} not allowed for key ${apiKey._id}`);
      return res.status(403).json({
        success: false,
        message: `Agent type ${agentType} is not authorized for this API key. Allowed: ${apiKey.security.allowedAgentTypes.join(', ')}`,
        code: 'MCP_AUTH_AGENT_NOT_ALLOWED'
      });
    }

    const clientIp = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';

    if (apiKey.security.ipWhitelist.length > 0 && !apiKey.security.ipWhitelist.includes(clientIp)) {
      logger.warn(`MCP auth failed: IP ${clientIp} not whitelisted for key ${apiKey._id}`);
      return res.status(403).json({
        success: false,
        message: 'IP address not authorized for this API key.',
        code: 'MCP_AUTH_IP_NOT_ALLOWED'
      });
    }

    if (apiKey.expiresAt && new Date() > apiKey.expiresAt) {
      apiKey.status = 'expired';
      await apiKey.save();
      return res.status(401).json({
        success: false,
        message: 'API key has expired. Generate a new key from Command Center.',
        code: 'MCP_AUTH_KEY_EXPIRED'
      });
    }

    const existingConnections = await McpConnection.countDocuments({
      apiKeyId: apiKey._id,
      userId: apiKey.userId,
      status: { $in: ['active', 'idle'] },
      isDeleted: false
    });

    if (existingConnections >= config.MCP_MAX_CONNECTIONS_PER_USER) {
      logger.warn(`MCP auth failed: user ${apiKey.userId} has ${existingConnections} active connections (max: ${config.MCP_MAX_CONNECTIONS_PER_USER})`);
      return res.status(429).json({
        success: false,
        message: `Maximum concurrent MCP connections reached (${config.MCP_MAX_CONNECTIONS_PER_USER}). Disconnect another session or contact admin.`,
        code: 'MCP_AUTH_MAX_CONNECTIONS'
      });
    }

    const sessionId = req.headers['x-mcp-session-id'] || `mcp_${crypto.randomBytes(16).toString('hex')}`;

    let connection = await McpConnection.findBySessionId(sessionId);

    if (connection) {
      connection.reactivate();
      connection.lastActivityAt = new Date();
      connection.ipAddress = clientIp;
      connection.userAgent = req.headers['user-agent'] || '';
      await connection.save();
    } else {
      connection = await McpConnection.create({
        apiKeyId: apiKey._id,
        userId: apiKey.userId,
        companyId: apiKey.companyId,
        agentType,
        agentVersion: req.headers['x-mcp-agent-version'] || '',
        clientName: req.headers['x-mcp-client-name'] || extractAgentType(req),
        sessionId,
        connectionSource: agentType.includes('cli') ? 'cli' : 'ide',
        ipAddress: clientIp,
        userAgent: req.headers['user-agent'] || '',
        securityContext: {
          scopingLevel: apiKey.security.scopingLevel,
          dataResidencyRegion: apiKey.security.dataResidencyRegion
        },
        createdBy: apiKey.userId
      });
    }

    req.mcpAuth = {
      apiKeyId: apiKey._id,
      apiKey: apiKey,
      userId: apiKey.userId,
      companyId: apiKey.companyId,
      siteId: apiKey.siteId,
      tier: apiKey.tier,
      permissions: apiKey.permissions,
      securityContext: apiKey.security,
      budgetLimits: apiKey.budgetLimits,
      agentType,
      sessionId: connection.sessionId,
      connectionId: connection._id,
      scopingLevel: apiKey.security.scopingLevel,
      dataResidencyRegion: apiKey.security.dataResidencyRegion
    };

    logger.info(`MCP auth success: key=${apiKey._id} user=${apiKey.userId} agent=${agentType} session=${sessionId}`);

    next();
  } catch (error) {
    logger.error('MCP authentication error:', error);
    next(new AppError('MCP authentication failed', 500));
  }
};

/**
 * MCP RBAC middleware — check specific permissions
 * Usage: mcpRbacMiddleware('workOrders', 'read')
 */
const mcpRbacMiddleware = (resource, action) => {
  return (req, res, next) => {
    if (!req.mcpAuth) {
      return res.status(401).json({
        success: false,
        message: 'MCP authentication required before permission check.',
        code: 'MCP_RBAC_NO_AUTH'
      });
    }

    const permissions = req.mcpAuth.permissions;
    if (!permissions[resource] || !permissions[resource][action]) {
      logger.warn(`MCP RBAC denied: ${resource}.${action} for key=${req.mcpAuth.apiKeyId}`);
      return res.status(403).json({
        success: false,
        message: `Permission denied: ${resource}.${action}. Update your API key permissions in Command Center.`,
        code: 'MCP_RBAC_DENIED'
      });
    }

    next();
  };
};

/**
 * MCP rate limiting middleware — per-connection tool call rate limit
 */
const mcpRateLimitMiddleware = async (req, res, next) => {
  try {
    if (!req.mcpAuth) {
      return next();
    }

    const connection = await McpConnection.findById(req.mcpAuth.connectionId);
    if (!connection) {
      return res.status(401).json({
        success: false,
        message: 'MCP connection not found.',
        code: 'MCP_RATE_LIMIT_NO_CONNECTION'
      });
    }

    const recentCalls = connection.metrics.totalToolCalls;

    if (recentCalls > config.MCP_MAX_TOOL_CALLS_PER_MINUTE * 60) {
      logger.warn(`MCP rate limit exceeded for connection ${connection._id}`);
      return res.status(429).json({
        success: false,
        message: 'Tool call rate limit exceeded. Slow down or wait.',
        code: 'MCP_RATE_LIMIT_EXCEEDED'
      });
    }

    next();
  } catch (error) {
    logger.error('MCP rate limit check error:', error);
    next();
  }
};

module.exports = {
  mcpAuthMiddleware,
  mcpRbacMiddleware,
  mcpRateLimitMiddleware,
  hashApiKey,
  extractApiKey,
  extractAgentType,
  AppError: require('./errorHandler').AppError
};
