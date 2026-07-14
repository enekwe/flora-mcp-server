const axios = require('axios');
const logger = require('../config/logger');
const config = require('../config');
const McpConnection = require('../models/McpConnection');

/**
 * MCP Tool Handler: Context Boundary & PII Redaction
 * E1-US5: Apply contextBoundaryService redaction before context reaches local agent
 */

/**
 * Check context boundaries for a given content set
 * Returns redacted content and boundary enforcement status
 */
async function handleContextBoundaryCheck(args, mcpAuth) {
  try {
    const { content, operation = 'general', contentType = 'text' } = args;

    const response = await axios.post(
      `${config.COMMAND_CENTER_API_URL}/api/v1/security/scope`,
      {
        companyId: mcpAuth.companyId,
        content,
        operation
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}`,
          'X-Service-Name': config.SERVICE_NAME,
          'X-MCP-Proxy': 'true',
          'X-Company-ID': mcpAuth.companyId,
          'X-Scoping-Level': mcpAuth.scopingLevel
        }
      }
    );

    const scoped = response.data?.data || response.data;

    const connection = await McpConnection.findById(mcpAuth.connectionId);
    if (connection) {
      const piiCount = scoped.redactionStats?.totalRedactions || 0;
      connection.securityContext.piiPatternsRedacted += piiCount;
      connection.securityContext.contextBoundariesEnforced += 1;
      await connection.save();
      await connection.recordActivity();
    }

    logger.info(`MCP context/boundary_check: company=${mcpAuth.companyId} level=${scoped.scopingLevel} redactions=${scoped.redactionStats?.totalRedactions || 0}`);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          scopedContent: scoped.scopedContent,
          scopingLevel: scoped.scopingLevel,
          redactionStats: scoped.redactionStats || {
            totalRedactions: 0,
            patternsRedacted: []
          },
          companyId: mcpAuth.companyId,
          boundaryEnforced: true,
          sessionId: mcpAuth.sessionId
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error('MCP context/boundary_check error:', error);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'Context boundary check failed',
          message: error.message,
          code: 'MCP_CONTEXT_BOUNDARY_FAILED'
        })
      }],
      isError: true
    };
  }
}

module.exports = {
  handleContextBoundaryCheck
};
