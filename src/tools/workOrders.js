const axios = require('axios');
const logger = require('../config/logger');
const config = require('../config');
const McpConnection = require('../models/McpConnection');

/**
 * MCP Tool Handler: Work Orders
 * E1-US2: Fetch approved work orders from Command Center for IDE/CLI agents
 */

/**
 * List approved work orders available for this connection
 * Proxies to monolith CommandRequest API, scoped by company + status
 */
async function handleWorkOrdersList(args, mcpAuth) {
  try {
    const { status, priority, limit = 20, offset = 0 } = args;

    const queryParams = {
      companyId: mcpAuth.companyId,
      status: status || 'spec_approved,dev_queue,in_development',
      limit,
      offset,
      sortBy: 'createdAt',
      sortOrder: 'desc'
    };

    const response = await axios.get(`${config.MONOLITH_API_URL}/api/v1/site-requests`, {
      params: queryParams,
      headers: {
        'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}`,
        'X-Service-Name': config.SERVICE_NAME,
        'X-MCP-Proxy': 'true',
        'X-Company-ID': mcpAuth.companyId
      }
    });

    const requests = response.data?.data || response.data || [];

    const scopedRequests = requests.map(req => ({
      id: req._id || req.id,
      ticketId: req.ticketId,
      requestText: req.requestText,
      requestType: req.requestType,
      status: req.status,
      priority: req.priority || req.extractedPriority || 'medium',
      companyId: req.companyId,
      companyName: req.companyName,
      submitterName: req.submitterName,
      createdAt: req.createdAt,
      updatedAt: req.updatedAt,
      assignedTo: req.assignedTo,
      tags: req.tags || [],
      attachments: req.attachments ? req.attachments.map(a => ({
        name: a.originalName,
        type: a.mimeType,
        url: a.storageUrl
      })) : []
    }));

    if (mcpAuth.currentWorkOrderId) {
      const connection = await McpConnection.findById(mcpAuth.connectionId);
      if (connection) {
        await connection.recordActivity({ tokensUsed: 0, cost: 0 });
      }
    }

    logger.info(`MCP work_orders/list: ${scopedRequests.length} results for company=${mcpAuth.companyId}`);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          workOrders: scopedRequests,
          total: scopedRequests.length,
          companyId: mcpAuth.companyId,
          agentType: mcpAuth.agentType,
          sessionId: mcpAuth.sessionId
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error('MCP work_orders/list error:', error);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'Failed to fetch work orders',
          message: error.message,
          code: 'MCP_WORK_ORDERS_FETCH_FAILED'
        })
      }],
      isError: true
    };
  }
}

/**
 * Get a specific work order by ID
 * Returns full requirement details with acceptance criteria
 */
async function handleWorkOrdersGet(args, mcpAuth) {
  try {
    const { workOrderId } = args;

    const response = await axios.get(`${config.MONOLITH_API_URL}/api/v1/site-requests/${workOrderId}`, {
      headers: {
        'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}`,
        'X-Service-Name': config.SERVICE_NAME,
        'X-MCP-Proxy': 'true',
        'X-Company-ID': mcpAuth.companyId
      }
    });

    const req = response.data?.data || response.data;

    const connection = await McpConnection.findById(mcpAuth.connectionId);
    if (connection) {
      await connection.assignWorkOrder(workOrderId);
    }

    logger.info(`MCP work_orders/get: fetched ${workOrderId} for company=${mcpAuth.companyId}`);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          id: req._id || req.id,
          ticketId: req.ticketId,
          requestText: req.requestText,
          requestType: req.requestType,
          status: req.status,
          priority: req.priority || req.extractedPriority,
          companyName: req.companyName,
          submitterName: req.submitterName,
          aiAnalysis: req.aiAnalysis,
          statusHistory: req.statusHistory,
          tags: req.tags,
          acceptanceCriteria: req.aiAnalysis?.estimatedEffort || 'See request text for scope',
          createdAt: req.createdAt,
          updatedAt: req.updatedAt
        }, null, 2)
      }]
    };
  } catch (error) {
    logger.error(`MCP work_orders/get error for ${args.workOrderId}:`, error);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: 'Failed to fetch work order',
          workOrderId: args.workOrderId,
          message: error.message
        })
      }],
      isError: true
    };
  }
}

module.exports = {
  handleWorkOrdersList,
  handleWorkOrdersGet
};
