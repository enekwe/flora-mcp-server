#!/usr/bin/env node

/**
 * Flora MCP Server - CC-E0-3: MCP Server Foundation
 *
 * Implements MCP Protocol version "2024-11-05" with stdio and SSE transports
 * Provides work order management tools for Claude Code, Cursor, and other MCP clients
 *
 * MCP Tools:
 * - get_requirements(workOrderId) - Fetch technical specifications
 * - get_blueprint(workOrderId) - Get architecture diagram and file list
 * - execute_work_order(workOrderId) - Step-by-step implementation instructions
 * - report_completion(workOrderId, status, artifacts) - Update deployment status
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load environment configuration
dotenv.config();

// Import tools
const { getRequirements } = require('./tools/getRequirements');
const { getBlueprint } = require('./tools/getBlueprint');
const { executeWorkOrder } = require('./tools/executeWorkOrder');
const { reportCompletion } = require('./tools/reportCompletion');
const { getWorkOrder } = require('./tools/getWorkOrder'); // CC-E3-2

// Import authentication
const { authenticateJWT, validateMcpConnection } = require('./auth/jwtAuth');

// Import AuditLog model
const AuditLog = require('../../models/AuditLog');

// Import logger
const logger = require('./src/config/logger');

// Configuration
const MCP_PROTOCOL_VERSION = '2024-11-05';
const SERVER_NAME = 'flora-mcp-server';
const SERVER_VERSION = '1.0.0';
const PORT = process.env.MCP_SERVER_PORT || 3001;
const TRANSPORT_MODE = process.env.MCP_TRANSPORT_MODE || 'stdio'; // stdio or sse

/**
 * Flora MCP Server Class
 * Implements MCP protocol with authentication and audit logging
 */
class FloraMcpServer {
  constructor() {
    this.server = new Server(
      {
        name: SERVER_NAME,
        version: SERVER_VERSION,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.authContext = null;
    this.setupToolHandlers();
  }

  /**
   * Setup MCP tool handlers
   * Each tool is registered with the MCP server and includes audit logging
   */
  setupToolHandlers() {
    // List available tools
    this.server.setRequestHandler('tools/list', async () => {
      return {
        tools: [
          {
            name: 'get_work_order',
            description: 'CC-E3-2: Fetch complete work order details by UUID. Returns work order JSON with implementation instructions, affected files, acceptance criteria, and stack information. This is the primary tool for retrieving work order artifacts.',
            inputSchema: {
              type: 'object',
              properties: {
                workOrderId: {
                  type: 'string',
                  description: 'The unique work order UUID',
                },
              },
              required: ['workOrderId'],
            },
          },
          {
            name: 'get_requirements',
            description: 'Fetch technical specifications for a work order. Returns TechnicalSpec JSON with requirements, acceptance criteria, and constraints.',
            inputSchema: {
              type: 'object',
              properties: {
                workOrderId: {
                  type: 'string',
                  description: 'The unique identifier of the work order (CommandRequest ID)',
                },
              },
              required: ['workOrderId'],
            },
          },
          {
            name: 'get_blueprint',
            description: 'Get architecture diagram and file structure for a work order. Returns blueprint with system architecture, file list, and dependencies.',
            inputSchema: {
              type: 'object',
              properties: {
                workOrderId: {
                  type: 'string',
                  description: 'The unique identifier of the work order',
                },
              },
              required: ['workOrderId'],
            },
          },
          {
            name: 'execute_work_order',
            description: 'Get step-by-step implementation instructions for a work order. Returns actionable tasks with code examples and verification steps.',
            inputSchema: {
              type: 'object',
              properties: {
                workOrderId: {
                  type: 'string',
                  description: 'The unique identifier of the work order',
                },
              },
              required: ['workOrderId'],
            },
          },
          {
            name: 'report_completion',
            description: 'CC-E3-3: Report work order completion with artifacts and status. Updates WorkOrder model and sends Slack notification to founder. Triggers Code Review gate (Gate 2) when completed successfully.',
            inputSchema: {
              type: 'object',
              properties: {
                workOrderId: {
                  type: 'string',
                  description: 'The unique work order UUID',
                },
                status: {
                  type: 'string',
                  enum: ['completed', 'failed', 'blocked'],
                  description: 'Completion status',
                },
                artifacts: {
                  type: 'object',
                  description: 'Artifacts produced during work order execution',
                  properties: {
                    filesCreated: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          filePath: { type: 'string' },
                          size: { type: 'number' },
                          linesOfCode: { type: 'number' },
                        },
                      },
                      description: 'List of files created with metadata',
                    },
                    filesModified: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          filePath: { type: 'string' },
                          changesSummary: { type: 'string' },
                          linesChanged: { type: 'number' },
                        },
                      },
                      description: 'List of files modified with metadata',
                    },
                    testsAdded: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          testFile: { type: 'string' },
                          testCases: { type: 'array', items: { type: 'string' } },
                          coveragePercent: { type: 'number' },
                        },
                      },
                      description: 'List of test files added',
                    },
                    commitHash: {
                      type: 'string',
                      description: 'Git commit hash',
                    },
                    branchName: {
                      type: 'string',
                      description: 'Git branch name',
                    },
                    pullRequestUrl: {
                      type: 'string',
                      description: 'Pull request URL (if created)',
                    },
                    actualTokens: {
                      type: 'number',
                      description: 'Actual tokens consumed during execution',
                    },
                  },
                },
                executionLog: {
                  type: 'string',
                  description: 'Execution log from MCP client',
                },
                testResults: {
                  type: 'object',
                  description: 'Test results keyed by acceptance criterion',
                },
              },
              required: ['workOrderId', 'status'],
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler('tools/call', async (request) => {
      const { name, arguments: args } = request.params;

      // Validate authentication context
      if (!this.authContext) {
        logger.error('MCP tool call without authentication context', { toolName: name });
        throw new Error('Authentication required. Please provide valid JWT token in connection params.');
      }

      const startTime = Date.now();
      let toolResult;
      let success = true;
      let errorMessage = null;

      try {
        // Route to appropriate tool handler
        switch (name) {
          case 'get_work_order': // CC-E3-2
            toolResult = await getWorkOrder(args, this.authContext);
            break;
          case 'get_requirements':
            toolResult = await getRequirements(args, this.authContext);
            break;
          case 'get_blueprint':
            toolResult = await getBlueprint(args, this.authContext);
            break;
          case 'execute_work_order':
            toolResult = await executeWorkOrder(args, this.authContext);
            break;
          case 'report_completion': // CC-E3-3 (updated)
            toolResult = await reportCompletion(args, this.authContext);
            break;
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        success = false;
        errorMessage = error.message;
        logger.error(`MCP tool call failed: ${name}`, {
          error: error.message,
          userId: this.authContext.userId,
          workOrderId: args.workOrderId,
        });
        toolResult = {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: error.message,
                tool: name,
                timestamp: new Date().toISOString(),
              }),
            },
          ],
          isError: true,
        };
      }

      // Log to AuditLog for compliance
      await this.logToolInvocation({
        toolName: name,
        params: args,
        userId: this.authContext.userId,
        companyId: this.authContext.companyId,
        sessionId: this.authContext.sessionId,
        ipAddress: this.authContext.ipAddress,
        success,
        errorMessage,
        responseTime: Date.now() - startTime,
      });

      return toolResult;
    });
  }

  /**
   * Log tool invocation to AuditLog model
   * Required for compliance and security monitoring
   */
  async logToolInvocation(data) {
    try {
      await AuditLog.createSecureLog({
        eventType: 'system:integration_sync',
        category: 'system',
        severity: data.success ? 'low' : 'medium',
        userId: data.userId,
        action: `MCP Tool: ${data.toolName}`,
        description: `MCP tool invocation: ${data.toolName} with params ${JSON.stringify(data.params)}`,
        ipAddress: data.ipAddress || '0.0.0.0',
        sessionId: data.sessionId,
        success: data.success,
        errorMessage: data.errorMessage,
        performanceMetrics: {
          responseTime: data.responseTime,
        },
        metadata: new Map([
          ['toolName', data.toolName],
          ['params', JSON.stringify(data.params)],
          ['companyId', data.companyId?.toString()],
          ['mcpProtocolVersion', MCP_PROTOCOL_VERSION],
        ]),
      });
    } catch (error) {
      logger.error('Failed to log MCP tool invocation to AuditLog', {
        error: error.message,
        toolName: data.toolName,
      });
    }
  }

  /**
   * Set authentication context from connection params
   * Validates JWT token and establishes user session
   */
  async setAuthContext(connectionParams) {
    try {
      const token = connectionParams?.apiToken || connectionParams?.token;
      if (!token) {
        throw new Error('Missing API token in connection params');
      }

      // Validate JWT and get user context
      this.authContext = await authenticateJWT(token);

      // Validate MCP connection permissions
      await validateMcpConnection(this.authContext);

      logger.info('MCP connection authenticated', {
        userId: this.authContext.userId,
        companyId: this.authContext.companyId,
        sessionId: this.authContext.sessionId,
      });
    } catch (error) {
      logger.error('MCP authentication failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Connect to MongoDB database
   */
  async connectDatabase() {
    try {
      const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/flora';
      await mongoose.connect(mongoUri);
      logger.info('Connected to MongoDB', { uri: mongoUri.replace(/\/\/.*@/, '//***@') });
    } catch (error) {
      logger.error('Failed to connect to MongoDB', { error: error.message });
      throw error;
    }
  }

  /**
   * Start MCP server with stdio transport (for local development)
   */
  async startStdio(connectionParams = {}) {
    try {
      await this.connectDatabase();

      // Set auth context from connection params
      if (connectionParams.apiToken) {
        await this.setAuthContext(connectionParams);
      }

      const transport = new StdioServerTransport();
      await this.server.connect(transport);

      logger.info('Flora MCP Server started with stdio transport', {
        protocol: MCP_PROTOCOL_VERSION,
        transport: 'stdio',
      });
    } catch (error) {
      logger.error('Failed to start MCP server with stdio', { error: error.message });
      throw error;
    }
  }

  /**
   * Start MCP server with SSE transport (for cloud deployment)
   */
  async startSSE() {
    try {
      await this.connectDatabase();

      const app = express();
      app.use(express.json());

      // SSE endpoint for MCP connections
      app.get('/sse', async (req, res) => {
        try {
          // Extract JWT from Authorization header
          const authHeader = req.headers.authorization;
          if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Missing or invalid authorization header' });
          }

          const token = authHeader.substring(7);
          await this.setAuthContext({ apiToken: token });

          const transport = new SSEServerTransport('/message', res);
          await this.server.connect(transport);

          logger.info('SSE connection established', {
            userId: this.authContext.userId,
            ip: req.ip,
          });
        } catch (error) {
          logger.error('SSE connection failed', { error: error.message });
          res.status(401).json({ error: error.message });
        }
      });

      // Message endpoint for MCP protocol
      app.post('/message', async (req, res) => {
        try {
          // Handle MCP protocol messages
          res.json({ received: true });
        } catch (error) {
          logger.error('MCP message handling failed', { error: error.message });
          res.status(500).json({ error: error.message });
        }
      });

      // Health check endpoint
      app.get('/health', (req, res) => {
        res.json({
          status: 'healthy',
          service: SERVER_NAME,
          version: SERVER_VERSION,
          protocol: MCP_PROTOCOL_VERSION,
          transport: 'sse',
          timestamp: new Date().toISOString(),
        });
      });

      app.listen(PORT, () => {
        logger.info('Flora MCP Server started with SSE transport', {
          protocol: MCP_PROTOCOL_VERSION,
          transport: 'sse',
          port: PORT,
          url: `http://localhost:${PORT}`,
        });
      });
    } catch (error) {
      logger.error('Failed to start MCP server with SSE', { error: error.message });
      throw error;
    }
  }
}

/**
 * Main entry point
 * Starts the MCP server in the configured transport mode
 */
async function main() {
  try {
    const server = new FloraMcpServer();

    // Check if running as stdio or SSE
    if (TRANSPORT_MODE === 'sse') {
      await server.startSSE();
    } else {
      // For stdio mode, connection params can be passed via environment
      const connectionParams = {
        apiToken: process.env.MCP_API_TOKEN,
      };
      await server.startStdio(connectionParams);
    }
  } catch (error) {
    logger.error('Fatal error starting Flora MCP Server', { error: error.message });
    process.exit(1);
  }
}

// Start server if run directly
if (require.main === module) {
  main();
}

module.exports = FloraMcpServer;
