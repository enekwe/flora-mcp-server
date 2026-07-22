const crypto = require('crypto');
const axios = require('axios');
const logger = require('../config/logger');
const config = require('../config');

/**
 * MCP Tool Handler: App Kit
 * Kicks off Flora App Kit builds (flora-devops) from an IDE/CLI agent and
 * reads back build status. See FLORA_APP_KIT_ARCHITECTURE.md §4 for the
 * build-flow contract this proxies.
 */

const APP_KIT_TIMEOUT_MS = 15000;

/**
 * Kick off a custom-app build.
 * A build triggered from MCP has no pre-existing Command Center project, so
 * we mint a fresh projectId/requestId here rather than requiring the caller
 * to have one — Command Center's callback sink upserts an AppKitBuildLink on
 * first status callback, so this is enough to seed the project timeline.
 */
async function handleAppKitBuild(args, mcpAuth) {
  try {
    const { appName, prompt, manifest, deployTarget } = args;

    const projectId = `mcp-${crypto.randomUUID()}`;
    const requestId = `mcp-${crypto.randomUUID()}`;

    const payload = {
      projectId,
      requestId,
      userId: mcpAuth.userId,
      // mcpAuth carries only companyId (no organizationId) as the tenant boundary;
      // AppKitBuild requires both fields, so the same value fills both roles here.
      organizationId: mcpAuth.companyId,
      companyId: mcpAuth.companyId,
      appName,
      prompt,
      manifest,
      deployTarget,
      callbackUrl: `${config.COMMAND_CENTER_API_URL}/api/command-center/appkit/status`
    };

    const response = await axios.post(
      `${config.APP_KIT_DEVOPS_API_URL}/api/appkit/builds`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}`,
          'X-Service-Name': config.SERVICE_NAME,
          'X-MCP-Proxy': 'true'
        },
        timeout: APP_KIT_TIMEOUT_MS
      }
    );

    const result = response.data;

    logger.info(`MCP app_kit/build: buildId=${result.buildId} company=${mcpAuth.companyId} app=${appName}`);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          buildId: result.buildId,
          status: result.status,
          phase: result.phase,
          projectId,
          requestId
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error('MCP app_kit/build error:', error);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'Failed to start App Kit build',
          message: error.response?.data?.message || error.message,
          code: 'MCP_APP_KIT_BUILD_FAILED'
        })
      }],
      isError: true
    };
  }
}

/**
 * Read current phase/repo/deployUrl/driftScore for a build.
 * Enforces that the build belongs to the caller's tenant before returning
 * anything — the status lookup is keyed only by buildId, so without this
 * check one company's API key could read another company's build.
 */
async function handleAppKitStatus(args, mcpAuth) {
  try {
    const { buildId } = args;

    const response = await axios.get(
      `${config.APP_KIT_DEVOPS_API_URL}/api/appkit/builds/${buildId}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}`,
          'X-Service-Name': config.SERVICE_NAME,
          'X-MCP-Proxy': 'true'
        },
        timeout: APP_KIT_TIMEOUT_MS
      }
    );

    const build = response.data?.build;

    if (!build) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ error: 'Build not found', buildId })
        }],
        isError: true
      };
    }

    const callerCompanyId = String(mcpAuth.companyId);
    const buildOrgId = build.organizationId != null ? String(build.organizationId) : null;
    const buildCompanyId = build.companyId != null ? String(build.companyId) : null;

    if (buildOrgId !== callerCompanyId && buildCompanyId !== callerCompanyId) {
      logger.warn(`MCP app_kit/status: cross-tenant denial for buildId=${buildId} caller=${callerCompanyId}`);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: 'Build not found',
            message: 'No build with that ID is visible to your company.',
            code: 'MCP_APP_KIT_CROSS_TENANT_DENIED'
          })
        }],
        isError: true
      };
    }

    logger.info(`MCP app_kit/status: buildId=${buildId} phase=${build.phase} company=${mcpAuth.companyId}`);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          buildId: build.buildId || buildId,
          phase: build.phase,
          phaseHistory: build.phaseHistory,
          repo: build.repo,
          deployUrl: build.deployUrl,
          driftScore: build.driftScore,
          driftStatus: build.driftStatus,
          error: build.error
        }, null, 2)
      }]
    };
  } catch (error) {
    if (error.response?.status === 404) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ error: 'Build not found', buildId: args.buildId })
        }],
        isError: true
      };
    }

    logger.error(`MCP app_kit/status error for ${args.buildId}:`, error);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'Failed to fetch App Kit build status',
          message: error.response?.data?.message || error.message,
          code: 'MCP_APP_KIT_STATUS_FAILED'
        })
      }],
      isError: true
    };
  }
}

module.exports = {
  handleAppKitBuild,
  handleAppKitStatus
};
