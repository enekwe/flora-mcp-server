const axios = require('axios');
const logger = require('../config/logger');
const config = require('../config');
const McpConnection = require('../models/McpConnection');

/**
 * MCP Tool Handler: Prompt Vault Logging
 * E1-US6: Log all MCP-mediated prompt/response interactions in the Prompt Vault
 */

/**
 * Store an interaction in the Prompt Vault
 * Called automatically after provider proxy, or manually by agent
 */
async function handlePromptVaultStore(args, mcpAuth) {
  try {
    const { requestId, prompt, response, provider, model, tokenUsage, cost, metadata } = args;

    const vaultPayload = {
      requestId: requestId || null,
      companyId: mcpAuth.companyId,
      userId: mcpAuth.userId,
      siteId: mcpAuth.siteId,
      agent: `McpAgent_${mcpAuth.agentType}`,
      provider: provider || 'routed',
      model: model || 'auto',
      prompt,
      response,
      tokenUsage: tokenUsage || {
        input: 0,
        output: 0,
        total: 0
      },
      cost: cost || 0,
      metadata: {
        ...metadata,
        source: 'mcp',
        agentType: mcpAuth.agentType,
        sessionId: mcpAuth.sessionId,
        tier: mcpAuth.tier,
        scopingLevel: mcpAuth.scopingLevel
      }
    };

    const vaultResponse = await axios.post(
      `${config.COMMAND_CENTER_API_URL}/api/v1/vault/store`,
      vaultPayload,
      {
        headers: {
          'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}`,
          'X-Service-Name': config.SERVICE_NAME,
          'X-MCP-Proxy': 'true',
          'X-Company-ID': mcpAuth.companyId,
          'X-MCP-Agent-Type': mcpAuth.agentType,
          'X-MCP-Session-ID': mcpAuth.sessionId
        }
      }
    );

    const vaultEntry = vaultResponse.data?.data || vaultResponse.data;

    const connection = await McpConnection.findById(mcpAuth.connectionId);
    if (connection) {
      await connection.recordActivity({
        tokensUsed: tokenUsage?.total || 0,
        cost: cost || 0
      });
    }

    logger.info(`MCP prompts/log: vault entry stored id=${vaultEntry.id || vaultEntry._id} agent=${mcpAuth.agentType}`);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          vaultId: vaultEntry.id || vaultEntry._id || vaultEntry.vaultId,
          stored: true,
          encrypted: true,
          algorithm: 'AES-256-GCM',
          auditLogged: true,
          sessionId: mcpAuth.sessionId,
          timestamp: new Date().toISOString()
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error('MCP prompts/log error:', error);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'Failed to store vault entry',
          message: error.message,
          code: 'MCP_VAULT_STORE_FAILED'
        })
      }],
      isError: true
    };
  }
}

/**
 * Retrieve a vault entry by ID
 * Only available if API key has vault:read permission
 */
async function handlePromptVaultRetrieve(args, mcpAuth) {
  try {
    const { vaultId } = args;

    const response = await axios.get(
      `${config.COMMAND_CENTER_API_URL}/api/v1/vault/retrieve/${vaultId}`,
      {
        params: { companyId: mcpAuth.companyId },
        headers: {
          'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}`,
          'X-Service-Name': config.SERVICE_NAME,
          'X-MCP-Proxy': 'true',
          'X-Company-ID': mcpAuth.companyId
        }
      }
    );

    const entry = response.data?.data || response.data;

    const connection = await McpConnection.findById(mcpAuth.connectionId);
    if (connection) {
      await connection.recordActivity();
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          vaultId: entry._id || entry.id,
          agent: entry.agent,
          provider: entry.provider,
          model: entry.model,
          tokenUsage: entry.tokenUsage,
          cost: entry.cost,
          security: entry.security,
          compliance: entry.compliance,
          timestamp: entry.createdAt
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error('MCP vault retrieve error:', error);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'Failed to retrieve vault entry',
          vaultId: args.vaultId,
          message: error.message
        })
      }],
      isError: true
    };
  }
}

module.exports = {
  handlePromptVaultStore,
  handlePromptVaultRetrieve
};
