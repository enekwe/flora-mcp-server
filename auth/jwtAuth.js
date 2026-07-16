/**
 * JWT Authentication for Flora MCP Server
 * Validates JWT tokens and establishes authentication context for MCP connections
 */

const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const logger = require('../src/config/logger');

// Import models
const McpConnection = require('../src/models/McpConnection');
const McpApiKey = require('../src/models/McpApiKey');

/**
 * Authenticate JWT token and return user context
 * Validates token signature and expiration
 */
async function authenticateJWT(token) {
  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET not configured');
    }

    // Check if token is MCP API key format (flora_mcp_...)
    if (token.startsWith('flora_mcp_')) {
      return await authenticateMcpApiKey(token);
    }

    // Verify JWT token
    const decoded = jwt.verify(token, jwtSecret);

    // Create authentication context
    const authContext = {
      userId: decoded.userId || decoded.id,
      companyId: decoded.companyId,
      email: decoded.email,
      role: decoded.role,
      sessionId: `mcp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      tokenType: 'jwt',
      ipAddress: decoded.ipAddress || '0.0.0.0',
    };

    logger.info('JWT authentication successful', {
      userId: authContext.userId,
      companyId: authContext.companyId,
    });

    return authContext;
  } catch (error) {
    logger.error('JWT authentication failed', { error: error.message });
    throw new Error(`Invalid JWT token: ${error.message}`);
  }
}

/**
 * Authenticate using MCP API key
 * Validates API key hash and checks budget limits
 */
async function authenticateMcpApiKey(apiKey) {
  try {
    const crypto = require('crypto');
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    // Find API key in database
    const mcpKey = await McpApiKey.findByKeyHash(keyHash);
    if (!mcpKey) {
      throw new Error('Invalid MCP API key');
    }

    // Check if key is active and not expired
    if (mcpKey.status !== 'active') {
      throw new Error(`MCP API key is ${mcpKey.status}`);
    }

    if (mcpKey.expiresAt && new Date() > mcpKey.expiresAt) {
      throw new Error('MCP API key has expired');
    }

    // Check budget limits
    if (!mcpKey.isWithinBudget()) {
      throw new Error('MCP API key has exceeded budget limits');
    }

    // Create authentication context
    const authContext = {
      userId: mcpKey.userId,
      companyId: mcpKey.companyId,
      siteId: mcpKey.siteId,
      apiKeyId: mcpKey._id,
      tier: mcpKey.tier,
      permissions: mcpKey.permissions,
      security: mcpKey.security,
      sessionId: `mcp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      tokenType: 'mcp_api_key',
      ipAddress: '0.0.0.0', // Will be updated from request context
    };

    logger.info('MCP API key authentication successful', {
      apiKeyId: mcpKey._id,
      userId: authContext.userId,
      companyId: authContext.companyId,
      tier: authContext.tier,
    });

    return authContext;
  } catch (error) {
    logger.error('MCP API key authentication failed', { error: error.message });
    throw error;
  }
}

/**
 * Validate MCP connection and create/update connection record
 * Checks permissions and creates audit trail
 */
async function validateMcpConnection(authContext) {
  try {
    // Check if connection already exists for this session
    let connection = await McpConnection.findBySessionId(authContext.sessionId);

    if (!connection) {
      // Create new connection record
      connection = await McpConnection.create({
        sessionId: authContext.sessionId,
        userId: authContext.userId,
        companyId: authContext.companyId,
        siteId: authContext.siteId,
        apiKeyId: authContext.apiKeyId,
        agentType: 'mcp_client', // Will be updated from client headers
        clientName: 'MCP Client',
        status: 'active',
        ipAddress: authContext.ipAddress,
        connectedAt: new Date(),
        lastActivityAt: new Date(),
        securityContext: {
          tier: authContext.tier,
          scopingLevel: authContext.security?.scopingLevel || 'INTERNAL',
          permissions: authContext.permissions,
        },
        metrics: {
          totalToolCalls: 0,
          totalTokensUsed: 0,
          totalCost: 0,
        },
      });

      logger.info('New MCP connection created', {
        sessionId: authContext.sessionId,
        userId: authContext.userId,
        companyId: authContext.companyId,
      });
    } else {
      // Update existing connection
      connection.lastActivityAt = new Date();
      connection.status = 'active';
      await connection.save();

      logger.debug('Existing MCP connection updated', {
        sessionId: authContext.sessionId,
      });
    }

    // Add connection ID to auth context
    authContext.connectionId = connection._id;

    return connection;
  } catch (error) {
    logger.error('MCP connection validation failed', { error: error.message });
    throw error;
  }
}

/**
 * Check if user has specific permission
 * Used for RBAC authorization checks
 */
function checkPermission(authContext, resource, action) {
  if (!authContext.permissions) {
    return false;
  }

  const resourcePermissions = authContext.permissions[resource];
  if (!resourcePermissions) {
    return false;
  }

  return resourcePermissions[action] === true;
}

/**
 * Middleware to update connection activity
 * Should be called after each tool invocation
 */
async function updateConnectionActivity(authContext, toolMetrics = {}) {
  try {
    if (!authContext.connectionId) {
      return;
    }

    const connection = await McpConnection.findById(authContext.connectionId);
    if (!connection) {
      logger.warn('Connection not found for activity update', {
        connectionId: authContext.connectionId,
      });
      return;
    }

    // Update metrics
    connection.metrics.totalToolCalls += 1;
    connection.metrics.totalTokensUsed += toolMetrics.tokensUsed || 0;
    connection.metrics.totalCost += toolMetrics.cost || 0;
    connection.lastActivityAt = new Date();

    await connection.save();

    // Update API key usage if applicable
    if (authContext.apiKeyId && toolMetrics.tokensUsed && toolMetrics.cost) {
      const apiKey = await McpApiKey.findById(authContext.apiKeyId);
      if (apiKey) {
        await apiKey.recordUsage(toolMetrics.tokensUsed, toolMetrics.cost);
      }
    }
  } catch (error) {
    logger.error('Failed to update connection activity', {
      error: error.message,
      connectionId: authContext.connectionId,
    });
  }
}

/**
 * Disconnect MCP connection
 * Called when MCP client disconnects or session ends
 */
async function disconnectConnection(authContext, reason = 'Client disconnected') {
  try {
    if (!authContext.connectionId) {
      return;
    }

    const connection = await McpConnection.findById(authContext.connectionId);
    if (!connection) {
      return;
    }

    connection.status = 'disconnected';
    connection.disconnectedAt = new Date();
    await connection.save();

    logger.info('MCP connection disconnected', {
      sessionId: authContext.sessionId,
      reason,
      duration: connection.durationMinutes,
    });
  } catch (error) {
    logger.error('Failed to disconnect MCP connection', {
      error: error.message,
      connectionId: authContext.connectionId,
    });
  }
}

module.exports = {
  authenticateJWT,
  authenticateMcpApiKey,
  validateMcpConnection,
  checkPermission,
  updateConnectionActivity,
  disconnectConnection,
};
