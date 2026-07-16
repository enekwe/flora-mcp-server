/**
 * MCP Tool: get_solution_recommendation
 * Get troubleshooting solution recommendations for errors
 * CC-E12: Proactively suggest known solutions when errors occur
 */

const axios = require('axios');
const logger = require('../src/config/logger');
const { updateConnectionActivity } = require('../auth/jwtAuth');

/**
 * Get solution recommendation for an error
 * @param {Object} args - Tool arguments
 * @param {string} args.errorMessage - Error message encountered
 * @param {string} args.stackTrace - Stack trace (optional)
 * @param {string} args.language - Programming language (optional)
 * @param {string} args.framework - Framework being used (optional)
 * @param {Object} authContext - Authentication context
 * @returns {Object} MCP tool response
 */
async function getSolutionRecommendation(args, authContext) {
  const { errorMessage, stackTrace, language, framework } = args;

  try {
    logger.info('MCP get_solution_recommendation called', {
      errorLength: errorMessage?.length || 0,
      hasStackTrace: !!stackTrace,
      language,
      framework,
      userId: authContext.userId,
      companyId: authContext.companyId,
    });

    if (!errorMessage) {
      throw new Error('errorMessage is required');
    }

    // Call monolith API to get recommendation
    const monolithUrl = process.env.MONOLITH_API_URL || 'http://localhost:3001';
    const response = await axios.post(
      `${monolithUrl}/api/v1/command-center/troubleshooting/recommend`,
      {
        errorMessage,
        stackTrace,
        language,
        framework,
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

    const recommendation = response.data?.data || response.data;

    // Update connection activity for billing
    await updateConnectionActivity(authContext, {
      tokensUsed: estimateTokens(errorMessage),
      cost: 0,
    });

    logger.info('MCP get_solution_recommendation successful', {
      hasPattern: !!recommendation.pattern,
      confidence: recommendation.confidence,
      matchType: recommendation.matchType,
    });

    // Format response based on whether a pattern was found
    const result = formatRecommendationResponse(recommendation, errorMessage);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    logger.error('MCP get_solution_recommendation failed', {
      error: error.message,
      stack: error.stack,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: error.message,
            hasRecommendation: false,
            tool: 'get_solution_recommendation',
            timestamp: new Date().toISOString(),
          }),
        },
      ],
      isError: true,
    };
  }
}

/**
 * Format recommendation response for MCP client
 */
function formatRecommendationResponse(recommendation, errorMessage) {
  if (!recommendation.pattern) {
    return {
      hasRecommendation: false,
      message: 'No known solution pattern found for this error.',
      suggestion: 'This appears to be a new error. The debugging session will be captured for future pattern extraction.',
      errorMessage: errorMessage.substring(0, 200),
    };
  }

  const pattern = recommendation.pattern;

  return {
    hasRecommendation: true,
    confidence: recommendation.confidence,
    matchType: recommendation.matchType,
    pattern: {
      title: pattern.title,
      patternId: pattern.patternId,
      category: pattern.problemCategory,
      rootCause: pattern.rootCause,
      solution: pattern.solutionPattern,
      prerequisites: pattern.prerequisites || [],
      preventionTips: pattern.preventionTips || [],
      tags: pattern.tags || [],
      stackProfile: pattern.stackProfile,
      successRate: pattern.successRate,
      timesApplied: pattern.timesApplied,
      avgResolutionTime: pattern.avgResolutionTime,
    },
    message: buildRecommendationMessage(pattern, recommendation.confidence, recommendation.matchType),
    nextSteps: [
      'Review the recommended solution pattern',
      'Apply the solution to your codebase',
      'Verify the fix resolves the error',
      'Report back whether the solution worked (for pattern tracking)',
    ],
  };
}

/**
 * Build recommendation message
 */
function buildRecommendationMessage(pattern, confidence, matchType) {
  const confidenceText = confidence >= 0.95 ? 'exact' : confidence >= 0.75 ? 'high' : 'moderate';

  let message = `Found a ${confidenceText} confidence match (${matchType}) for this error.\n\n`;
  message += `**${pattern.title}**\n\n`;
  message += `This pattern has been successfully applied ${pattern.timesApplied} times with a ${pattern.successRate}% success rate.\n`;

  if (pattern.avgResolutionTime > 0) {
    const minutes = Math.round(pattern.avgResolutionTime / 60);
    message += `Average resolution time: ${minutes} minutes.\n`;
  }

  message += `\nCategory: ${pattern.problemCategory}\n`;
  message += `Stack: ${pattern.stackProfile}\n`;

  return message;
}

/**
 * Estimate token count
 */
function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

module.exports = {
  getSolutionRecommendation,
};
