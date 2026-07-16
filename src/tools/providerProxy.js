const axios = require('axios');
const logger = require('../config/logger');
const config = require('../config');
const McpApiKey = require('../models/McpApiKey');
const McpConnection = require('../models/McpConnection');

/**
 * MCP Tool Handler: Provider Routing Proxy
 * E1-US4: Proxy LLM calls through Flora's ProviderRoutingService
 * Enforces BYOK budgets, model selection, fallback chains
 */

/**
 * Proxy an LLM call through Flora's provider routing
 * The local agent sends its prompt; Flora selects the provider and enforces boundaries
 */
async function handleProviderProxy(args, mcpAuth) {
  try {
    const { prompt, agentType, context, maxTokens, temperature } = args;

    const apiKey = await McpApiKey.findById(mcpAuth.apiKeyId);
    if (!apiKey) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ error: 'API key not found' })
        }],
        isError: true
      };
    }

    const estimatedTokens = (prompt?.length || 0) / 4 + (context?.length || 0) / 4 + (maxTokens || 1000);
    const estimatedCost = 0.03;

    if (!apiKey.isWithinBudget(estimatedTokens, estimatedCost)) {
      logger.warn(`MCP provider proxy: budget exceeded for key ${apiKey._id}`);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: 'Budget exceeded',
            message: `Your ${apiKey.tier} API key has reached its usage limit. ${apiKey.tier === 'passbook_budget' ? 'Upgrade to company_byok or contact your admin.' : 'Contact your admin to increase limits.'}`,
            currentUsage: {
              monthlyTokensUsed: apiKey.usage.monthlyTokensUsed,
              monthlyCost: apiKey.usage.monthlyCost,
              limits: apiKey.budgetLimits
            }
          })
        }],
        isError: true
      };
    }

    const proxyPayload = {
      prompt,
      agentType: agentType || mcpAuth.agentType,
      context,
      maxTokens: maxTokens || 2000,
      temperature: temperature || 0.7,
      companyId: mcpAuth.companyId,
      userId: mcpAuth.userId,
      source: 'mcp',
      sessionId: mcpAuth.sessionId,
      tier: mcpAuth.tier,
      siteId: mcpAuth.siteId
    };

    const response = await axios.post(
      `${config.MONOLITH_API_URL}/api/v1/command-center/provider/proxy`,
      proxyPayload,
      {
        headers: {
          'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}`,
          'X-Service-Name': config.SERVICE_NAME,
          'X-MCP-Proxy': 'true',
          'X-Company-ID': mcpAuth.companyId,
          'X-MCP-Agent-Type': mcpAuth.agentType,
          'X-BYOK-Tier': mcpAuth.tier
        },
        timeout: 60000
      }
    );

    const result = response.data?.data || response.data;

    await apiKey.recordUsage(
      result.tokenUsage?.total || estimatedTokens,
      result.cost || estimatedCost
    );

    const connection = await McpConnection.findById(mcpAuth.connectionId);
    if (connection) {
      await connection.recordActivity({
        tokensUsed: result.tokenUsage?.total || estimatedTokens,
        cost: result.cost || estimatedCost
      });
    }

    logger.info(`MCP provider proxy: agent=${mcpAuth.agentType} provider=${result.provider || 'routed'} tokens=${result.tokenUsage?.total || 0} cost=${result.cost || 0}`);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          response: result.response || result.content,
          provider: result.provider || 'routed',
          model: result.model || 'auto-selected',
          tokenUsage: result.tokenUsage || { estimated: estimatedTokens },
          cost: result.cost || estimatedCost,
          fallbackUsed: result.fallbackUsed || false,
          tier: mcpAuth.tier,
          sessionId: mcpAuth.sessionId
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error('MCP provider proxy error:', error);

    if (error.response?.status === 429) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: 'Provider rate limited',
            message: 'All providers are currently rate limited. Try again in a few minutes.',
            retryAfter: error.response.headers['retry-after'] || 60
          })
        }],
        isError: true
      };
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'Provider proxy failed',
          message: error.message,
          code: 'MCP_PROVIDER_PROXY_FAILED'
        })
      }],
      isError: true
    };
  }
}

module.exports = {
  handleProviderProxy
};
