# Testing Flora MCP Server with Claude Code

This guide walks through testing the Flora MCP Server integration with Claude Code.

## Prerequisites

1. **Flora MCP Server** - Running locally
2. **MongoDB** - Running locally or accessible
3. **Flora Monolith** - Main API accessible at http://localhost:3001
4. **Claude Code** - Installed and configured

## Step 1: Generate MCP API Key

### Option A: Using the API (Recommended)

```bash
curl -X POST http://localhost:4005/api-keys \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "YOUR_USER_ID",
    "companyId": "YOUR_COMPANY_ID",
    "name": "Claude Code Development Key",
    "description": "Local development MCP key for Claude Code",
    "tier": "passbook_budget",
    "permissions": {
      "workOrders": { "read": true, "update": false },
      "tasks": { "read": true, "update": true, "create": false },
      "providerRouting": { "use": true },
      "contextBoundary": { "enforce": true },
      "promptVault": { "store": true, "read": false }
    },
    "security": {
      "allowedAgentTypes": ["claude_code"],
      "scopingLevel": "INTERNAL",
      "ipWhitelist": []
    }
  }'
```

**Save the returned `rawKey`** - it will look like:
```
flora_mcp_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
```

### Option B: Using MongoDB Directly

```javascript
// In MongoDB shell or Compass
db.mcp_api_keys.insertOne({
  name: "Claude Code Dev Key",
  userId: ObjectId("YOUR_USER_ID"),
  companyId: ObjectId("YOUR_COMPANY_ID"),
  keyHash: "GENERATE_SHA256_HASH",
  keyPrefix: "flora_mcp_",
  tier: "passbook_budget",
  status: "active",
  permissions: {
    workOrders: { read: true },
    tasks: { read: true, update: true }
  },
  createdAt: new Date(),
  updatedAt: new Date()
});
```

## Step 2: Configure Claude Code

Create MCP configuration file at `~/.config/Claude/mcp.json`:

```json
{
  "mcpServers": {
    "flora": {
      "command": "node",
      "args": [
        "/Users/cope/Passbook_Oracle/microservices/flora-mcp-server/server.js"
      ],
      "env": {
        "MCP_API_TOKEN": "flora_mcp_YOUR_GENERATED_KEY_HERE",
        "MCP_TRANSPORT_MODE": "stdio",
        "MONGODB_URI": "mongodb://localhost:27017/flora",
        "JWT_SECRET": "your-super-secret-jwt-key-here",
        "MONOLITH_API_URL": "http://localhost:3001",
        "INTERNAL_SERVICE_TOKEN": "internal-service-token",
        "NODE_ENV": "development"
      }
    }
  }
}
```

**Important**: Replace the placeholders with actual values from your `.env` file.

## Step 3: Start Flora MCP Server

```bash
cd /Users/cope/Passbook_Oracle/microservices/flora-mcp-server

# Make sure MongoDB is running
mongod --dbpath /path/to/data

# Start the server in stdio mode
npm start
```

You should see:
```
Flora MCP Server started with stdio transport
Protocol: 2024-11-05
Transport: stdio
```

## Step 4: Restart Claude Code

Restart Claude Code to load the new MCP configuration:

```bash
# On macOS
pkill -9 "Claude Code"
open -a "Claude Code"
```

## Step 5: Verify MCP Connection

In Claude Code, you should see "flora" listed in the available MCP servers.

## Step 6: Test MCP Tools

### Test 1: Get Requirements

In Claude Code, type:

```
Use the get_requirements tool to fetch requirements for work order 507f1f77bcf86cd799439011
```

Expected response:
- Technical specifications
- Requirements list
- Acceptance criteria
- Estimated effort

### Test 2: Get Blueprint

```
Use the get_blueprint tool for work order 507f1f77bcf86cd799439011
```

Expected response:
- Architecture diagram
- File structure
- Dependencies
- Technical details

### Test 3: Execute Work Order

```
Use the execute_work_order tool to get implementation steps for work order 507f1f77bcf86cd799439011
```

Expected response:
- Prerequisites
- Step-by-step implementation plan
- Code examples
- Verification checklist
- Best practices

### Test 4: Report Completion

```
Use the report_completion tool to mark work order 507f1f77bcf86cd799439011 as completed with the following artifacts:
- filesCreated: ["src/auth/jwt.js", "tests/auth.test.js"]
- filesModified: ["src/routes/api.js"]
- commitHash: "abc123def456"
```

Expected response:
- Deployment ID
- Status confirmation
- Artifacts summary

## Troubleshooting

### Issue: "MCP server not found"

**Solution**: Check MCP config file location and syntax:
```bash
cat ~/.config/Claude/mcp.json
node -e "console.log(require('$HOME/.config/Claude/mcp.json'))"
```

### Issue: "Authentication failed"

**Solution**: Verify API key is valid and active:
```bash
# Check API key in MongoDB
mongosh flora --eval "db.mcp_api_keys.find({status: 'active'}).pretty()"

# Verify JWT_SECRET matches between .env and mcp.json
```

### Issue: "Work order not found"

**Solution**: Ensure work order exists and belongs to your company:
```bash
curl http://localhost:3001/api/v1/site-requests/YOUR_WORK_ORDER_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Issue: "Connection timeout"

**Solution**:
1. Verify MongoDB is running: `mongosh --eval "db.version()"`
2. Check monolith API is accessible: `curl http://localhost:3001/health`
3. Review server logs for errors

### Issue: "Tool invocation failed"

**Solution**: Check audit logs for detailed error:
```bash
mongosh flora --eval "db.audit_logs.find({action: /MCP Tool/}).sort({timestamp: -1}).limit(5).pretty()"
```

## Testing Checklist

- [ ] MCP API key generated and saved
- [ ] Claude Code MCP config created at correct location
- [ ] All environment variables set correctly
- [ ] MongoDB running and accessible
- [ ] Flora monolith API running
- [ ] Flora MCP Server started successfully
- [ ] Claude Code restarted after config change
- [ ] MCP server shows as connected in Claude Code
- [ ] All 4 tools tested successfully
- [ ] Audit logs showing tool invocations

## Debugging Tips

### Enable Debug Logging

Set log level in `.env`:
```env
LOG_LEVEL=debug
```

### Monitor Audit Logs

Watch audit logs in real-time:
```bash
mongosh flora --eval "db.audit_logs.watch([{$match: {action: /MCP Tool/}}])"
```

### Check Connection Status

```bash
curl http://localhost:4005/connections/stats/YOUR_COMPANY_ID
```

### Verify API Key Permissions

```bash
curl http://localhost:4005/api-keys/YOUR_API_KEY_ID
```

## Advanced Testing

### Test with Multiple Work Orders

```javascript
// Create test work orders in MongoDB
db.site_requests.insertMany([
  {
    ticketId: "TEST-001",
    requestText: "Build authentication API",
    requestType: "feature",
    status: "spec_approved",
    companyId: ObjectId("YOUR_COMPANY_ID"),
    priority: "high"
  },
  {
    ticketId: "TEST-002",
    requestText: "Add user management dashboard",
    requestType: "feature",
    status: "dev_queue",
    companyId: ObjectId("YOUR_COMPANY_ID"),
    priority: "medium"
  }
]);
```

### Test Error Handling

```
# Test with invalid work order ID
Use get_requirements tool for work order 000000000000000000000000

# Test with different company's work order
Use get_requirements tool for work order <other-company-work-order-id>

# Test with revoked API key
<Revoke API key in database and test>
```

### Test Budget Limits

```javascript
// Set low budget limit
db.mcp_api_keys.updateOne(
  { _id: ObjectId("YOUR_API_KEY_ID") },
  {
    $set: {
      "budgetLimits.monthlyCostCap": 0.01,
      "budgetLimits.monthlyTokenCap": 1000
    }
  }
);

// Test exceeding budget
<Make multiple tool calls to exceed budget>
```

## Performance Testing

### Measure Tool Response Times

```bash
time curl -X POST http://localhost:4005/api/mcp/tools/get_requirements \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"workOrderId": "507f1f77bcf86cd799439011"}'
```

### Load Testing

```bash
# Install Apache Bench
brew install apache2

# Run load test
ab -n 100 -c 10 -H "Authorization: Bearer YOUR_API_KEY" \
  http://localhost:4005/health
```

## Security Testing

### Verify Token Validation

```bash
# Test with invalid token
curl -X POST http://localhost:4005/api/mcp/tools/get_requirements \
  -H "Authorization: Bearer invalid-token" \
  -d '{"workOrderId": "507f1f77bcf86cd799439011"}'
# Expected: 401 Unauthorized
```

### Verify Company Scoping

```bash
# Try to access another company's work order
# Expected: Access denied error
```

## CI/CD Testing

Run automated tests:

```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# Coverage report
npm test -- --coverage
```

## Success Criteria

All tests passing indicates successful implementation:

1. ✅ MCP protocol version 2024-11-05 implemented
2. ✅ Stdio transport working for local development
3. ✅ SSE transport configured for cloud deployment
4. ✅ All 4 tools (get_requirements, get_blueprint, execute_work_order, report_completion) functional
5. ✅ JWT authentication validated
6. ✅ MCP API key authentication working
7. ✅ Audit logging to AuditLog model
8. ✅ Company scoping enforced
9. ✅ Error handling comprehensive
10. ✅ Integration with Claude Code successful

## Next Steps

After successful testing:

1. Deploy to Railway staging environment
2. Test SSE transport in cloud
3. Configure production MCP API keys
4. Set up monitoring and alerts
5. Document for team onboarding
