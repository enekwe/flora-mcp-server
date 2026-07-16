# Flora MCP Server — PORT Configuration Fix Summary

## Executive Summary

**Problem**: The flora-mcp-server healthcheck is failing because the application binds to port 4005 instead of Railway's dynamically assigned PORT.

**Root Cause**: Multiple issues preventing Railway's PORT injection from working:
1. Dockerfile had `EXPOSE 4005` hardcoded
2. Dockerfile HEALTHCHECK using unreliable shell variable expansion
3. Code had double fallback to 4005 masking the issue
4. No validation that Railway was actually injecting PORT

**Solution**: Comprehensive PORT handling fix with debug logging and validation.

---

## Problem Details

### Symptoms
```
Logs: "Flora MCP Server Microservice running on port 4005"
Railway: Healthcheck probe failing
Issue: App ignoring Railway's PORT variable
```

### Investigation Findings

**Code Flow Analysis**:
1. `server.js:24` → Loads dotenv
2. `src/config/index.js:15` → Reads `process.env.PORT || 4005`
3. `src/index.js:730` → Double fallback: `config.PORT || 4005`
4. App binds to resolved PORT (always 4005)

**Dockerfile Issues**:
- Line 133: `EXPOSE 4005` → Hardcoded port might signal Railway to expect 4005
- Line 137-138: `HEALTHCHECK` with shell expansion → Conflicts with Railway's healthcheck

**Railway Behavior**:
- Railway automatically injects PORT for web services
- BUT: If Dockerfile has EXPOSE, it might not inject PORT
- Railway expects services to read PORT from environment
- Railway provides its own healthcheck mechanism (railway.json)

---

## Changes Made

### 1. `/Users/cope/Passbook_Oracle/microservices/flora-mcp-server/src/config/index.js`

**Added PORT Debug Logging**:
```javascript
console.log('[CONFIG DEBUG] PORT from process.env.PORT:', process.env.PORT || 'UNDEFINED');
console.log('[CONFIG DEBUG] All PORT-related env keys:',
  Object.keys(process.env).filter(k => k.includes('PORT')).join(', ') || 'NONE FOUND');
```

**Added Production PORT Validation**:
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

**Effect**: App will FAIL EXPLICITLY if Railway doesn't inject PORT, revealing the configuration issue.

### 2. `/Users/cope/Passbook_Oracle/microservices/flora-mcp-server/src/index.js`

**Removed Double Fallback**:
```javascript
// Before
const PORT = config.PORT || 4005;

// After
const PORT = config.PORT; // No fallback - config already handles this
```

**Added Startup Logging**:
```javascript
logger.info(`[START] Starting server with PORT=${PORT} from config`);
logger.info(`[START] config.PORT=${config.PORT}, process.env.PORT=${process.env.PORT}`);
```

**Effect**: Clear visibility into PORT resolution at startup.

### 3. `/Users/cope/Passbook_Oracle/microservices/flora-mcp-server/server.js`

**Added Railway Environment Detection**:
```javascript
console.log('[SERVER.JS] NODE_ENV:', process.env.NODE_ENV);
console.log('[SERVER.JS] PORT:', process.env.PORT || 'NOT SET');
console.log('[SERVER.JS] RAILWAY_ENVIRONMENT:', process.env.RAILWAY_ENVIRONMENT || 'NOT SET');
console.log('[SERVER.JS] Total env vars:', Object.keys(process.env).length);
```

**Effect**: Diagnose if Railway is injecting environment variables at all.

### 4. `/Users/cope/Passbook_Oracle/microservices/flora-mcp-server/Dockerfile`

**Removed EXPOSE**:
```dockerfile
# Before
EXPOSE 4005

# After
# EXPOSE removed — Railway dynamically assigns and injects PORT
# Hardcoding EXPOSE can interfere with Railway's port injection
```

**Removed HEALTHCHECK**:
```dockerfile
# Before
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD sh -c 'curl -f "http://localhost:${PORT:-4005}/health" || exit 1'

# After
# Health check disabled in Dockerfile — Railway provides its own healthcheck mechanism
# Railway will use the healthcheckPath from railway.json (/health)
# Dockerfile HEALTHCHECK conflicts with Railway's healthcheck probe
```

**Effect**:
- Railway can freely assign any PORT it wants
- Railway's healthcheck mechanism takes precedence
- No conflicting port expectations

---

## Expected Behavior After Deploy

### Success Case (Railway IS Injecting PORT)

**Logs will show**:
```
[SERVER.JS] Loaded dotenv, checking Railway environment...
[SERVER.JS] NODE_ENV: production
[SERVER.JS] PORT: 8080
[SERVER.JS] RAILWAY_ENVIRONMENT: production
[SERVER.JS] Total env vars: 42

[CONFIG DEBUG] PORT from process.env.PORT: 8080
[CONFIG DEBUG] All PORT-related env keys: PORT, PORT_PUBLIC

[START] Starting server with PORT=8080 from config
[START] config.PORT=8080, process.env.PORT=8080

info: Flora MCP Server Microservice running on port 8080
info: Health check: http://flora-mcp-server.railway.internal:8080/health
```

**Healthcheck**: ✅ PASSES (Railway probes port 8080 at /health)

### Failure Case (Railway NOT Injecting PORT)

**Logs will show**:
```
[SERVER.JS] Loaded dotenv, checking Railway environment...
[SERVER.JS] NODE_ENV: production
[SERVER.JS] PORT: NOT SET
[SERVER.JS] RAILWAY_ENVIRONMENT: production
[SERVER.JS] Total env vars: 38

[CONFIG DEBUG] PORT from process.env.PORT: UNDEFINED
[CONFIG DEBUG] All PORT-related env keys: NONE FOUND

[CRITICAL] Railway did not inject PORT environment variable!
[CRITICAL] Available env keys: NODE_ENV, MONGODB_URI, JWT_SECRET, ...

Error: PORT environment variable is required in production but was not provided by Railway
    at getPort (src/config/index.js:17)
    at Object.<anonymous> (src/config/index.js:30)
```

**Healthcheck**: ❌ FAILS (App crashes before starting)

**Action Required**: Manually add PORT variable in Railway dashboard

---

## Deployment Instructions

### Option A: Automated Deployment (Recommended)

```bash
cd /Users/cope/Passbook_Oracle/microservices/flora-mcp-server
./DEPLOY_PORT_FIX.sh
```

The script will:
1. Show git diff of changes
2. Prompt for confirmation
3. Commit with detailed message
4. Push to trigger Railway redeploy
5. Display monitoring instructions

### Option B: Manual Deployment

```bash
cd /Users/cope/Passbook_Oracle/microservices/flora-mcp-server

# Stage changes
git add src/config/index.js src/index.js server.js Dockerfile \
        PORT_DEBUG_INSTRUCTIONS.md PORT_FIX_SUMMARY.md DEPLOY_PORT_FIX.sh

# Commit
git commit -m "fix(mcp-server): resolve Railway PORT injection issue"

# Push
git push origin main
```

---

## Post-Deployment Monitoring

### Step 1: Watch Railway Deployment Logs

Go to: Railway Dashboard → flora-mcp-server → Deployments → View Logs

**Look for these patterns**:

✅ **Success Pattern**:
```
[SERVER.JS] PORT: 8080
[CONFIG DEBUG] PORT from process.env.PORT: 8080
info: Flora MCP Server Microservice running on port 8080
```

❌ **Failure Pattern**:
```
[SERVER.JS] PORT: NOT SET
[CRITICAL] Railway did not inject PORT environment variable!
Error: PORT environment variable is required in production
```

### Step 2: Check Healthcheck Status

Go to: Railway Dashboard → flora-mcp-server → Metrics

**Expected**:
- Status: 🟢 Healthy
- Healthcheck: Passing
- Uptime: Normal

### Step 3: Manual Verification (If Needed)

```bash
# Get the service domain from Railway dashboard
DOMAIN="flora-mcp-server-production.up.railway.app"

# Test the healthcheck endpoint
curl -i "https://$DOMAIN/health"

# Expected response:
# HTTP/2 200
# {
#   "success": true,
#   "service": "flora-mcp-server",
#   "status": "healthy",
#   "timestamp": "2026-07-16T22:50:00.000Z",
#   "uptime": 123.456,
#   "environment": "production",
#   "mcpTools": 8,
#   "version": "1.0.0"
# }
```

---

## Troubleshooting

### Issue: App Still Crashes with "PORT required" Error

**Diagnosis**: Railway is NOT automatically injecting PORT.

**Solution**: Manually add PORT variable:

1. Railway Dashboard → flora-mcp-server → Variables
2. Click "New Variable"
3. Key: `PORT`
4. Value: `8080` (or any valid port 1024-65535)
5. Click "Add" → Redeploy

### Issue: App Starts but Healthcheck Still Fails

**Diagnosis**: Railway is probing the wrong endpoint or port.

**Check**:
1. Railway Dashboard → flora-mcp-server → Settings → Healthcheck
2. Verify: Path = `/health`
3. Verify: Timeout = 30 seconds
4. Verify: Interval = 30 seconds

**Solution**: Update railway.json if needed:
```json
{
  "deploy": {
    "healthcheckPath": "/health",
    "healthcheckTimeout": 30,
    "healthcheckInterval": 30
  }
}
```

### Issue: App Binds to Correct Port but 502 Gateway Error

**Diagnosis**: Service not exposed publicly or internal networking issue.

**Check**:
1. Railway Dashboard → flora-mcp-server → Settings → Networking
2. Verify: Public networking is ENABLED
3. Verify: Service has a public domain assigned

**Solution**:
- Enable public networking
- Generate a public domain
- Redeploy

---

## Files Modified

| File | Changes | Purpose |
|------|---------|---------|
| `src/config/index.js` | Added PORT validation + logging | Fail early if PORT missing |
| `src/index.js` | Removed double fallback + logging | Clear PORT visibility |
| `server.js` | Added Railway env detection | Diagnose Railway injection |
| `Dockerfile` | Removed EXPOSE + HEALTHCHECK | Let Railway control ports |
| `PORT_DEBUG_INSTRUCTIONS.md` | Documentation | Detailed debugging guide |
| `PORT_FIX_SUMMARY.md` | This file | Executive summary |
| `DEPLOY_PORT_FIX.sh` | Deployment script | Automated deployment |

---

## Testing Locally

### Test Development Mode (Should Use 4005 Fallback)

```bash
cd /Users/cope/Passbook_Oracle/microservices/flora-mcp-server

# Test without PORT env var
NODE_ENV=development npm start
# Expected: Server running on port 4005

# Test with PORT env var
PORT=3000 NODE_ENV=development npm start
# Expected: Server running on port 3000
```

### Test Production Mode (Should Require PORT)

```bash
# Test without PORT (should FAIL)
NODE_ENV=production npm start
# Expected: Error: PORT environment variable is required in production

# Test with PORT (should SUCCEED)
PORT=8080 NODE_ENV=production npm start
# Expected: Server running on port 8080
```

---

## Railway Configuration Reference

### Current railway.json Configuration

```json
{
  "deploy": {
    "healthcheckPath": "/health",
    "healthcheckTimeout": 30,
    "healthcheckInterval": 30
  },
  "services": {
    "mcp-server": {
      "variables": {
        "NODE_ENV": { "default": "production" },
        "LOG_LEVEL": { "default": "info" }
      }
    }
  }
}
```

**Note**: PORT is NOT in railway.json because Railway injects it automatically.

### Required Environment Variables (Set in Railway Dashboard)

Must be set manually in Railway:
- ✅ `MONGODB_URI` - MongoDB connection string (TCP proxy URL)
- ✅ `JWT_SECRET` - JWT token secret (min 32 chars)
- ✅ `MONOLITH_API_URL` - Main Flora API URL
- ✅ `INTERNAL_SERVICE_TOKEN` - Service-to-service auth token
- ✅ `CREDENTIAL_ENCRYPTION_KEY` - 32-byte encryption key

Should be injected by Railway automatically:
- ⚠️ `PORT` - Server port (this is what we're fixing!)
- ✅ `RAILWAY_ENVIRONMENT` - Environment name (staging/production)

---

## Success Criteria

### Deployment is Successful When:

1. ✅ Railway logs show PORT value (not "NOT SET")
2. ✅ App starts without errors
3. ✅ Logs show: "Flora MCP Server Microservice running on port XXXX"
4. ✅ Port XXXX matches Railway's injected PORT (not 4005)
5. ✅ Healthcheck status shows 🟢 Healthy
6. ✅ Curl to /health endpoint returns 200 OK
7. ✅ Service accessible via public domain

### Deployment Needs Investigation When:

1. ❌ Logs show "PORT: NOT SET"
2. ❌ App crashes with PORT required error
3. ❌ App binds to port 4005 (hardcoded fallback)
4. ❌ Healthcheck status shows 🔴 Unhealthy
5. ❌ 502/503 errors when accessing service
6. ❌ Service not accessible via public domain

---

## Next Steps After Successful Deployment

1. **Remove Debug Logging** (Optional)
   - Once confirmed working, clean up console.log statements
   - Keep validation logic, remove verbose logging

2. **Document Railway Configuration**
   - Update deployment docs with PORT requirements
   - Add troubleshooting guide for other microservices

3. **Apply Fix to Other Microservices**
   - flora-command-center might have same issue
   - Review other Dockerfiles for hardcoded EXPOSE

4. **Set Up Monitoring Alerts**
   - Alert if service healthcheck fails
   - Alert if PORT env var missing
   - Monitor service uptime and response times

---

## References

- **Railway PORT Injection**: https://docs.railway.app/deploy/deployments#port-variable
- **Docker EXPOSE Directive**: https://docs.docker.com/engine/reference/builder/#expose
- **Railway Healthchecks**: https://docs.railway.app/deploy/healthchecks
- **Node.js Production Best Practices**: https://expressjs.com/en/advanced/best-practice-performance.html

---

## Support

If issues persist after deployment:

1. Check Railway logs for detailed error messages
2. Review PORT_DEBUG_INSTRUCTIONS.md for detailed troubleshooting
3. Verify Railway service configuration (networking, variables, healthcheck)
4. Test locally with production environment variables
5. Contact Railway support if PORT injection not working

---

**Last Updated**: 2026-07-16
**Version**: 1.0.0
**Status**: Ready for Deployment
