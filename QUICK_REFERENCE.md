# Flora MCP Server - Quick Reference Card

## Quick Start

```bash
# Install dependencies
npm install

# Start stdio mode (local development)
npm start

# Start SSE mode (cloud/HTTP)
npm run start:sse

# Run tests
npm test
```

## Environment Variables

```env
MONGODB_URI=mongodb://localhost:27017/flora
JWT_SECRET=your-jwt-secret
MONOLITH_API_URL=http://localhost:3001
MCP_TRANSPORT_MODE=stdio
```

## Claude Code Configuration

Location: `~/.config/Claude/mcp.json`

```json
{
  "mcpServers": {
    "flora": {
      "command": "node",
      "args": ["/path/to/flora-mcp-server/server.js"],
      "env": {
        "MCP_API_TOKEN": "flora_mcp_YOUR_KEY",
        "MONGODB_URI": "mongodb://localhost:27017/flora",
        "JWT_SECRET": "your-jwt-secret",
        "MONOLITH_API_URL": "http://localhost:3001"
      }
    }
  }
}
```

## MCP Tools

### 1. get_requirements
```javascript
{
  "workOrderId": "507f1f77bcf86cd799439011"
}
```

### 2. get_blueprint
```javascript
{
  "workOrderId": "507f1f77bcf86cd799439011"
}
```

### 3. execute_work_order
```javascript
{
  "workOrderId": "507f1f77bcf86cd799439011"
}
```

### 4. report_completion
```javascript
{
  "workOrderId": "507f1f77bcf86cd799439011",
  "status": "completed",
  "artifacts": {
    "filesCreated": ["src/file.js"],
    "commitHash": "abc123"
  }
}
```

## Generate API Key

```bash
curl -X POST http://localhost:4005/api-keys \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "YOUR_USER_ID",
    "companyId": "YOUR_COMPANY_ID",
    "name": "Dev Key",
    "tier": "passbook_budget"
  }'
```

## Health Check

```bash
curl http://localhost:3001/health
```

## View Audit Logs

```bash
mongosh flora --eval "
  db.audit_logs.find({
    action: /MCP Tool/
  }).sort({timestamp: -1}).limit(10).pretty()
"
```

## Common Issues

| Issue | Solution |
|-------|----------|
| "MCP server not found" | Check mcp.json path and syntax |
| "Auth failed" | Verify API key is active |
| "Work order not found" | Check work order exists and company matches |
| "Connection timeout" | Verify MongoDB and monolith API running |

## Protocol Details

- **Version**: 2024-11-05
- **Transports**: stdio, SSE
- **Authentication**: JWT or MCP API key
- **Port**: 3001 (stdio), 4005 (SSE)

## File Locations

```
server.js           - Main entry point
auth/jwtAuth.js    - Authentication
tools/             - MCP tools
tests/             - Test suite
README.md          - Full documentation
TESTING.md         - Testing guide
```

## Support

- Documentation: `README.md`
- Testing Guide: `TESTING.md`
- Implementation: `IMPLEMENTATION_SUMMARY.md`
