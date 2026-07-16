# Flora MCP Server - PORT Fix Quick Start

## Problem
App binds to port 4005 instead of Railway's PORT. Healthcheck fails.

## Solution Status
✅ All tests passed - Ready to deploy

## Deploy Now

```bash
cd /Users/cope/Passbook_Oracle/microservices/flora-mcp-server
./DEPLOY_PORT_FIX.sh
```

## What Was Fixed

1. **src/config/index.js**: Production now REQUIRES PORT (fails if missing)
2. **src/index.js**: Removed double fallback, added logging
3. **server.js**: Added Railway environment detection
4. **Dockerfile**: Removed EXPOSE 4005 and HEALTHCHECK

## After Deploy: Check Logs

### Success (Railway injecting PORT)
```
[SERVER.JS] PORT: 8080
[CONFIG DEBUG] PORT from process.env.PORT: 8080
info: Flora MCP Server Microservice running on port 8080
```
✅ Healthcheck should pass

### Failure (Railway NOT injecting PORT)
```
[SERVER.JS] PORT: NOT SET
[CRITICAL] Railway did not inject PORT environment variable!
Error: PORT environment variable is required in production
```
❌ App crashes - Manually add PORT=8080 in Railway dashboard

## Manual PORT Configuration (If Needed)

1. Railway Dashboard → flora-mcp-server → Variables
2. Add: `PORT` = `8080`
3. Redeploy

## Test Locally First (Optional)

```bash
./test-port-config.sh
# Should show: All tests passed! ✓
```

## More Info

- Detailed investigation: `INVESTIGATION_REPORT.md`
- Deployment guide: `PORT_FIX_SUMMARY.md`
- Debug instructions: `PORT_DEBUG_INSTRUCTIONS.md`

## Quick Verification After Deploy

```bash
# Replace with your Railway domain
curl https://flora-mcp-server-production.up.railway.app/health

# Should return:
# { "success": true, "status": "healthy", ... }
```

---

**Status**: Ready to deploy
**Tests**: 10/10 passed
**Estimated Deploy Time**: 5-10 minutes
