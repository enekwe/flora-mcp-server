/**
 * MCP Tool: get_requirements
 * Fetches technical specifications for a work order
 * Returns TechnicalSpec JSON with requirements, acceptance criteria, and constraints
 */

const axios = require('axios');
const logger = require('../src/config/logger');
const { updateConnectionActivity } = require('../auth/jwtAuth');

/**
 * Get requirements for a work order
 * @param {Object} args - Tool arguments
 * @param {string} args.workOrderId - Work order ID (CommandRequest ID)
 * @param {Object} authContext - Authentication context
 * @returns {Object} MCP tool response with requirements
 */
async function getRequirements(args, authContext) {
  const { workOrderId } = args;

  try {
    logger.info('MCP get_requirements called', {
      workOrderId,
      userId: authContext.userId,
      companyId: authContext.companyId,
    });

    // Fetch work order from monolith API
    const monolithUrl = process.env.MONOLITH_API_URL || 'http://localhost:3001';
    const response = await axios.get(`${monolithUrl}/api/v1/site-requests/${workOrderId}`, {
      headers: {
        Authorization: `Bearer ${process.env.INTERNAL_SERVICE_TOKEN}`,
        'X-Service-Name': 'flora-mcp-server',
        'X-User-ID': authContext.userId,
        'X-Company-ID': authContext.companyId,
      },
    });

    const workOrder = response.data?.data || response.data;

    if (!workOrder) {
      throw new Error(`Work order not found: ${workOrderId}`);
    }

    // Validate access - user must belong to same company
    if (workOrder.companyId?.toString() !== authContext.companyId?.toString()) {
      throw new Error('Access denied: Work order belongs to different company');
    }

    // Extract technical requirements
    const requirements = {
      workOrderId: workOrder._id || workOrder.id,
      ticketId: workOrder.ticketId,
      title: workOrder.requestText?.substring(0, 100) || 'Untitled Work Order',
      description: workOrder.requestText,
      requestType: workOrder.requestType,
      priority: workOrder.priority || workOrder.extractedPriority || 'medium',
      status: workOrder.status,

      // Technical specifications
      technicalSpec: {
        requirements: workOrder.aiAnalysis?.requirements || extractRequirements(workOrder.requestText),
        acceptanceCriteria: workOrder.aiAnalysis?.acceptanceCriteria || [],
        estimatedEffort: workOrder.aiAnalysis?.estimatedEffort || 'Unknown',
        complexity: workOrder.aiAnalysis?.complexity || 'medium',
        suggestedTechnologies: workOrder.aiAnalysis?.suggestedTechnologies || [],
      },

      // Context
      context: {
        companyName: workOrder.companyName,
        submitterName: workOrder.submitterName,
        tags: workOrder.tags || [],
        createdAt: workOrder.createdAt,
        updatedAt: workOrder.updatedAt,
      },

      // Attachments
      attachments: (workOrder.attachments || []).map(att => ({
        name: att.originalName || att.name,
        type: att.mimeType,
        url: att.storageUrl,
        size: att.fileSize,
      })),

      // Constraints
      constraints: {
        deadline: workOrder.deadline,
        budget: workOrder.budget,
        dataClassification: authContext.security?.scopingLevel || 'INTERNAL',
      },
    };

    // Update connection activity
    await updateConnectionActivity(authContext, {
      tokensUsed: estimateTokens(JSON.stringify(requirements)),
      cost: 0, // Requirements fetch is free
    });

    logger.info('MCP get_requirements completed', {
      workOrderId,
      requirementsSize: JSON.stringify(requirements).length,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(requirements, null, 2),
        },
      ],
    };
  } catch (error) {
    logger.error('MCP get_requirements failed', {
      workOrderId,
      error: error.message,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: error.message,
            workOrderId,
            tool: 'get_requirements',
            timestamp: new Date().toISOString(),
          }),
        },
      ],
      isError: true,
    };
  }
}

/**
 * Extract requirements from request text if AI analysis is not available
 * Simple text-based extraction as fallback
 */
function extractRequirements(requestText) {
  if (!requestText) {
    return ['No requirements specified'];
  }

  const requirements = [];

  // Look for numbered lists
  const numberedPattern = /(\d+)\.\s+(.+?)(?=\n\d+\.|\n\n|$)/gs;
  const numberedMatches = [...requestText.matchAll(numberedPattern)];

  if (numberedMatches.length > 0) {
    numberedMatches.forEach(match => {
      requirements.push(match[2].trim());
    });
  }

  // Look for bullet points
  const bulletPattern = /[•\-\*]\s+(.+?)(?=\n[•\-\*]|\n\n|$)/gs;
  const bulletMatches = [...requestText.matchAll(bulletPattern)];

  if (bulletMatches.length > 0) {
    bulletMatches.forEach(match => {
      requirements.push(match[1].trim());
    });
  }

  // If no structured requirements found, use full text
  if (requirements.length === 0) {
    requirements.push(requestText.trim());
  }

  return requirements;
}

/**
 * Estimate token count for text
 * Rough approximation: 1 token ≈ 4 characters
 */
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

module.exports = {
  getRequirements,
};
