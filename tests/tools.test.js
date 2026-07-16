/**
 * Unit tests for MCP tools
 * Tests individual tool functionality
 */

const mongoose = require('mongoose');
const axios = require('axios');
const { getRequirements } = require('../tools/getRequirements');
const { getBlueprint } = require('../tools/getBlueprint');
const { executeWorkOrder } = require('../tools/executeWorkOrder');
const { reportCompletion } = require('../tools/reportCompletion');

// Mock axios
jest.mock('axios');

describe('MCP Tool: get_requirements', () => {
  let authContext;

  beforeEach(() => {
    authContext = {
      userId: new mongoose.Types.ObjectId(),
      companyId: new mongoose.Types.ObjectId(),
      sessionId: 'test-session',
      connectionId: new mongoose.Types.ObjectId(),
    };
  });

  test('should fetch requirements for valid work order', async () => {
    const workOrderId = new mongoose.Types.ObjectId();

    // Mock API response
    axios.get.mockResolvedValue({
      data: {
        data: {
          _id: workOrderId,
          ticketId: 'FLORA-123',
          requestText: 'Build a new authentication system',
          requestType: 'feature',
          priority: 'high',
          status: 'spec_approved',
          companyId: authContext.companyId,
          companyName: 'Test Company',
          aiAnalysis: {
            requirements: ['Implement JWT authentication', 'Add password hashing'],
            acceptanceCriteria: ['Users can log in', 'Passwords are secure'],
            estimatedEffort: '8 hours',
          },
        },
      },
    });

    const result = await getRequirements({ workOrderId: workOrderId.toString() }, authContext);

    expect(result.content).toBeDefined();
    expect(result.content[0].type).toBe('text');

    const data = JSON.parse(result.content[0].text);
    expect(data.workOrderId).toBeDefined();
    expect(data.technicalSpec).toBeDefined();
    expect(data.technicalSpec.requirements).toBeInstanceOf(Array);
  });

  test('should reject access to work order from different company', async () => {
    const workOrderId = new mongoose.Types.ObjectId();
    const differentCompanyId = new mongoose.Types.ObjectId();

    axios.get.mockResolvedValue({
      data: {
        data: {
          _id: workOrderId,
          companyId: differentCompanyId,
        },
      },
    });

    const result = await getRequirements({ workOrderId: workOrderId.toString() }, authContext);

    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toContain('Access denied');
  });
});

describe('MCP Tool: get_blueprint', () => {
  let authContext;

  beforeEach(() => {
    authContext = {
      userId: new mongoose.Types.ObjectId(),
      companyId: new mongoose.Types.ObjectId(),
      sessionId: 'test-session',
      connectionId: new mongoose.Types.ObjectId(),
    };
  });

  test('should generate blueprint for work order', async () => {
    const workOrderId = new mongoose.Types.ObjectId();

    axios.get.mockResolvedValue({
      data: {
        data: {
          _id: workOrderId,
          ticketId: 'FLORA-456',
          requestText: 'Create REST API for user management',
          requestType: 'api',
          companyId: authContext.companyId,
          companyName: 'Test Company',
        },
      },
    });

    const result = await getBlueprint({ workOrderId: workOrderId.toString() }, authContext);

    expect(result.content).toBeDefined();
    const data = JSON.parse(result.content[0].text);

    expect(data.architecture).toBeDefined();
    expect(data.fileStructure).toBeDefined();
    expect(data.dependencies).toBeDefined();
    expect(data.fileStructure.files).toBeInstanceOf(Array);
  });

  test('should include appropriate files based on request type', async () => {
    const workOrderId = new mongoose.Types.ObjectId();

    axios.get.mockResolvedValue({
      data: {
        data: {
          _id: workOrderId,
          requestText: 'Build API with database models and authentication',
          requestType: 'api',
          companyId: authContext.companyId,
        },
      },
    });

    const result = await getBlueprint({ workOrderId: workOrderId.toString() }, authContext);

    const data = JSON.parse(result.content[0].text);
    const filePaths = data.fileStructure.files.map(f => f.path);

    expect(filePaths.some(p => p.includes('routes'))).toBe(true);
    expect(filePaths.some(p => p.includes('models'))).toBe(true);
    expect(filePaths.some(p => p.includes('middleware'))).toBe(true);
  });
});

describe('MCP Tool: execute_work_order', () => {
  let authContext;

  beforeEach(() => {
    authContext = {
      userId: new mongoose.Types.ObjectId(),
      companyId: new mongoose.Types.ObjectId(),
      sessionId: 'test-session',
      connectionId: new mongoose.Types.ObjectId(),
    };
  });

  test('should generate execution plan with steps', async () => {
    const workOrderId = new mongoose.Types.ObjectId();

    axios.get.mockResolvedValue({
      data: {
        data: {
          _id: workOrderId,
          requestText: 'Implement user authentication with JWT',
          requestType: 'feature',
          priority: 'high',
          companyId: authContext.companyId,
        },
      },
    });

    const result = await executeWorkOrder({ workOrderId: workOrderId.toString() }, authContext);

    expect(result.content).toBeDefined();
    const data = JSON.parse(result.content[0].text);

    expect(data.steps).toBeInstanceOf(Array);
    expect(data.steps.length).toBeGreaterThan(0);
    expect(data.prerequisites).toBeInstanceOf(Array);
    expect(data.verification).toBeInstanceOf(Array);
    expect(data.bestPractices).toBeInstanceOf(Array);
  });

  test('should include security considerations for auth-related requests', async () => {
    const workOrderId = new mongoose.Types.ObjectId();

    axios.get.mockResolvedValue({
      data: {
        data: {
          _id: workOrderId,
          requestText: 'Build authentication system with password reset',
          companyId: authContext.companyId,
        },
      },
    });

    const result = await executeWorkOrder({ workOrderId: workOrderId.toString() }, authContext);

    const data = JSON.parse(result.content[0].text);
    const securityText = JSON.stringify(data.security);

    expect(securityText).toContain('password');
    expect(securityText).toContain('bcrypt');
  });
});

describe('MCP Tool: report_completion', () => {
  let authContext;

  beforeEach(() => {
    authContext = {
      userId: new mongoose.Types.ObjectId(),
      companyId: new mongoose.Types.ObjectId(),
      sessionId: 'test-session',
      connectionId: new mongoose.Types.ObjectId(),
    };
  });

  test('should report successful completion', async () => {
    const workOrderId = new mongoose.Types.ObjectId();

    axios.get.mockResolvedValue({
      data: {
        data: {
          _id: workOrderId,
          ticketId: 'FLORA-789',
          companyId: authContext.companyId,
        },
      },
    });

    axios.patch.mockResolvedValue({ data: { success: true } });

    const result = await reportCompletion(
      {
        workOrderId: workOrderId.toString(),
        status: 'completed',
        artifacts: {
          filesCreated: ['src/auth.js', 'tests/auth.test.js'],
          filesModified: ['src/routes.js'],
          commitHash: 'abc123def456',
        },
        notes: 'Implemented authentication successfully',
      },
      authContext
    );

    expect(result.content).toBeDefined();
    const data = JSON.parse(result.content[0].text);

    expect(data.success).toBe(true);
    expect(data.status).toBe('completed');
    expect(data.artifacts.filesCreated).toBe(2);
  });

  test('should validate status values', async () => {
    const workOrderId = new mongoose.Types.ObjectId();

    axios.get.mockResolvedValue({
      data: {
        data: {
          _id: workOrderId,
          companyId: authContext.companyId,
        },
      },
    });

    const result = await reportCompletion(
      {
        workOrderId: workOrderId.toString(),
        status: 'invalid_status',
      },
      authContext
    );

    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toContain('Invalid status');
  });
});
