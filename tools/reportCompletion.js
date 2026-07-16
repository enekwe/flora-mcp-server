/**
 * MCP Tool: report_completion
 * Report completion status of a work order
 * UPDATED (CC-E3): Now updates WorkOrder model and sends Slack notifications
 * Triggers Code Review gate (Gate 2) when completed successfully
 */

const axios = require('axios');
const mongoose = require('mongoose');
const logger = require('../src/config/logger');
const { updateConnectionActivity } = require('../auth/jwtAuth');

/**
 * Report work order completion
 * @param {Object} args - Tool arguments
 * @param {string} args.workOrderId - Work order UUID
 * @param {string} args.status - Completion status (completed, failed, blocked)
 * @param {Object} args.artifacts - Artifacts produced
 * @param {string} args.executionLog - Execution log from MCP client
 * @param {Object} args.testResults - Test results (optional)
 * @param {Object} args.debuggingContext - Debugging context (CC-E12)
 * @param {Array} args.debuggingContext.errors - Error messages encountered
 * @param {Array} args.debuggingContext.commandsRun - Commands run during execution
 * @param {number} args.debuggingContext.iterationCount - Number of debugging iterations
 * @param {Object} authContext - Authentication context
 * @returns {Object} MCP tool response
 */
async function reportCompletion(args, authContext) {
  const {
    workOrderId,
    status,
    artifacts = {},
    executionLog = '',
    testResults = {},
    debuggingContext = { errors: [], commandsRun: [], iterationCount: 1 }
  } = args;

  try {
    logger.info('MCP report_completion called', {
      workOrderId,
      status,
      userId: authContext.userId,
      companyId: authContext.companyId,
    });

    // Validate status
    const validStatuses = ['completed', 'failed', 'blocked'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    // Fetch work order to validate access
    const monolithUrl = process.env.MONOLITH_API_URL || 'http://localhost:3001';
    const workOrderResponse = await axios.get(
      `${monolithUrl}/api/v1/command-center/work-orders/${workOrderId}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN}`,
          'X-Service-Name': 'flora-mcp-server',
          'X-User-ID': authContext.userId,
          'X-Company-ID': authContext.companyId,
        },
      }
    );

    const workOrder = workOrderResponse.data?.data || workOrderResponse.data;

    if (!workOrder) {
      throw new Error(`Work order not found: ${workOrderId}`);
    }

    // Validate access (multi-tenant check)
    if (workOrder.companyId?.toString() !== authContext.companyId?.toString()) {
      throw new Error('Access denied: Work order belongs to different company');
    }

    // Update work order with completion data
    await updateWorkOrderCompletion({
      workOrderId,
      workOrder,
      status,
      artifacts,
      executionLog,
      testResults,
      debuggingContext,
      authContext,
    });

    // Capture debugging session if errors were encountered (CC-E12)
    if (debuggingContext.errors && debuggingContext.errors.length > 0) {
      await captureDebuggingSession({
        workOrderId,
        companyId: authContext.companyId,
        createdBy: authContext.userId,
        debuggingContext,
        artifacts,
        status,
      });
    }

    // Send Slack notification to founder
    await sendSlackNotification({
      workOrderId,
      workOrder,
      status,
      artifacts,
      authContext,
    });

    // Update connection activity for billing
    await updateConnectionActivity(authContext, {
      tokensUsed: estimateTokens(executionLog),
      cost: 0,
    });

    logger.info('MCP report_completion successful', {
      workOrderId,
      status,
      filesCreated: artifacts.filesCreated?.length || 0,
      filesModified: artifacts.filesModified?.length || 0,
    });

    const response = {
      success: true,
      workOrderId,
      status,
      completedAt: new Date().toISOString(),
      artifacts: {
        filesCreated: artifacts.filesCreated?.length || 0,
        filesModified: artifacts.filesModified?.length || 0,
        testsAdded: artifacts.testsAdded?.length || 0,
        commitHash: artifacts.commitHash || null,
        branchName: artifacts.branchName || null,
        pullRequestUrl: artifacts.pullRequestUrl || null,
      },
      message: getCompletionMessage(status),
      nextSteps: getNextSteps(status),
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  } catch (error) {
    logger.error('MCP report_completion failed', {
      workOrderId,
      status,
      error: error.message,
      stack: error.stack,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: error.message,
            workOrderId,
            status,
            tool: 'report_completion',
            timestamp: new Date().toISOString(),
          }),
        },
      ],
      isError: true,
    };
  }
}

/**
 * Capture debugging session (CC-E12)
 */
async function captureDebuggingSession(data) {
  const { workOrderId, companyId, createdBy, debuggingContext, artifacts, status } = data;

  try {
    const monolithUrl = process.env.MONOLITH_API_URL || 'http://localhost:3001';

    const sessionData = {
      workOrderId,
      companyId,
      createdBy,
      mcpOutput: {
        debuggingContext,
        filesModified: artifacts.filesModified || [],
        success: status === 'completed',
        solution: status === 'completed' ? 'Successfully completed work order' : null,
        creditsUsed: artifacts.actualTokens || 0,
      },
    };

    await axios.post(
      `${monolithUrl}/api/v1/command-center/troubleshooting/sessions/capture`,
      sessionData,
      {
        headers: {
          Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN}`,
          'X-Service-Name': 'flora-mcp-server',
          'X-User-ID': createdBy,
          'X-Company-ID': companyId,
        },
      }
    );

    logger.info('Debugging session captured', {
      workOrderId,
      errorsCount: debuggingContext.errors?.length || 0,
    });
  } catch (error) {
    // Log error but don't fail the completion
    logger.error('Failed to capture debugging session', {
      workOrderId,
      error: error.message,
    });
  }
}

/**
 * Update work order with completion data (CC-E3)
 */
async function updateWorkOrderCompletion(data) {
  const { workOrderId, workOrder, status, artifacts, executionLog, testResults, debuggingContext, authContext } = data;

  try {
    const monolithUrl = process.env.MONOLITH_API_URL || 'http://localhost:3001';

    const updateData = {
      status,
      artifacts: {
        filesCreated: artifacts.filesCreated || [],
        filesModified: artifacts.filesModified || [],
        testsAdded: artifacts.testsAdded || [],
        commitHash: artifacts.commitHash || null,
        branchName: artifacts.branchName || null,
        pullRequestUrl: artifacts.pullRequestUrl || null,
      },
      executionLog,
      testResults,
      completedAt: status === 'completed' ? new Date() : null,
      assignedTo: {
        userId: authContext.userId,
        agentType: authContext.agentType || 'mcp_client',
      },
      metadata: {
        actualTokens: artifacts.actualTokens || estimateTokens(executionLog),
        mcpSessionId: authContext.sessionId,
      },
      debuggingContext: debuggingContext || null,
    };

    await axios.patch(
      `${monolithUrl}/api/v1/command-center/work-orders/${workOrderId}/complete`,
      updateData,
      {
        headers: {
          Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN}`,
          'X-Service-Name': 'flora-mcp-server',
          'X-User-ID': authContext.userId,
          'X-Company-ID': authContext.companyId,
        },
      }
    );

    logger.info('Work order updated with completion data', {
      workOrderId,
      status,
      filesCreated: artifacts.filesCreated?.length || 0,
    });
  } catch (error) {
    logger.error('Failed to update work order completion', {
      workOrderId,
      error: error.message,
    });
    // Throw error - this is critical
    throw error;
  }
}

/**
 * Send Slack notification to founder (CC-E3-3)
 */
async function sendSlackNotification(data) {
  const { workOrderId, workOrder, status, artifacts, authContext } = data;

  try {
    const monolithUrl = process.env.MONOLITH_API_URL || 'http://localhost:3001';

    // Build notification message
    const message = buildSlackMessage(workOrderId, workOrder, status, artifacts);

    // Send notification via monolith's notification service
    await axios.post(
      `${monolithUrl}/api/v1/notifications/slack`,
      {
        channel: 'command-center', // Or specific founder channel
        message,
        workOrderId,
        status,
        companyId: authContext.companyId,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN}`,
          'X-Service-Name': 'flora-mcp-server',
          'X-User-ID': authContext.userId,
          'X-Company-ID': authContext.companyId,
        },
      }
    );

    logger.info('Slack notification sent', {
      workOrderId,
      status,
    });
  } catch (error) {
    // Log error but don't fail the completion
    logger.error('Failed to send Slack notification', {
      workOrderId,
      error: error.message,
    });
  }
}

/**
 * Build Slack notification message
 */
function buildSlackMessage(workOrderId, workOrder, status, artifacts) {
  const statusEmoji = {
    completed: '✅',
    failed: '❌',
    blocked: '🚧',
  };

  const emoji = statusEmoji[status] || '📝';

  let message = `${emoji} *Work Order ${status.toUpperCase()}*\n\n`;
  message += `*Work Order ID:* ${workOrderId}\n`;
  message += `*Task:* ${workOrder.instructions?.substring(0, 100) || 'Work order'}...\n`;
  message += `*Status:* ${status}\n\n`;

  if (status === 'completed') {
    message += `*Files Created:* ${artifacts.filesCreated?.length || 0}\n`;
    message += `*Files Modified:* ${artifacts.filesModified?.length || 0}\n`;
    message += `*Tests Added:* ${artifacts.testsAdded?.length || 0}\n`;

    if (artifacts.commitHash) {
      message += `*Commit:* \`${artifacts.commitHash.substring(0, 7)}\`\n`;
    }

    if (artifacts.pullRequestUrl) {
      message += `*Pull Request:* ${artifacts.pullRequestUrl}\n`;
    }

    message += `\n🎯 *Next Step:* Code Review (Gate 2)\n`;
    message += `Review the changes and approve for merge.`;
  } else if (status === 'failed') {
    message += `\n⚠️ *Action Required:* Review execution log and resolve errors.`;
  } else if (status === 'blocked') {
    message += `\n⚠️ *Action Required:* Resolve blocking issues to continue.`;
  }

  return message;
}

/**
 * Get completion message based on status
 */
function getCompletionMessage(status) {
  const messages = {
    completed: 'Work order completed successfully. Ready for Code Review (Gate 2).',
    failed: 'Work order marked as failed. Please review execution log and retry.',
    blocked: 'Work order blocked. Please resolve blocking issues before continuing.',
  };

  return messages[status] || 'Work order status updated.';
}

/**
 * Get next steps based on status
 */
function getNextSteps(status) {
  const steps = {
    completed: [
      'Code Review: Founder reviews generated code',
      'Run Tests: Verify all tests pass',
      'Merge: Merge PR after approval',
      'Deploy: Deploy to staging/production',
    ],
    failed: [
      'Review Errors: Check execution log for errors',
      'Fix Issues: Resolve blocking errors',
      'Retry: Create new work order or retry execution',
    ],
    blocked: [
      'Identify Blocker: Review blocking issues',
      'Resolve Dependencies: Complete prerequisite work',
      'Resume: Continue work order execution',
    ],
  };

  return steps[status] || [];
}

/**
 * Estimate token count
 */
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

module.exports = {
  reportCompletion,
};
