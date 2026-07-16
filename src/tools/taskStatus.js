const axios = require('axios');
const logger = require('../config/logger');
const config = require('../config');
const McpConnection = require('../models/McpConnection');

/**
 * MCP Tool Handler: Task Status Updates
 * E1-US3: Update task status from IDE/CLI agent back to Flora Command Center
 */

/**
 * Update task status from local IDE/CLI agent
 * Proxies status update to monolith Task API, creating audit trail
 */
async function handleTaskUpdateStatus(args, mcpAuth) {
  try {
    const { taskId, status, progress, notes, actualHours } = args;

    const validStatuses = ['todo', 'in_progress', 'completed', 'cancelled', 'blocked'];
    if (!validStatuses.includes(status)) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: 'Invalid status',
            validStatuses,
            provided: status
          })
        }],
        isError: true
      };
    }

    const updatePayload = {
      status,
      progress: progress || undefined,
      actualHours: actualHours || undefined,
      source: 'mcp',
      sourceAgent: mcpAuth.agentType,
      sessionId: mcpAuth.sessionId,
      updatedBy: mcpAuth.userId
    };

    if (notes) {
      updatePayload.comment = `[${mcpAuth.agentType} via MCP] ${notes}`;
    }

    const response = await axios.patch(
      `${config.MONOLITH_API_URL}/api/v1/tasks/${taskId}`,
      updatePayload,
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

    const updatedTask = response.data?.data || response.data;

    const connection = await McpConnection.findById(mcpAuth.connectionId);
    if (connection) {
      if (status === 'completed') {
        await connection.completeWorkOrder();
      }
      await connection.recordActivity();
    }

    logger.info(`MCP task/update_status: task=${taskId} status=${status} agent=${mcpAuth.agentType}`);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          taskId: updatedTask._id || updatedTask.id,
          status: updatedTask.status,
          progress: updatedTask.progress,
          updatedAt: updatedTask.updatedAt,
          updatedBy: mcpAuth.userId,
          source: 'mcp',
          agentType: mcpAuth.agentType,
          sessionId: mcpAuth.sessionId,
          auditLogged: true
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error(`MCP task/update_status error for ${args.taskId}:`, error);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'Failed to update task status',
          taskId: args.taskId,
          message: error.message,
          code: 'MCP_TASK_UPDATE_FAILED'
        })
      }],
      isError: true
    };
  }
}

/**
 * List tasks assigned to the current user or company
 */
async function handleTasksList(args, mcpAuth) {
  try {
    const { status, priority, limit = 20, offset = 0 } = args;

    const response = await axios.get(`${config.MONOLITH_API_URL}/api/v1/tasks`, {
      params: {
        status,
        priority,
        limit,
        offset,
        assignedTo: mcpAuth.userId,
        companyId: mcpAuth.companyId
      },
      headers: {
        'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}`,
        'X-Service-Name': config.SERVICE_NAME,
        'X-MCP-Proxy': 'true',
        'X-Company-ID': mcpAuth.companyId
      }
    });

    const tasks = response.data?.data || response.data || [];

    const connection = await McpConnection.findById(mcpAuth.connectionId);
    if (connection) {
      await connection.recordActivity();
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          tasks: tasks.map(t => ({
            id: t._id || t.id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            progress: t.progress,
            dueDate: t.dueDate,
            assignedTo: t.assignedTo,
            category: t.category,
            tags: t.tags
          })),
          total: tasks.length,
          companyId: mcpAuth.companyId
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error('MCP tasks/list error:', error);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'Failed to fetch tasks',
          message: error.message
        })
      }],
      isError: true
    };
  }
}

module.exports = {
  handleTaskUpdateStatus,
  handleTasksList
};
