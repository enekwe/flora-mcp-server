# Flora MCP Server - PORT Configuration Debug Report

## Problem Summary

The application logs show it's binding to port 4005 instead of Railway's injected PORT, causing healthcheck failures.

```
2026-07-16 22:38:56:3856 info: Flora MCP Server Microservice running on port 4005
```

## Root Cause Analysis

### Code Flow
1. **server.js** line 24: `require('dotenv').config()` loads .env (if exists)
2. **src/config/index.js** lines 2-4: Skips dotenv in production (correct)
3. **src/config/index.js** line 15: `PORT: process.env.PORT || 4005`
4. **src/index.js** line 730: `const PORT = config.PORT || 4005` (double fallback)
5. **App binds to this PORT**

### Why 4005 is Being Used

One of these is happening:
1. **Railway is NOT injecting PORT** (most likely)
2. **process.env.PORT is empty string** (Railway bug)
3. **Some process is overriding PORT** (unlikely)

### Why Railway Might Not Inject PORT

Railway automatically injects PORT for web services, but only if:
- Service is configured as a "web service" type
- Service has a public domain/port exposed
- The Dockerfile doesn't hardcode EXPOSE with a specific port

## Changes Made

### 1. Enhanced Debug Logging in `src/config/index.js`

```javascript
console.log('[CONFIG DEBUG] PORT from process.env.PORT:', process.env.PORT || 'UNDEFINED');
console.log('[CONFIG DEBUG] All PORT-related env keys:', Object.keys(process.env).filter(k => k.includes('PORT')).join(', ') || 'NONE FOUND');
```

### 2. Production PORT Validation in `src/config/index.js`

```javascript
const getPort = () => {
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.PORT) {
      console.error('[CRITICAL] Railway did not inject PORT environment variable!');
      console.error('[CRITICAL] Available env keys:', Object.keys(process.env).join(', '));
      throw new Error('PORT environment variable is required in production but was not provided by Railway');
    }
    return parseInt(process.env.PORT, 10);
  }
  // Development fallback
  return parseInt(process.env.PORT || '4005', 10);
};
```

**Effect**: In production, the app will now FAIL IMMEDIATELY if Railway doesn't inject PORT, making the issue explicit.

### 3. Removed Double Fallback in `src/index.js`

**Before**: `const PORT = config.PORT || 4005;`
**After**: `const PORT = config.PORT;`

Added logging:
```javascript
logger.info(`[START] Starting server with PORT=${PORT} from config`);
logger.info(`[START] config.PORT=${config.PORT}, process.env.PORT=${process.env.PORT}`);
```

### 4. Added Railway Environment Detection in `server.js`

```javascript
console.log('[SERVER.JS] NODE_ENV:', process.env.NODE_ENV);
console.log('[SERVER.JS] PORT:', process.env.PORT || 'NOT SET');
console.log('[SERVER.JS] RAILWAY_ENVIRONMENT:', process.env.RAILWAY_ENVIRONMENT || 'NOT SET');
console.log('[SERVER.JS] Total env vars:', Object.keys(process.env).length);
```

## Next Steps

### Step 1: Deploy and Check Logs

After deploying these changes, check Railway logs for these patterns:

**If Railway IS injecting PORT:**
```
[SERVER.JS] PORT: 8080
[CONFIG DEBUG] PORT from process.env.PORT: 8080
[START] config.PORT=8080, process.env.PORT=8080
info: Flora MCP Server Microservice running on port 8080
```

**If Railway IS NOT injecting PORT:**
```
[SERVER.JS] PORT: NOT SET
[CONFIG DEBUG] PORT from process.env.PORT: UNDEFINED
[CRITICAL] Railway did not inject PORT environment variable!
Error: PORT environment variable is required in production but was not provided by Railway
```

### Step 2: Railway Service Configuration Check

If Railway is NOT injecting PORT, verify in Railway dashboard:

1. **Service Type**: Should be "Web Service" (not "Worker")
2. **Public Networking**: Should be ENABLED
3. **Domain/Port**: Should have a public domain or port exposed
4. **Dockerfile EXPOSE**: Check if Dockerfile has `EXPOSE 4005` (might lock port)

### Step 3: Manual PORT Override (If Needed)

If Railway truly doesn't inject PORT, manually add it:

1. Go to Railway dashboard → flora-mcp-server → Variables
2. Add variable: `PORT` = `8080` (or any valid port)
3. Redeploy

### Step 4: Dockerfile Check

Review the Dockerfile - if it has this:
```dockerfile
EXPOSE 4005
```

Change to:
```dockerfile
EXPOSE ${PORT:-8080}
```

Or remove EXPOSE entirely (Railway doesn't need it).

## Testing Locally

To test the changes locally:

```bash
cd /Users/cope/Passbook_Oracle/microservices/flora-mcp-server

# Test without PORT (should use 4005 in development)
NODE_ENV=development npm start

# Test with PORT set (should use it)
PORT=3000 NODE_ENV=development npm start

# Test production mode without PORT (should fail)
NODE_ENV=production npm start

# Test production mode with PORT (should succeed)
PORT=8080 NODE_ENV=production npm start
```

## Files Modified

1. `/Users/cope/Passbook_Oracle/microservices/flora-mcp-server/src/config/index.js`
   - Added PORT debug logging
   - Added production PORT validation
   - Added explicit error when PORT missing in production

2. `/Users/cope/Passbook_Oracle/microservices/flora-mcp-server/src/index.js`
   - Removed double fallback
   - Added startup PORT logging

3. `/Users/cope/Passbook_Oracle/microservices/flora-mcp-server/server.js`
   - Added Railway environment detection logging

## Expected Outcome

After deploying:

**Success Case**: App binds to Railway's PORT and healthcheck passes
**Failure Case**: App crashes with clear error message showing Railway didn't inject PORT, then we know to configure it manually

## Railway Service Variables (Current)

Based on railway.json, these variables are set:
- NODE_ENV=production
- LOG_LEVEL=info
- MCP_SESSION_TIMEOUT_MS=3600000
- MCP_IDLE_TIMEOUT_MS=300000
- MCP_MAX_CONNECTIONS_PER_USER=3
- MCP_MAX_TOOL_CALLS_PER_MINUTE=60
- RATE_LIMIT_WINDOW_MS=900000
- RATE_LIMIT_MAX_REQUESTS=100

**Missing**: PORT (should be injected by Railway automatically)

## References

- Railway PORT injection docs: https://docs.railway.app/deploy/deployments#port-variable
- Node.js PORT binding best practices: Use process.env.PORT in production
- Docker EXPOSE vs runtime port binding: EXPOSE is documentation-only
