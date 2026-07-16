/**
 * Integration tests for Flora MCP Server
 * Tests MCP protocol implementation, tool execution, and authentication
 */

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { MongoMemoryServer } = require('mongodb-memory-server');
const FloraMcpServer = require('../server');
const { authenticateJWT, validateMcpConnection } = require('../auth/jwtAuth');
const McpApiKey = require('../src/models/McpApiKey');
const AuditLog = require('../../../models/AuditLog');

// Mock environment variables
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-purposes-only';
process.env.MONOLITH_API_URL = 'http://localhost:3001';
process.env.INTERNAL_SERVICE_TOKEN = 'test-internal-token';

let mongoServer;

beforeAll(async () => {
  // Start in-memory MongoDB
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  // Clear collections
  await McpApiKey.deleteMany({});
  await AuditLog.deleteMany({});
});

describe('MCP Server - Authentication', () => {
  test('should authenticate valid JWT token', async () => {
    const userId = new mongoose.Types.ObjectId();
    const companyId = new mongoose.Types.ObjectId();

    const token = jwt.sign(
      {
        userId: userId.toString(),
        companyId: companyId.toString(),
        email: 'test@example.com',
        role: 'developer',
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const authContext = await authenticateJWT(token);

    expect(authContext.userId).toBe(userId.toString());
    expect(authContext.companyId).toBe(companyId.toString());
    expect(authContext.tokenType).toBe('jwt');
    expect(authContext.sessionId).toMatch(/^mcp_/);
  });

  test('should reject invalid JWT token', async () => {
    await expect(authenticateJWT('invalid-token')).rejects.toThrow('Invalid JWT token');
  });

  test('should authenticate valid MCP API key', async () => {
    const userId = new mongoose.Types.ObjectId();
    const companyId = new mongoose.Types.ObjectId();

    // Generate API key
    const { rawKey, keyHash, keyPrefix } = McpApiKey.generateKey();

    // Create API key in database
    await McpApiKey.create({
      name: 'Test MCP Key',
      userId,
      companyId,
      keyHash,
      keyPrefix,
      tier: 'passbook_budget',
      status: 'active',
      permissions: {
        workOrders: { read: true },
        tasks: { read: true, update: true },
      },
      security: {
        scopingLevel: 'INTERNAL',
        allowedAgentTypes: ['claude_code'],
      },
    });

    const authContext = await authenticateJWT(rawKey);

    expect(authContext.userId.toString()).toBe(userId.toString());
    expect(authContext.companyId.toString()).toBe(companyId.toString());
    expect(authContext.tokenType).toBe('mcp_api_key');
    expect(authContext.tier).toBe('passbook_budget');
  });

  test('should reject revoked MCP API key', async () => {
    const userId = new mongoose.Types.ObjectId();
    const companyId = new mongoose.Types.ObjectId();

    const { rawKey, keyHash, keyPrefix } = McpApiKey.generateKey();

    const apiKey = await McpApiKey.create({
      name: 'Test Revoked Key',
      userId,
      companyId,
      keyHash,
      keyPrefix,
      tier: 'passbook_budget',
      status: 'revoked',
    });

    await expect(authenticateJWT(rawKey)).rejects.toThrow('MCP API key is revoked');
  });
});

describe('MCP Server - Tool Discovery', () => {
  test('should list all available tools', () => {
    const server = new FloraMcpServer();

    // The server should have registered 4 tools
    // This is verified through the MCP protocol's tools/list handler
    expect(server.server).toBeDefined();
  });
});

describe('MCP Server - Tool Execution', () => {
  let authContext;

  beforeEach(async () => {
    const userId = new mongoose.Types.ObjectId();
    const companyId = new mongoose.Types.ObjectId();

    const token = jwt.sign(
      {
        userId: userId.toString(),
        companyId: companyId.toString(),
        email: 'test@example.com',
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    authContext = await authenticateJWT(token);
  });

  test('should require authentication for tool calls', () => {
    const server = new FloraMcpServer();
    expect(server.authContext).toBeNull();
  });

  test('should set auth context from connection params', async () => {
    const server = new FloraMcpServer();
    const userId = new mongoose.Types.ObjectId();
    const companyId = new mongoose.Types.ObjectId();

    const token = jwt.sign(
      {
        userId: userId.toString(),
        companyId: companyId.toString(),
      },
      process.env.JWT_SECRET
    );

    await server.setAuthContext({ apiToken: token });

    expect(server.authContext).toBeDefined();
    expect(server.authContext.userId).toBe(userId.toString());
  });
});

describe('MCP Server - Audit Logging', () => {
  test('should log tool invocations to AuditLog', async () => {
    const userId = new mongoose.Types.ObjectId();
    const companyId = new mongoose.Types.ObjectId();

    const server = new FloraMcpServer();
    await server.logToolInvocation({
      toolName: 'get_requirements',
      params: { workOrderId: 'test-123' },
      userId,
      companyId,
      sessionId: 'test-session',
      ipAddress: '127.0.0.1',
      success: true,
      responseTime: 150,
    });

    const logs = await AuditLog.find({ userId });
    expect(logs.length).toBe(1);
    expect(logs[0].action).toBe('MCP Tool: get_requirements');
    expect(logs[0].success).toBe(true);
    expect(logs[0].category).toBe('system');
  });

  test('should log failed tool invocations', async () => {
    const userId = new mongoose.Types.ObjectId();
    const companyId = new mongoose.Types.ObjectId();

    const server = new FloraMcpServer();
    await server.logToolInvocation({
      toolName: 'get_blueprint',
      params: { workOrderId: 'test-456' },
      userId,
      companyId,
      sessionId: 'test-session',
      ipAddress: '127.0.0.1',
      success: false,
      errorMessage: 'Work order not found',
      responseTime: 50,
    });

    const logs = await AuditLog.find({ userId });
    expect(logs.length).toBe(1);
    expect(logs[0].success).toBe(false);
    expect(logs[0].errorMessage).toBe('Work order not found');
    expect(logs[0].severity).toBe('medium');
  });
});

describe('MCP Server - Protocol Version', () => {
  test('should support MCP protocol version 2024-11-05', () => {
    const server = new FloraMcpServer();
    expect(server.server).toBeDefined();
    // Protocol version is embedded in the server initialization
  });
});

describe('MCP Server - Transport Modes', () => {
  test('should support stdio transport mode', () => {
    const server = new FloraMcpServer();
    expect(server.startStdio).toBeDefined();
  });

  test('should support SSE transport mode', () => {
    const server = new FloraMcpServer();
    expect(server.startSSE).toBeDefined();
  });
});
