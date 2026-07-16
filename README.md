# Flora MCP Server - CC-E0-3: MCP Server Foundation

**Flora MCP Server** is the IDE/CLI bridge that connects local coding agents (Claude Code, Cursor, VS Code) to Flora Command Center's safety harness through the Model Context Protocol (MCP).

## Overview

This microservice implements MCP Protocol version **2024-11-05** with support for both **stdio** (local development) and **SSE** (cloud deployment) transports.

### Available Tools

1. **get_requirements(workOrderId)** - Fetch technical specifications and requirements
2. **get_blueprint(workOrderId)** - Get architecture diagram and file structure
3. **execute_work_order(workOrderId)** - Get step-by-step implementation instructions
4. **report_completion(workOrderId, status, artifacts)** - Update deployment status

## Architecture

```
flora-mcp-server/
├── server.js                 # Main MCP server entry point
├── auth/
│   └── jwtAuth.js           # JWT authentication and validation
├── tools/
│   ├── getRequirements.js   # Tool: Fetch requirements
│   ├── getBlueprint.js      # Tool: Generate blueprint
│   ├── executeWorkOrder.js  # Tool: Implementation plan
│   └── reportCompletion.js  # Tool: Report completion
├── src/
│   ├── config/              # Configuration (logger, database)
│   └── models/              # MongoDB models
├── tests/
│   ├── mcp-server.test.js   # Integration tests
│   └── tools.test.js        # Tool unit tests
└── package.json
```

## Prerequisites

- Node.js >= 20.0.0
- MongoDB (local or cloud)
- JWT_SECRET configured
- Access to Flora monolith API

## Installation

```bash
cd microservices/flora-mcp-server
npm install
```

## Configuration

Create a `.env` file based on `.env.example`:

```env
NODE_ENV=development
PORT=3001
MCP_TRANSPORT_MODE=stdio  # or 'sse' for cloud

# Database
MONGODB_URI=mongodb://localhost:27017/flora

# Security
JWT_SECRET=your-jwt-secret-min-32-chars
INTERNAL_SERVICE_TOKEN=internal-service-token

# Target Services
MONOLITH_API_URL=http://localhost:3001
```

## Running Locally

### Stdio Transport (for Claude Code)

```bash
npm start
# or
npm run dev
```

### SSE Transport (for cloud/HTTP)

```bash
npm run start:sse
# or
npm run dev:sse
```

## Testing with Claude Code

### Step 1: Generate MCP API Key

First, create an MCP API key for your user:

```bash
curl -X POST http://localhost:3001/api-keys \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "your-user-id",
    "companyId": "your-company-id",
    "name": "Claude Code Development Key",
    "tier": "passbook_budget",
    "permissions": {
      "workOrders": { "read": true, "update": false },
      "tasks": { "read": true, "update": true, "create": false }
    }
  }'
```

Save the returned `rawKey` - it will look like `flora_mcp_abc123def456...`

### Step 2: Configure Claude Code

Create or update your MCP configuration file at `~/.config/Claude/mcp.json`:

```json
{
  "mcpServers": {
    "flora": {
      "command": "node",
      "args": ["/path/to/flora-mcp-server/server.js"],
      "env": {
        "MCP_API_TOKEN": "flora_mcp_YOUR_API_KEY_HERE",
        "MCP_TRANSPORT_MODE": "stdio",
        "MONGODB_URI": "mongodb://localhost:27017/flora",
        "JWT_SECRET": "your-jwt-secret",
        "MONOLITH_API_URL": "http://localhost:3001"
      }
    }
  }
}
```

### Step 3: Test MCP Connection

Restart Claude Code and verify the connection:

1. Open Claude Code
2. Check MCP servers list (should show "flora")
3. Try calling a tool:

```
Use the get_requirements tool to fetch requirements for work order 507f1f77bcf86cd799439011
```

### Step 4: Example Workflow

```markdown
1. List available work orders:
   "Use get_requirements tool to fetch work order FLORA-123"

2. Get the blueprint:
   "Use get_blueprint tool for the same work order"

3. Get implementation steps:
   "Use execute_work_order tool to get step-by-step instructions"

4. After completing work:
   "Use report_completion tool to mark work order as completed with artifacts:
   - filesCreated: ['src/auth.js', 'tests/auth.test.js']
   - commitHash: 'abc123'"
```

## Testing with Cursor

Cursor uses a similar MCP configuration. Create `.cursor/mcp.json`:

```json
{
  "servers": {
    "flora": {
      "url": "http://localhost:3001/sse",
      "headers": {
        "Authorization": "Bearer flora_mcp_YOUR_API_KEY"
      }
    }
  }
}
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run with coverage
npm test -- --coverage
```

## Authentication

### JWT Tokens

Standard JWT tokens from Flora's authentication system:

```javascript
const token = jwt.sign(
  {
    userId: 'user-id',
    companyId: 'company-id',
    email: 'user@example.com',
    role: 'developer'
  },
  JWT_SECRET,
  { expiresIn: '1h' }
);
```

### MCP API Keys

Generated via the `/api-keys` endpoint. Keys are hashed with SHA-256 and never stored in plain text.

Format: `flora_mcp_<64-char-hex>`

## Audit Logging

All tool invocations are logged to the `AuditLog` model for compliance:

- Tool name and parameters
- User ID and company ID
- Session ID and IP address
- Success/failure status
- Response time
- Error messages (if any)

## Error Handling

MCP tools return errors in standardized format:

```json
{
  "error": "Error message",
  "workOrderId": "507f1f77bcf86cd799439011",
  "tool": "get_requirements",
  "timestamp": "2026-07-15T12:00:00.000Z"
}
```

## Security Considerations

1. **API Key Security**: Never commit API keys to version control
2. **JWT Validation**: All tokens validated against JWT_SECRET
3. **Company Scoping**: Users can only access work orders from their company
4. **Rate Limiting**: Configurable limits per user/session
5. **Budget Enforcement**: API keys have configurable budget limits

## Deployment

### Railway Deployment

The service is configured for Railway deployment with:

- SSE transport for HTTP connections
- Health check endpoint at `/health`
- Automatic restarts on failure
- Environment-specific configuration

Deploy command:

```bash
railway up
```

### Environment Variables (Railway)

Set these in Railway dashboard:

- `MONGODB_URI` - MongoDB connection string (use TCP proxy URL)
- `JWT_SECRET` - JWT signing secret
- `INTERNAL_SERVICE_TOKEN` - Service-to-service auth token
- `MONOLITH_API_URL` - URL to Flora monolith API
- `MCP_TRANSPORT_MODE=sse` - Use SSE transport for cloud

## Monitoring

Health check endpoint:

```bash
curl http://localhost:3001/health
```

Response:

```json
{
  "status": "healthy",
  "service": "flora-mcp-server",
  "version": "1.0.0",
  "protocol": "2024-11-05",
  "transport": "sse",
  "timestamp": "2026-07-15T12:00:00.000Z"
}
```

## Troubleshooting

### Connection Issues

1. Verify MongoDB is running
2. Check JWT_SECRET is configured
3. Ensure MONOLITH_API_URL is accessible
4. Verify API key is active and not expired

### Tool Execution Errors

1. Check work order exists and user has access
2. Verify company ID matches
3. Review audit logs for detailed error messages
4. Check API key permissions

### Claude Code Integration

1. Verify MCP config file path is correct
2. Check environment variables are set
3. Restart Claude Code after config changes
4. Review Claude Code logs for connection errors

## API Reference

### Tool: get_requirements

**Input:**

```json
{
  "workOrderId": "507f1f77bcf86cd799439011"
}
```

**Output:**

```json
{
  "workOrderId": "507f1f77bcf86cd799439011",
  "ticketId": "FLORA-123",
  "title": "Build authentication system",
  "technicalSpec": {
    "requirements": ["..."],
    "acceptanceCriteria": ["..."],
    "estimatedEffort": "8 hours"
  }
}
```

### Tool: get_blueprint

**Input:**

```json
{
  "workOrderId": "507f1f77bcf86cd799439011"
}
```

**Output:**

```json
{
  "architecture": {
    "type": "microservice",
    "layers": ["API Layer", "Business Logic", "Data Access"]
  },
  "fileStructure": {
    "files": [
      { "path": "routes/api.js", "purpose": "API routes" }
    ]
  },
  "dependencies": {
    "npm": ["express", "mongoose"]
  }
}
```

### Tool: execute_work_order

**Input:**

```json
{
  "workOrderId": "507f1f77bcf86cd799439011"
}
```

**Output:**

```json
{
  "steps": [
    {
      "number": 1,
      "title": "Create file structure",
      "tasks": ["..."],
      "codeExample": "..."
    }
  ],
  "verification": ["..."],
  "bestPractices": ["..."]
}
```

### Tool: report_completion

**Input:**

```json
{
  "workOrderId": "507f1f77bcf86cd799439011",
  "status": "completed",
  "artifacts": {
    "filesCreated": ["src/auth.js"],
    "filesModified": ["src/routes.js"],
    "commitHash": "abc123"
  }
}
```

**Output:**

```json
{
  "success": true,
  "deploymentId": "507f1f77bcf86cd799439022",
  "status": "completed",
  "message": "Work order completed successfully"
}
```

## Contributing

1. Write tests for new features
2. Ensure all tests pass: `npm test`
3. Follow existing code style
4. Update documentation

## License

MIT
