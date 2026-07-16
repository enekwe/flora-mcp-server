/**
 * MCP Tool: execute_work_order
 * Returns step-by-step implementation instructions for a work order
 * Provides actionable tasks with code examples and verification steps
 */

const axios = require('axios');
const logger = require('../src/config/logger');
const { updateConnectionActivity } = require('../auth/jwtAuth');

/**
 * Execute work order - get step-by-step instructions
 * @param {Object} args - Tool arguments
 * @param {string} args.workOrderId - Work order ID
 * @param {Object} authContext - Authentication context
 * @returns {Object} MCP tool response with execution plan
 */
async function executeWorkOrder(args, authContext) {
  const { workOrderId } = args;

  try {
    logger.info('MCP execute_work_order called', {
      workOrderId,
      userId: authContext.userId,
    });

    // Fetch work order details
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

    // Validate access
    if (workOrder.companyId?.toString() !== authContext.companyId?.toString()) {
      throw new Error('Access denied: Work order belongs to different company');
    }

    // Generate execution plan
    const executionPlan = await generateExecutionPlan(workOrder, authContext);

    // Update connection activity
    await updateConnectionActivity(authContext, {
      tokensUsed: estimateTokens(JSON.stringify(executionPlan)),
      cost: 0,
    });

    logger.info('MCP execute_work_order completed', {
      workOrderId,
      stepsCount: executionPlan.steps?.length || 0,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(executionPlan, null, 2),
        },
      ],
    };
  } catch (error) {
    logger.error('MCP execute_work_order failed', {
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
            tool: 'execute_work_order',
            timestamp: new Date().toISOString(),
          }),
        },
      ],
      isError: true,
    };
  }
}

/**
 * Generate execution plan with step-by-step instructions
 */
async function generateExecutionPlan(workOrder, authContext) {
  const requestType = workOrder.requestType || 'general';
  const requestText = workOrder.requestText || '';
  const priority = workOrder.priority || 'medium';

  const plan = {
    workOrderId: workOrder._id || workOrder.id,
    ticketId: workOrder.ticketId,
    title: requestText.substring(0, 100),
    priority,
    estimatedTime: estimateImplementationTime(requestText, priority),

    // Pre-implementation checklist
    prerequisites: [
      'Ensure you have access to the codebase',
      'Review existing code style and conventions',
      'Set up development environment with all dependencies',
      'Create feature branch from main/master',
      'Read related documentation and existing implementations',
    ],

    // Step-by-step implementation instructions
    steps: generateImplementationSteps(requestType, requestText, workOrder),

    // Verification checklist
    verification: [
      {
        step: 'Run all tests',
        command: 'npm test',
        expected: 'All tests pass with no errors',
      },
      {
        step: 'Run linter',
        command: 'npm run lint',
        expected: 'No linting errors',
      },
      {
        step: 'Build the application',
        command: 'npm run build',
        expected: 'Build completes successfully',
      },
      {
        step: 'Manual testing',
        command: 'Test functionality in development environment',
        expected: 'All features work as expected',
      },
      {
        step: 'Code review preparation',
        command: 'Review changes and update documentation',
        expected: 'Code is clean and well-documented',
      },
    ],

    // Best practices
    bestPractices: [
      'Write tests before implementation (TDD)',
      'Follow SOLID principles',
      'Keep functions small and focused (single responsibility)',
      'Use meaningful variable and function names',
      'Add JSDoc comments for all functions',
      'Handle errors gracefully with proper error messages',
      'Log important operations for debugging',
      'Sanitize all user inputs',
      'Use environment variables for configuration',
      'Keep sensitive data out of code (use .env)',
    ],

    // Security considerations
    security: generateSecurityConsiderations(requestText),

    // Performance considerations
    performance: [
      'Optimize database queries (use indexes, limit fields)',
      'Implement caching where appropriate',
      'Avoid N+1 query problems',
      'Use pagination for large datasets',
      'Minimize API calls to external services',
    ],

    // Next steps after completion
    nextSteps: [
      'Commit changes with descriptive message',
      'Push to remote repository',
      'Create pull request with detailed description',
      'Request code review from team',
      'Address review feedback',
      'Merge after approval',
      'Deploy to staging/production',
      'Monitor for issues',
    ],
  };

  return plan;
}

/**
 * Generate implementation steps based on request type
 */
function generateImplementationSteps(requestType, requestText, workOrder) {
  const steps = [];
  const text = requestText.toLowerCase();

  // Step 1: Set up structure
  steps.push({
    number: 1,
    title: 'Create file structure',
    description: 'Set up the necessary files and directories',
    tasks: [
      'Create directory structure (routes/, controllers/, services/, models/, tests/)',
      'Create main files based on blueprint',
      'Set up index/entry point files',
    ],
    codeExample: `
// Example directory structure
mkdir -p routes controllers services models tests middleware
touch routes/api.js controllers/controller.js services/service.js models/Model.js
    `,
  });

  // Step 2: Database models (if needed)
  if (text.includes('database') || text.includes('model') || text.includes('schema')) {
    steps.push({
      number: 2,
      title: 'Define database models',
      description: 'Create Mongoose schemas and models',
      tasks: [
        'Define schema with proper field types',
        'Add validation rules',
        'Create indexes for frequently queried fields',
        'Add schema methods and statics',
        'Include timestamps and soft delete support',
      ],
      codeExample: `
const mongoose = require('mongoose');

const ExampleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxLength: 100,
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
  },
  companyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true,
  },
  isDeleted: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

ExampleSchema.index({ companyId: 1, status: 1 });

module.exports = mongoose.model('Example', ExampleSchema);
      `,
    });
  }

  // Step 3: Business logic
  steps.push({
    number: steps.length + 1,
    title: 'Implement business logic',
    description: 'Create service layer with core functionality',
    tasks: [
      'Create service functions for each operation',
      'Add input validation',
      'Implement error handling',
      'Add logging for debugging',
      'Handle edge cases',
    ],
    codeExample: `
const logger = require('./config/logger');
const Model = require('./models/Model');

async function create(data, userId) {
  try {
    // Validate input
    if (!data.name) {
      throw new Error('Name is required');
    }

    // Create record
    const record = await Model.create({
      ...data,
      createdBy: userId,
    });

    logger.info('Record created', { id: record._id, userId });
    return record;
  } catch (error) {
    logger.error('Failed to create record', { error: error.message, userId });
    throw error;
  }
}

module.exports = { create };
    `,
  });

  // Step 4: API routes
  if (text.includes('api') || text.includes('endpoint') || text.includes('route')) {
    steps.push({
      number: steps.length + 1,
      title: 'Create API routes',
      description: 'Define Express routes and controllers',
      tasks: [
        'Create route handlers',
        'Add authentication middleware',
        'Add validation middleware',
        'Implement CRUD operations',
        'Return proper HTTP status codes',
      ],
      codeExample: `
const express = require('express');
const router = express.Router();
const controller = require('../controllers/controller');
const { authenticate } = require('../middleware/auth');

// Create
router.post('/', authenticate, controller.create);

// Read
router.get('/', authenticate, controller.list);
router.get('/:id', authenticate, controller.get);

// Update
router.patch('/:id', authenticate, controller.update);

// Delete
router.delete('/:id', authenticate, controller.delete);

module.exports = router;
      `,
    });
  }

  // Step 5: Write tests
  steps.push({
    number: steps.length + 1,
    title: 'Write comprehensive tests',
    description: 'Create unit and integration tests',
    tasks: [
      'Write unit tests for services',
      'Write integration tests for API endpoints',
      'Test success cases',
      'Test error cases',
      'Test edge cases',
      'Aim for >80% code coverage',
    ],
    codeExample: `
const request = require('supertest');
const app = require('../app');
const Model = require('../models/Model');

describe('API Tests', () => {
  beforeEach(async () => {
    await Model.deleteMany({});
  });

  test('should create record', async () => {
    const response = await request(app)
      .post('/api/records')
      .set('Authorization', 'Bearer token')
      .send({ name: 'Test' });

    expect(response.status).toBe(201);
    expect(response.body.data.name).toBe('Test');
  });

  test('should return 400 for invalid input', async () => {
    const response = await request(app)
      .post('/api/records')
      .set('Authorization', 'Bearer token')
      .send({});

    expect(response.status).toBe(400);
  });
});
    `,
  });

  // Step 6: Documentation
  steps.push({
    number: steps.length + 1,
    title: 'Update documentation',
    description: 'Document API endpoints and usage',
    tasks: [
      'Add JSDoc comments to all functions',
      'Document API endpoints (request/response)',
      'Update README if needed',
      'Add inline comments for complex logic',
      'Document environment variables',
    ],
    codeExample: `
/**
 * Create a new record
 * @param {Object} data - Record data
 * @param {string} data.name - Record name
 * @param {string} userId - User creating the record
 * @returns {Promise<Object>} Created record
 * @throws {Error} If validation fails
 */
async function create(data, userId) {
  // Implementation
}
    `,
  });

  return steps;
}

/**
 * Generate security considerations based on request
 */
function generateSecurityConsiderations(requestText) {
  const considerations = [
    'Validate and sanitize all user inputs',
    'Use parameterized queries to prevent SQL injection',
    'Implement proper authentication and authorization',
    'Never log sensitive data (passwords, tokens, PII)',
    'Use HTTPS for all external communications',
  ];

  const text = requestText.toLowerCase();

  if (text.includes('auth') || text.includes('password')) {
    considerations.push('Hash passwords with bcrypt (min 10 rounds)');
    considerations.push('Implement rate limiting for login attempts');
  }

  if (text.includes('api') || text.includes('endpoint')) {
    considerations.push('Implement API rate limiting');
    considerations.push('Validate Content-Type headers');
  }

  if (text.includes('file') || text.includes('upload')) {
    considerations.push('Validate file types and sizes');
    considerations.push('Scan uploaded files for malware');
  }

  if (text.includes('email')) {
    considerations.push('Validate email addresses');
    considerations.push('Implement email rate limiting');
  }

  return considerations;
}

/**
 * Estimate implementation time
 */
function estimateImplementationTime(requestText, priority) {
  const wordCount = requestText.split(/\s+/).length;
  let hours = 4; // Base estimate

  if (wordCount > 200) hours += 4;
  if (wordCount > 500) hours += 8;

  if (priority === 'high' || priority === 'urgent') {
    return `${hours} hours (expedited)`;
  }

  return `${hours}-${hours + 4} hours`;
}

/**
 * Estimate token count
 */
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

module.exports = {
  executeWorkOrder,
};
