const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const database = require('./config/database');
const logger = require('./config/logger');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { mcpAuthMiddleware, mcpRbacMiddleware, mcpRateLimitMiddleware } = require('./middleware/mcpAuth');

// MCP tool handlers
const { handleWorkOrdersList, handleWorkOrdersGet } = require('./tools/workOrders');
const { handleTaskUpdateStatus, handleTasksList } = require('./tools/taskStatus');
const { handleProviderProxy } = require('./tools/providerProxy');
const { handleContextBoundaryCheck } = require('./tools/contextBoundary');
const { handlePromptVaultStore, handlePromptVaultRetrieve } = require('./tools/promptVault');

// Models
const McpApiKey = require('./models/McpApiKey');
const McpConnection = require('./models/McpConnection');

/**
 * Flora MCP Server Microservice
 *
 * The IDE/CLI bridge connecting local coding agents (Claude Code, Cursor,
 * VS Code, Qwen Code) to Flora Command Center's safety harness.
 *
 * MCP Tools provided:
 *   work_orders/list   — Fetch approved work orders for local agents
 *   work_orders/get    — Get detailed work order by ID
 *   tasks/update_status — Update task status from local agent
 *   tasks/list         — List tasks assigned to user/company
 *   provider/proxy     — Proxy LLM calls through Flora's ProviderRoutingService
 *   context/boundary   — Check and apply context boundaries + PII redaction
 *   prompts/log        — Store interactions in the Prompt Vault
 *   prompts/retrieve   — Retrieve vault entries (requires vault:read permission)
 *
 * Architecture: This microservice sits between the local IDE agent and
 * Flora's Control Plane (command-center-service + monolith), enforcing:
 *   - BYOK budget enforcement (3-tier)
 *   - Context boundary scoping (PUBLIC/INTERNAL/CONFIDENTIAL/RESTRICTED)
 *   - PII redaction (9 patterns)
 *   - Audit trail (all interactions logged in Prompt Vault)
 *   - Agent type restrictions (per API key configuration)
 */

class FloraMcpServerMicroservice {
  constructor() {
    this.app = express();
  }

  async initialize() {
    try {
      logger.info('Initializing Flora MCP Server Microservice...');

      await database.connect();
      this.setupMiddleware();
      this.setupMcpRoutes();
      this.setupManagementRoutes();
      this.setupHealthCheck();

      logger.info('Flora MCP Server Microservice initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Flora MCP Server Microservice:', error);
      throw error;
    }
  }

  /**
   * Setup Express middleware — security, CORS, rate limiting, body parsing
   */
  setupMiddleware() {
    this.app.set('trust proxy', 1);

    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    this.app.use(cors({
      origin: config.ALLOWED_ORIGINS,
      credentials: true
    }));

    const limiter = rateLimit({
      windowMs: config.RATE_LIMIT_WINDOW_MS,
      max: config.RATE_LIMIT_MAX_REQUESTS,
      message: 'Too many requests from this IP, please try again later.'
    });
    this.app.use('/api/', limiter);

    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    this.app.use((req, res, next) => {
      logger.info(`HTTP ${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        mcpAgent: req.headers['x-mcp-agent-type'] || 'unknown'
      });
      next();
    });
  }

  /**
   * MCP Tool Routes — the core MCP protocol endpoints
   *
   * Each route follows the MCP tool call pattern:
   *   POST /api/mcp/tools/<tool_name>
   *   Body: { args: { ... } }
   *   Auth: mcpAuthMiddleware (validates API key + session)
   *   RBAC: mcpRbacMiddleware where applicable
   *   Response: { content: [{ type: 'text', text: JSON.stringify(result) }] }
   */
  setupMcpRoutes() {
    const mcpRouter = express.Router();

    // All MCP tool routes require authentication
    mcpRouter.use(mcpAuthMiddleware);
    mcpRouter.use(mcpRateLimitMiddleware);

    // ── Work Orders ──────────────────────────────────────────────────────────

    mcpRouter.post('/tools/work_orders/list',
      mcpRbacMiddleware('workOrders', 'read'),
      async (req, res) => {
        try {
          const result = await handleWorkOrdersList(req.body.args || req.body, req.mcpAuth);
          res.json({ success: true, ...result });
        } catch (error) {
          next(error);
        }
      }
    );

    mcpRouter.post('/tools/work_orders/get',
      mcpRbacMiddleware('workOrders', 'read'),
      async (req, res) => {
        try {
          const result = await handleWorkOrdersGet(req.body.args || req.body, req.mcpAuth);
          res.json({ success: true, ...result });
        } catch (error) {
          next(error);
        }
      }
    );

    // ── Task Status ──────────────────────────────────────────────────────────

    mcpRouter.post('/tools/tasks/update_status',
      mcpRbacMiddleware('tasks', 'update'),
      async (req, res) => {
        try {
          const result = await handleTaskUpdateStatus(req.body.args || req.body, req.mcpAuth);
          res.json({ success: true, ...result });
        } catch (error) {
          next(error);
        }
      }
    );

    mcpRouter.post('/tools/tasks/list',
      mcpRbacMiddleware('tasks', 'read'),
      async (req, res) => {
        try {
          const result = await handleTasksList(req.body.args || req.body, req.mcpAuth);
          res.json({ success: true, ...result });
        } catch (error) {
          next(error);
        }
      }
    );

    // ── Provider Routing Proxy ───────────────────────────────────────────────

    mcpRouter.post('/tools/provider/proxy',
      mcpRbacMiddleware('providerRouting', 'use'),
      async (req, res) => {
        try {
          const result = await handleProviderProxy(req.body.args || req.body, req.mcpAuth);
          res.json({ success: true, ...result });
        } catch (error) {
          next(error);
        }
      }
    );

    // ── Context Boundary ──────────────────────────────────────────────────────

    mcpRouter.post('/tools/context/boundary',
      mcpRbacMiddleware('contextBoundary', 'enforce'),
      async (req, res) => {
        try {
          const result = await handleContextBoundaryCheck(req.body.args || req.body, req.mcpAuth);
          res.json({ success: true, ...result });
        } catch (error) {
          next(error);
        }
      }
    );

    // ── Prompt Vault ──────────────────────────────────────────────────────────

    mcpRouter.post('/tools/prompts/log',
      mcpRbacMiddleware('promptVault', 'store'),
      async (req, res) => {
        try {
          const result = await handlePromptVaultStore(req.body.args || req.body, req.mcpAuth);
          res.json({ success: true, ...result });
        } catch (error) {
          next(error);
        }
      }
    );

    mcpRouter.post('/tools/prompts/retrieve',
      mcpRbacMiddleware('promptVault', 'read'),
      async (req, res) => {
        try {
          const result = await handlePromptVaultRetrieve(req.body.args || req.body, req.mcpAuth);
          res.json({ success: true, ...result });
        } catch (error) {
          next(error);
        }
      }
    );

    this.app.use('/api/mcp', mcpRouter);
  }

  /**
   * Management Routes — API key CRUD, connection monitoring, admin controls
   * These routes use standard JWT auth (not MCP auth)
   */
  setupManagementRoutes() {
    const mgmtRouter = express.Router();

    // ── API Key Management ───────────────────────────────────────────────────

    // Generate a new MCP API key
    mgmtRouter.post('/api-keys', async (req, res, next) => {
      try {
        const { userId, companyId, name, description, tier, siteId, permissions, security } = req.body;

        const { rawKey, keyHash, keyPrefix } = McpApiKey.generateKey();

        const apiKey = await McpApiKey.create({
          name: name || `MCP Key - ${tier}`,
          description,
          userId,
          companyId,
          siteId: siteId || null,
          keyHash,
          keyPrefix,
          tier: tier || 'passbook_budget',
          budgetLimits: tier === 'passbook_budget'
            ? { monthlyTokenCap: 500000, monthlyCostCap: 50, perRequestTokenCap: 10000 }
            : tier === 'company_byok'
            ? { monthlyTokenCap: null, monthlyCostCap: null, perRequestTokenCap: 50000 }
            : { monthlyTokenCap: null, monthlyCostCap: null, perRequestTokenCap: 10000 },
          permissions: permissions || {
            workOrders: { read: true, update: false },
            tasks: { read: true, update: true, create: false },
            providerRouting: { use: true },
            contextBoundary: { read: true, enforce: true },
            promptVault: { read: false, store: true }
          },
          security: security || {
            allowedAgentTypes: [],
            scopingLevel: 'INTERNAL',
            dataResidencyRegion: null,
            ipWhitelist: []
          },
          createdBy: userId
        });

        logger.info(`MCP API key created: id=${apiKey._id} tier=${apiKey.tier} company=${companyId}`);

        res.status(201).json({
          success: true,
          data: {
            id: apiKey._id,
            name: apiKey.name,
            keyPrefix: apiKey.keyPrefix,
            rawKey,
            tier: apiKey.tier,
            budgetLimits: apiKey.budgetLimits,
            permissions: apiKey.permissions,
            security: apiKey.security,
            createdAt: apiKey.createdAt
          },
          message: 'Save the rawKey securely — it will not be shown again.'
        });
      } catch (error) {
        next(error);
      }
    });

    // List API keys for a company
    mgmtRouter.get('/api-keys/company/:companyId', async (req, res, next) => {
      try {
        const keys = await McpApiKey.findByCompany(req.params.companyId);
        res.json({
          success: true,
          data: keys.map(k => ({
            id: k._id,
            name: k.name,
            keyPrefix: k.keyPrefix,
            tier: k.tier,
            status: k.status,
            permissions: k.permissions,
            security: k.security,
            usage: k.usage,
            budgetLimits: k.budgetLimits,
            createdAt: k.createdAt,
            expiresAt: k.expiresAt
          }))
        });
      } catch (error) {
        next(error);
      }
    });

    // Get single API key details
    mgmtRouter.get('/api-keys/:id', async (req, res, next) => {
      try {
        const key = await McpApiKey.findById(req.params.id);
        if (!key) {
          return res.status(404).json({ success: false, message: 'API key not found' });
        }
        res.json({
          success: true,
          data: {
            id: key._id,
            name: key.name,
            keyPrefix: key.keyPrefix,
            tier: key.tier,
            status: key.status,
            permissions: key.permissions,
            security: key.security,
            usage: key.usage,
            budgetLimits: key.budgetLimits,
            allowedAgentTypes: key.security.allowedAgentTypes,
            createdAt: key.createdAt,
            expiresAt: key.expiresAt
          }
        });
      } catch (error) {
        next(error);
      }
    });

    // Update API key permissions/security
    mgmtRouter.patch('/api-keys/:id', async (req, res, next) => {
      try {
        const { permissions, security, budgetLimits, name, description, expiresAt } = req.body;
        const key = await McpApiKey.findById(req.params.id);
        if (!key) {
          return res.status(404).json({ success: false, message: 'API key not found' });
        }

        if (permissions) key.permissions = { ...key.permissions, ...permissions };
        if (security) key.security = { ...key.security, ...security };
        if (budgetLimits) key.budgetLimits = { ...key.budgetLimits, ...budgetLimits };
        if (name) key.name = name;
        if (description) key.description = description;
        if (expiresAt) key.expiresAt = expiresAt;

        await key.save();
        res.json({ success: true, data: key });
      } catch (error) {
        next(error);
      }
    });

    // ── E1-US8: Revoke an MCP API key ────────────────────────────────────────

    mgmtRouter.delete('/api-keys/:id/revoke', async (req, res, next) => {
      try {
        const { reason } = req.body;
        const { revokedBy } = req.body;

        const key = await McpApiKey.findById(req.params.id);
        if (!key) {
          return res.status(404).json({ success: false, message: 'API key not found' });
        }

        await key.revoke(revokedBy, reason || 'Admin revocation');

        const activeConnections = await McpConnection.find({
          apiKeyId: key._id,
          status: { $in: ['active', 'idle'] },
          isDeleted: false
        });

        for (const conn of activeConnections) {
          await conn.revoke(revokedBy, `API key ${key._id} revoked: ${reason}`);
        }

        logger.info(`MCP API key revoked: id=${key._id} reason=${reason} connections_terminated=${activeConnections.length}`);

        res.json({
          success: true,
          data: {
            keyId: key._id,
            status: key.status,
            connectionsTerminated: activeConnections.length,
            revokedAt: key.revokedAt
          }
        });
      } catch (error) {
        next(error);
      }
    });

    // ── Connection Monitoring ─────────────────────────────────────────────────

    // List active MCP connections for a company
    mgmtRouter.get('/connections/company/:companyId', async (req, res, next) => {
      try {
        const connections = await McpConnection.findActiveByCompany(req.params.companyId);
        res.json({
          success: true,
          data: connections.map(c => ({
            id: c._id,
            sessionId: c.sessionId,
            agentType: c.agentType,
            clientName: c.clientName,
            userId: c.userId?.name || c.userId,
            status: c.status,
            currentWorkOrderId: c.currentWorkOrderId,
            lastActivityAt: c.lastActivityAt,
            connectedAt: c.connectedAt,
            metrics: c.metrics,
            securityContext: c.securityContext,
            ipAddress: c.ipAddress,
            durationMinutes: c.durationMinutes
          }))
        });
      } catch (error) {
        next(error);
      }
    });

    // Get connection stats for a company
    mgmtRouter.get('/connections/stats/:companyId', async (req, res, next) => {
      try {
        const stats = await McpConnection.getCompanyStats(req.params.companyId);
        res.json({ success: true, data: stats });
      } catch (error) {
        next(error);
      }
    });

    // Disconnect a specific connection (admin action)
    mgmtRouter.delete('/connections/:sessionId/disconnect', async (req, res, next) => {
      try {
        const connection = await McpConnection.findBySessionId(req.params.sessionId);
        if (!connection) {
          return res.status(404).json({ success: false, message: 'Connection not found' });
        }

        connection.status = 'revoked';
        connection.disconnectedAt = new Date();
        connection.revokedBy = req.body.adminId;
        connection.revocationReason = req.body.reason || 'Admin disconnect';
        await connection.save();

        res.json({
          success: true,
          data: {
            sessionId: connection.sessionId,
            status: connection.status,
            disconnectedAt: connection.disconnectedAt
          }
        });
      } catch (error) {
        next(error);
      }
    });

    // ── .mcp.json Schema ──────────────────────────────────────────────────────

    mgmtRouter.get('/schema/mcp-config', (req, res) => {
      res.json({
        success: true,
        data: {
          schema: {
            type: 'object',
            properties: {
              mcpServers: {
                type: 'object',
                properties: {
                  flora: {
                    type: 'object',
                    properties: {
                      command: {
                        type: 'string',
                        description: 'N/A — Flora MCP uses HTTP transport, not stdio'
                      },
                      url: {
                        type: 'string',
                        description: 'Flora MCP server URL',
                        example: 'https://flora-mcp-server.passbook.vc/api/mcp'
                      },
                      headers: {
                        type: 'object',
                        properties: {
                          Authorization: {
                            type: 'string',
                            description: 'Bearer flora_mcp_<your_api_key>',
                            example: 'Bearer flora_mcp_a1b2c3d4e5f6...'
                          },
                          'X-MCP-Agent-Type': {
                            type: 'string',
                            description: 'Your IDE/CLI agent type',
                            enum: ['claude_code', 'cursor', 'vs_code', 'qwen_code', 'copilot'],
                            example: 'claude_code'
                          },
                          'X-MCP-Client-Name': {
                            type: 'string',
                            description: 'Client name for display',
                            example: 'Claude Code v1.0'
                          }
                        },
                        required: ['Authorization']
                      },
                      transport: {
                        type: 'string',
                        enum: ['http'],
                        default: 'http'
                      }
                    },
                    required: ['url', 'headers']
                  }
                }
              }
            },
            required: ['mcpServers']
          },
          example: {
            mcpServers: {
              flora: {
                url: 'https://flora-mcp-server.passbook.vc/api/mcp',
                headers: {
                  Authorization: 'Bearer flora_mcp_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
                  'X-MCP-Agent-Type': 'claude_code',
                  'X-MCP-Client-Name': 'Claude Code v1.0'
                },
                transport: 'http'
              }
            }
          }
        }
      });
    });

    // Available MCP tools catalog
    mgmtRouter.get('/schema/tools', (req, res) => {
      res.json({
        success: true,
        data: {
          tools: [
            {
              name: 'work_orders/list',
              description: 'Fetch approved work orders available for your company. Returns list of CommandRequests in spec_approved/dev_queue/in_development status.',
              inputSchema: {
                type: 'object',
                properties: {
                  status: { type: 'string', description: 'Filter by status (comma-separated)' },
                  priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
                  limit: { type: 'number', default: 20 },
                  offset: { type: 'number', default: 0 }
                }
              },
              requiredPermission: 'workOrders:read'
            },
            {
              name: 'work_orders/get',
              description: 'Get full details for a specific work order by ID. Includes requirements, acceptance criteria, attachments.',
              inputSchema: {
                type: 'object',
                properties: {
                  workOrderId: { type: 'string', description: 'CommandRequest ID' }
                },
                required: ['workOrderId']
              },
              requiredPermission: 'workOrders:read'
            },
            {
              name: 'tasks/update_status',
              description: 'Update task status from your local IDE/CLI agent. Creates audit trail entry with agent type and session ID.',
              inputSchema: {
                type: 'object',
                properties: {
                  taskId: { type: 'string', description: 'Task ID' },
                  status: { type: 'string', enum: ['todo', 'in_progress', 'completed', 'cancelled', 'blocked'] },
                  progress: { type: 'number', min: 0, max: 100 },
                  notes: { type: 'string' },
                  actualHours: { type: 'number' }
                },
                required: ['taskId', 'status']
              },
              requiredPermission: 'tasks:update'
            },
            {
              name: 'tasks/list',
              description: 'List tasks assigned to you or your company.',
              inputSchema: {
                type: 'object',
                properties: {
                  status: { type: 'string' },
                  priority: { type: 'string' },
                  limit: { type: 'number', default: 20 },
                  offset: { type: 'number', default: 0 }
                }
              },
              requiredPermission: 'tasks:read'
            },
            {
              name: 'provider/proxy',
              description: 'Proxy an LLM call through Flora\'s ProviderRoutingService. Enforces BYOK budgets, selects provider, applies fallback chains.',
              inputSchema: {
                type: 'object',
                properties: {
                  prompt: { type: 'string' },
                  agentType: { type: 'string' },
                  context: { type: 'string' },
                  maxTokens: { type: 'number', default: 2000 },
                  temperature: { type: 'number', default: 0.7 }
                },
                required: ['prompt']
              },
              requiredPermission: 'providerRouting:use'
            },
            {
              name: 'context/boundary',
              description: 'Check and apply context boundaries for content. Enforces PII redaction and data scoping per your company\'s security level.',
              inputSchema: {
                type: 'object',
                properties: {
                  content: { type: 'string', description: 'Content to scope' },
                  operation: { type: 'string', default: 'general' },
                  contentType: { type: 'string', default: 'text' }
                },
                required: ['content']
              },
              requiredPermission: 'contextBoundary:enforce'
            },
            {
              name: 'prompts/log',
              description: 'Store a prompt/response interaction in the Flora Prompt Vault. AES-256-GCM encrypted. Creates audit trail entry.',
              inputSchema: {
                type: 'object',
                properties: {
                  requestId: { type: 'string' },
                  prompt: { type: 'string' },
                  response: { type: 'string' },
                  provider: { type: 'string' },
                  model: { type: 'string' },
                  tokenUsage: { type: 'object' },
                  cost: { type: 'number' },
                  metadata: { type: 'object' }
                },
                required: ['prompt', 'response']
              },
              requiredPermission: 'promptVault:store'
            },
            {
              name: 'prompts/retrieve',
              description: 'Retrieve a vault entry by ID. Requires vault:read permission on your API key.',
              inputSchema: {
                type: 'object',
                properties: {
                  vaultId: { type: 'string', description: 'Vault entry ID' }
                },
                required: ['vaultId']
              },
              requiredPermission: 'promptVault:read'
            }
          ]
        }
      });
    });

    this.app.use(mgmtRouter);
  }

  /**
   * Health check endpoint (required per Railway deployment rules)
   */
  setupHealthCheck() {
    this.app.get('/health', (req, res) => {
      res.json({
        success: true,
        service: config.SERVICE_NAME,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: config.NODE_ENV,
        mcpTools: 8,
        version: '1.0.0'
      });
    });

    this.app.get('/api', (req, res) => {
      res.json({
        success: true,
        service: config.SERVICE_NAME,
        version: '1.0.0',
        description: 'Flora MCP Server — IDE/CLI bridge to Command Center safety harness',
        endpoints: {
          mcpTools: '/api/mcp/tools/*',
          apiKeys: '/api-keys',
          connections: '/connections',
          schema: '/schema/mcp-config',
          health: '/health'
        }
      });
    });
  }

  async start() {
    const PORT = config.PORT; // No fallback - config.PORT already handles this

    logger.info(`[START] Starting server with PORT=${PORT} from config`);
    logger.info(`[START] config.PORT=${config.PORT}, process.env.PORT=${process.env.PORT}`);

    this.server = this.app.listen(PORT, () => {
      logger.info(`Flora MCP Server Microservice running on port ${PORT}`);
      logger.info(`Environment: ${config.NODE_ENV}`);
      const host = config.NODE_ENV === 'production'
        ? `flora-mcp-server.railway.internal`
        : 'localhost';
      logger.info(`Health check: http://${host}:${PORT}/health`);
      logger.info(`MCP tools: http://${host}:${PORT}/api/mcp/tools/*`);
      logger.info(`API key management: http://${host}:${PORT}/api-keys`);
      logger.info(`Schema: http://${host}:${PORT}/schema/mcp-config`);
    });

    process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
  }

  async gracefulShutdown(signal) {
    logger.info(`${signal} received. Starting graceful shutdown...`);

    try {
      if (this.server) {
        this.server.close(() => logger.info('HTTP server closed'));
      }
      await database.disconnect();
      logger.info('Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  }
}

// Error handler must be registered after all routes
const microservice = new FloraMcpServerMicroservice();
microservice.app.use(notFound);
microservice.app.use(errorHandler);

async function main() {
  try {
    await microservice.initialize();
    await microservice.start();
  } catch (error) {
    logger.error('Failed to start Flora MCP Server Microservice:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = FloraMcpServerMicroservice;
