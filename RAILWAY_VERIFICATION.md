# Railway Deployment Verification - Quick Reference

## What Was Fixed

**Problem**: Dockerfile had `ENV PORT=4005` baked in at build time, overriding Railway's runtime PORT injection.

**Solution**: Removed ENV PORT=4005 from Dockerfile. App code already has proper fallback (`process.env.PORT || 4005`).

**Commits**:
- `52bb6dd` - HEALTHCHECK sh -c wrapper for variable expansion
- `4e9cf7d` - Remove ENV PORT=4005 from Dockerfile

---

## Railway Deployment Checklist

### 1. Pre-Deployment Verification
- [x] Dockerfile has no `ENV PORT` declaration
- [x] Application reads `process.env.PORT` with fallback
- [x] HEALTHCHECK uses `${PORT:-4005}` with sh -c wrapper
- [x] railway.json has no PORT variable (allows injection)
- [x] Changes pushed to github.com/enekwe/flora-mcp-server

### 2. During Deployment
Watch Railway logs for these key indicators:

**Build Stage**:
```
[Build] Successfully built Docker image
[Build] No ENV PORT found in Dockerfile ✓
```

**Startup Stage**:
```
[INFO] Starting Flora MCP Server Microservice...
[INFO] Environment: production
[INFO] MongoDB URI: [configured]
[INFO] Flora MCP Server Microservice running on port <RAILWAY_PORT>
                                                         ^^^^^^^^^^^^
                                                    Should match Railway's
                                                    assigned port (not 4005)
```

**Healthcheck Stage**:
```
[Healthcheck] Probing http://localhost:<RAILWAY_PORT>/health
[Healthcheck] Response: 200 OK
[Healthcheck] Status: healthy ✓
```

### 3. Post-Deployment Verification

**Check Railway Dashboard**:
- Deployment Status: Active (green)
- Healthcheck: Passing
- Logs show: "running on port <assigned_port>"

**Test Endpoints**:
```bash
# Health check
curl https://<railway-domain>/health

# Expected response:
{
  "success": true,
  "service": "flora-mcp-server",
  "status": "healthy",
  "timestamp": "2026-07-16T...",
  "uptime": <seconds>,
  "environment": "production",
  "mcpTools": 8,
  "version": "1.0.0"
}

# API root
curl https://<railway-domain>/api

# Expected response:
{
  "success": true,
  "service": "flora-mcp-server",
  "version": "1.0.0",
  "description": "Flora MCP Server — IDE/CLI bridge to Command Center safety harness",
  "endpoints": {
    "mcpTools": "/api/mcp/tools/*",
    "apiKeys": "/api-keys",
    "connections": "/connections",
    "schema": "/schema/mcp-config",
    "health": "/health"
  }
}
```

---

## Troubleshooting

### If Healthcheck Still Fails

**Check 1: Verify PORT in logs**
```bash
# Railway logs should show:
Flora MCP Server Microservice running on port <X>

# Check if <X> matches Railway's assigned port
# (visible in Railway dashboard under Variables)
```

**Check 2: Test healthcheck manually**
```bash
# SSH into Railway container (if available)
echo $PORT
curl http://localhost:$PORT/health
```

**Check 3: Verify Docker image has no baked PORT**
```bash
# In local environment
docker pull <railway-registry>/<image>
docker inspect <image-id> | grep PORT
# Should NOT show "PORT=4005" in Env array
```

**Check 4: Review Railway environment variables**
```
Railway Dashboard → Service → Variables
Should NOT have PORT variable defined
(Let Railway inject it automatically)
```

---

## Common Issues & Solutions

### Issue 1: "App binds to 4005 but Railway probes different port"
**Cause**: ENV PORT still in Dockerfile
**Solution**: Verify Dockerfile line 148-155 has NO PORT in ENV declaration

### Issue 2: "PORT is undefined in application"
**Cause**: Railway not injecting PORT
**Solution**: Check railway.json has no PORT variable defined

### Issue 3: "Healthcheck command fails"
**Cause**: HEALTHCHECK not using shell variable expansion
**Solution**: Verify HEALTHCHECK uses `sh -c 'curl ... ${PORT:-4005} ...'`

### Issue 4: "MongoDB connection fails"
**Cause**: Unrelated to PORT fix, check MONGODB_URI
**Solution**: Verify Railway variables have correct MongoDB connection string

---

## Expected Behavior

### Railway Environment
- Railway assigns PORT (e.g., 8080, 3000, 6000, etc.)
- App reads Railway's PORT and binds to it
- Healthcheck probes same PORT
- All endpoints accessible on Railway's assigned PORT

### Local Development
```bash
# docker-compose: Uses PORT=4005 from environment
docker-compose up

# Docker direct: Can override
docker run -e PORT=3000 flora-mcp-server

# Node direct: Fallback to 4005
npm start
```

---

## Success Criteria

- [ ] Railway deployment status: Active
- [ ] Healthcheck status: Passing
- [ ] Logs show: "running on port <railway_assigned_port>"
- [ ] `curl https://<railway-domain>/health` returns 200 OK
- [ ] No "service unavailable" errors
- [ ] App accessible on Railway's public URL

---

## Files Modified

**Primary**:
- `/Users/cope/Passbook_Oracle/microservices/flora-mcp-server/Dockerfile`
  - Removed `ENV PORT=4005` (line 150)
  - Added sh -c wrapper to HEALTHCHECK (line 138)

**Verified (No Changes Needed)**:
- `src/config/index.js` - Already has proper fallback
- `src/index.js` - Already has proper fallback
- `railway.json` - Already cleaned up (no PORT variable)
- `.env.example` - Template only, safe
- `docker-compose.yml` - Local dev only, safe

---

## Contact & Support

If healthcheck still fails after these fixes:
1. Check Railway logs for PORT value in startup message
2. Verify Railway's assigned PORT in dashboard
3. Confirm both match (app binds to Railway's PORT)
4. Test healthcheck endpoint manually: `curl https://<domain>/health`

**Repository**: https://github.com/enekwe/flora-mcp-server
**Latest Commit**: 52bb6dd (2026-07-16)
