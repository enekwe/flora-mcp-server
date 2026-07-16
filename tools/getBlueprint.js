/**
 * MCP Tool: get_blueprint
 * Returns architecture diagram and file structure for a work order
 * Provides blueprint with system architecture, file list, and dependencies
 */

const axios = require('axios');
const logger = require('../src/config/logger');
const { updateConnectionActivity } = require('../auth/jwtAuth');

/**
 * Get blueprint for a work order
 * @param {Object} args - Tool arguments
 * @param {string} args.workOrderId - Work order ID
 * @param {Object} authContext - Authentication context
 * @returns {Object} MCP tool response with blueprint
 */
async function getBlueprint(args, authContext) {
  const { workOrderId } = args;

  try {
    logger.info('MCP get_blueprint called', {
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

    // Generate blueprint based on request type
    const blueprint = await generateBlueprint(workOrder, authContext);

    // Update connection activity
    await updateConnectionActivity(authContext, {
      tokensUsed: estimateTokens(JSON.stringify(blueprint)),
      cost: 0,
    });

    logger.info('MCP get_blueprint completed', {
      workOrderId,
      filesCount: blueprint.fileStructure?.files?.length || 0,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(blueprint, null, 2),
        },
      ],
    };
  } catch (error) {
    logger.error('MCP get_blueprint failed', {
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
            tool: 'get_blueprint',
            timestamp: new Date().toISOString(),
          }),
        },
      ],
      isError: true,
    };
  }
}

/**
 * Generate blueprint based on work order details
 */
async function generateBlueprint(workOrder, authContext) {
  const requestType = workOrder.requestType || 'general';
  const requestText = workOrder.requestText || '';

  // Base blueprint structure
  const blueprint = {
    workOrderId: workOrder._id || workOrder.id,
    ticketId: workOrder.ticketId,
    architecture: {
      type: determineArchitectureType(requestType, requestText),
      layers: determineLayers(requestType, requestText),
      components: determineComponents(requestType, requestText),
      dataFlow: generateDataFlow(requestType, requestText),
    },
    fileStructure: {
      basePath: determineBasePath(requestType, workOrder),
      files: generateFileList(requestType, requestText, workOrder),
      directories: generateDirectoryStructure(requestType),
    },
    dependencies: {
      npm: determineDependencies(requestType, requestText),
      services: determineServiceDependencies(requestType, requestText),
      external: determineExternalDependencies(requestType, requestText),
    },
    technicalDetails: {
      stack: determineStack(requestType, requestText),
      patterns: determinePatterns(requestType, requestText),
      considerations: generateConsiderations(requestType, workOrder),
    },
  };

  return blueprint;
}

/**
 * Determine architecture type from request
 */
function determineArchitectureType(requestType, requestText) {
  const text = requestText.toLowerCase();

  if (text.includes('microservice') || text.includes('api')) {
    return 'microservice';
  } else if (text.includes('frontend') || text.includes('ui') || text.includes('component')) {
    return 'frontend';
  } else if (text.includes('database') || text.includes('model') || text.includes('schema')) {
    return 'data';
  } else if (text.includes('full stack') || text.includes('fullstack')) {
    return 'fullstack';
  } else {
    return 'monolith';
  }
}

/**
 * Determine layers based on architecture
 */
function determineLayers(requestType, requestText) {
  const layers = [];
  const text = requestText.toLowerCase();

  if (text.includes('api') || text.includes('endpoint') || text.includes('route')) {
    layers.push('API Layer');
  }

  if (text.includes('business logic') || text.includes('service') || text.includes('controller')) {
    layers.push('Business Logic Layer');
  }

  if (text.includes('database') || text.includes('data') || text.includes('model')) {
    layers.push('Data Access Layer');
  }

  if (text.includes('frontend') || text.includes('ui') || text.includes('component')) {
    layers.push('Presentation Layer');
  }

  if (layers.length === 0) {
    return ['API Layer', 'Business Logic Layer', 'Data Access Layer'];
  }

  return layers;
}

/**
 * Determine components to be created
 */
function determineComponents(requestType, requestText) {
  const components = [];

  // Look for specific keywords
  if (requestText.includes('authentication') || requestText.includes('auth')) {
    components.push({ name: 'Authentication', type: 'security' });
  }

  if (requestText.includes('api') || requestText.includes('endpoint')) {
    components.push({ name: 'REST API', type: 'interface' });
  }

  if (requestText.includes('database') || requestText.includes('model')) {
    components.push({ name: 'Data Models', type: 'data' });
  }

  if (requestText.includes('validation')) {
    components.push({ name: 'Input Validation', type: 'middleware' });
  }

  return components;
}

/**
 * Generate data flow diagram
 */
function generateDataFlow(requestType, requestText) {
  return {
    description: 'Data flow for this work order',
    steps: [
      'Client Request',
      'API Gateway/Router',
      'Business Logic/Service Layer',
      'Data Access Layer',
      'Database',
      'Response',
    ],
  };
}

/**
 * Determine base path for implementation
 */
function determineBasePath(requestType, workOrder) {
  const companyName = workOrder.companyName?.toLowerCase().replace(/\s+/g, '-') || 'company';

  if (requestType.includes('microservice')) {
    return `/microservices/${companyName}-service`;
  } else if (requestType.includes('frontend')) {
    return `/Client/src/components/${companyName}`;
  } else {
    return `/src/${companyName}`;
  }
}

/**
 * Generate file list based on request type
 */
function generateFileList(requestType, requestText, workOrder) {
  const files = [];
  const text = requestText.toLowerCase();

  // Always include tests
  files.push({
    path: 'tests/integration.test.js',
    purpose: 'Integration tests',
    priority: 'high',
  });

  // API endpoints
  if (text.includes('api') || text.includes('endpoint')) {
    files.push({
      path: 'routes/api.js',
      purpose: 'API route definitions',
      priority: 'high',
    });
    files.push({
      path: 'controllers/controller.js',
      purpose: 'Request handlers',
      priority: 'high',
    });
  }

  // Database models
  if (text.includes('database') || text.includes('model')) {
    files.push({
      path: 'models/Model.js',
      purpose: 'Database schema and model',
      priority: 'high',
    });
  }

  // Services
  if (text.includes('service') || text.includes('business logic')) {
    files.push({
      path: 'services/service.js',
      purpose: 'Business logic implementation',
      priority: 'high',
    });
  }

  // Middleware
  if (text.includes('auth') || text.includes('validation')) {
    files.push({
      path: 'middleware/auth.js',
      purpose: 'Authentication middleware',
      priority: 'medium',
    });
    files.push({
      path: 'middleware/validation.js',
      purpose: 'Input validation',
      priority: 'medium',
    });
  }

  // Configuration
  files.push({
    path: 'config/index.js',
    purpose: 'Configuration management',
    priority: 'low',
  });

  return files;
}

/**
 * Generate directory structure
 */
function generateDirectoryStructure(requestType) {
  return [
    'routes/',
    'controllers/',
    'services/',
    'models/',
    'middleware/',
    'config/',
    'tests/',
    'utils/',
  ];
}

/**
 * Determine NPM dependencies
 */
function determineDependencies(requestType, requestText) {
  const deps = [];
  const text = requestText.toLowerCase();

  // Always include core dependencies
  deps.push('express', 'mongoose', 'dotenv');

  if (text.includes('auth') || text.includes('jwt')) {
    deps.push('jsonwebtoken', 'bcryptjs');
  }

  if (text.includes('validation')) {
    deps.push('joi', 'validator');
  }

  if (text.includes('test')) {
    deps.push('jest', 'supertest');
  }

  if (text.includes('axios') || text.includes('api call')) {
    deps.push('axios');
  }

  return deps;
}

/**
 * Determine service dependencies
 */
function determineServiceDependencies(requestType, requestText) {
  const services = [];

  if (requestText.includes('database')) {
    services.push('MongoDB');
  }

  if (requestText.includes('email')) {
    services.push('Email Service (Gmail/SendGrid)');
  }

  if (requestText.includes('storage') || requestText.includes('file')) {
    services.push('Cloud Storage (S3/GCS)');
  }

  return services;
}

/**
 * Determine external dependencies
 */
function determineExternalDependencies(requestType, requestText) {
  return [];
}

/**
 * Determine technology stack
 */
function determineStack(requestType, requestText) {
  return {
    backend: ['Node.js', 'Express.js'],
    database: ['MongoDB', 'Mongoose'],
    testing: ['Jest', 'Supertest'],
    deployment: ['Docker', 'Railway'],
  };
}

/**
 * Determine design patterns
 */
function determinePatterns(requestType, requestText) {
  return [
    'MVC Pattern',
    'Repository Pattern',
    'Dependency Injection',
    'Middleware Chain',
  ];
}

/**
 * Generate implementation considerations
 */
function generateConsiderations(requestType, workOrder) {
  return [
    'Follow existing code style and conventions',
    'Write comprehensive tests with high coverage',
    'Include error handling and logging',
    'Document all public APIs and functions',
    'Consider security implications (auth, validation, sanitization)',
    'Optimize database queries with proper indexing',
    'Implement proper error messages for user feedback',
  ];
}

/**
 * Estimate token count
 */
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

module.exports = {
  getBlueprint,
};
