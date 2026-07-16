/**
 * MCP Tool: get_work_order
 * Fetch work order details by work order ID
 * Returns complete work order JSON with instructions, affected files, and metadata
 * Part of CC-E3: MCP Integration & Work Orders
 */

const axios = require('axios');
const logger = require('../src/config/logger');
const { updateConnectionActivity } = require('../auth/jwtAuth');

/**
 * Get work order details
 * @param {Object} args - Tool arguments
 * @param {string} args.workOrderId - Work order UUID
 * @param {Object} authContext - Authentication context
 * @returns {Object} MCP tool response
 */
async function getWorkOrder(args, authContext) {
  const { workOrderId } = args;

  try {
    logger.info('MCP get_work_order called', {
      workOrderId,
      userId: authContext.userId,
      companyId: authContext.companyId
    });

    // Validate input
    if (!workOrderId) {
      throw new Error('workOrderId is required');
    }

    // Fetch work order from monolith
    const monolithUrl = process.env.MONOLITH_API_URL || 'http://localhost:3001';
    const response = await axios.get(
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

    const workOrder = response.data?.data || response.data;

    if (!workOrder) {
      throw new Error(`Work order not found: ${workOrderId}`);
    }

    // Validate access (multi-tenant check)
    if (workOrder.companyId?.toString() !== authContext.companyId?.toString()) {
      throw new Error('Access denied: Work order belongs to different company');
    }

    // Update connection activity
    await updateConnectionActivity(authContext, {
      tokensUsed: estimateTokens(JSON.stringify(workOrder)),
      cost: 0,
    });

    logger.info('MCP get_work_order successful', {
      workOrderId,
      status: workOrder.status,
      affectedFilesCount: workOrder.affectedFiles?.length || 0,
    });

    // Format response for MCP client
    const formattedWorkOrder = formatWorkOrderForMCP(workOrder);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(formattedWorkOrder, null, 2),
        },
      ],
    };
  } catch (error) {
    logger.error('MCP get_work_order failed', {
      workOrderId,
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
            tool: 'get_work_order',
            timestamp: new Date().toISOString(),
          }),
        },
      ],
      isError: true,
    };
  }
}

/**
 * Format work order for MCP client consumption
 * Provides structured, actionable data for AI coding assistants
 */
function formatWorkOrderForMCP(workOrder) {
  return {
    workOrderId: workOrder.workOrderId,
    status: workOrder.status,
    taskType: workOrder.taskType,

    // Core implementation instructions
    instructions: {
      markdown: workOrder.instructions,
      summary: extractSummary(workOrder.instructions),
      estimatedComplexity: workOrder.estimatedComplexity,
      estimatedHours: workOrder.estimatedHours,
    },

    // Files to create/modify/delete
    affectedFiles: workOrder.affectedFiles.map(file => ({
      filePath: file.filePath,
      operation: file.operation, // create, update, delete
      fileType: file.fileType,
      expectedChanges: file.expectedChanges,
      priority: file.priority,
      dependencies: file.dependencies || [],
    })),

    // Acceptance criteria for testing
    acceptanceCriteria: workOrder.acceptanceCriteria.map(ac => ({
      criterion: ac.criterion,
      status: ac.status,
    })),

    // Dependencies (other work orders that must complete first)
    dependencies: workOrder.dependencies || [],
    hasDependencies: (workOrder.dependencies || []).length > 0,

    // Stack information
    stack: {
      language: workOrder.metadata?.sourceLanguage,
      framework: workOrder.metadata?.targetFramework,
    },

    // Technical spec reference (for additional context)
    specId: workOrder.specId,
    requestId: workOrder.requestId,

    // Execution tracking
    execution: {
      startedAt: workOrder.startedAt,
      assignedTo: workOrder.assignedTo,
      retryCount: workOrder.metadata?.retryCount || 0,
    },

    // Metadata
    metadata: {
      createdAt: workOrder.createdAt,
      createdBy: workOrder.createdBy,
      companyId: workOrder.companyId,
    },
  };
}

/**
 * Extract summary from markdown instructions
 */
function extractSummary(instructions) {
  // Extract first heading (# Work Order: ...)
  const match = instructions.match(/^#\s+Work Order:\s+(.+)$/m);
  return match ? match[1].trim() : 'Work order';
}

/**
 * Estimate token count for billing
 */
function estimateTokens(text) {
  // Rough estimate: 4 characters per token
  return Math.ceil(text.length / 4);
}

module.exports = {
  getWorkOrder,
};
