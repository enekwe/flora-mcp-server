# Flora Development Rules

## Railway Deployment Protocol

### Critical Rule: Always Check Working Configuration First

**This protocol is MANDATORY for EVERY deployment, not just when fixing issues!**

**Before making ANY changes that will be deployed to Railway, you MUST:**

1. **Identify the Last Working Deployment**
   ```bash
   # Find the last successful deployment commit
   git log --oneline --all -20
   git log --oneline --grep="deploy\|railway\|fix" -10
   ```

2. **Inspect the Working Configuration**
   ```bash
   # Compare current state with last working commit
   WORKING_COMMIT="9dc71f6"  # Example: last known working commit

   git show $WORKING_COMMIT:Dockerfile
   git show $WORKING_COMMIT:src/config/index.js
   git show $WORKING_COMMIT:server.js
   git show $WORKING_COMMIT:src/index.js
   ```

3. **Identify What Changed**
   ```bash
   # See what's different between working and current
   git diff $WORKING_COMMIT Dockerfile
   git diff $WORKING_COMMIT src/config/index.js
   git diff $WORKING_COMMIT server.js
   git diff $WORKING_COMMIT src/index.js
   ```

4. **Align Changes with Working Configuration**
   - Compare your proposed fixes with the working version
   - Ensure changes don't conflict with Railway's requirements
   - Verify PORT injection logic matches working version
   - Check error handler registration order
   - Validate route handler signatures

### Railway-Specific Configuration Requirements

Based on commit `9dc71f6` (last known working configuration):

#### 1. Dockerfile Rules
- ✅ **DO NOT** include `EXPOSE` directive (Railway handles port assignment)
- ✅ **DO NOT** include `HEALTHCHECK` directive (Railway provides healthcheck mechanism)
- ✅ Use multi-stage builds for security and size optimization
- ✅ Run as non-root user (`flora-mcp`)

#### 2. PORT Configuration Rules
- ✅ Railway injects `PORT` environment variable at runtime
- ✅ In production: REQUIRE PORT from Railway (fail-fast if missing)
- ✅ In development: Allow fallback to `4005`
- ✅ **Single source of truth** for PORT (no double fallbacks)
- ✅ Add debug logging for PORT resolution

**Implementation** (see `src/config/index.js`):
```javascript
const getPort = () => {
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.PORT) {
      throw new Error('PORT environment variable required in production');
    }
    return parseInt(process.env.PORT, 10);
  }
  return parseInt(process.env.PORT || '4005', 10);
};
```

#### 3. Error Handler Registration Rules
- ✅ Error handlers MUST be registered AFTER routes
- ✅ Register error handlers AFTER `microservice.initialize()`
- ✅ Register BEFORE `microservice.start()`

**Correct Order** (see `server.js`):
```javascript
await microservice.initialize();  // Routes registered here

// Error handlers AFTER routes
microservice.app.use(notFound);
microservice.app.use(errorHandler);

await microservice.start();
```

#### 4. Express Route Handler Signature Rules
- ✅ All async route handlers MUST have `next` parameter
- ✅ Call `next(error)` in catch blocks
- ✅ Format: `async (req, res, next) => { ... }`

**Correct Implementation**:
```javascript
mcpRouter.post('/tools/work_orders/list',
  mcpRbacMiddleware('workOrders', 'read'),
  async (req, res, next) => {  // ← MUST have 'next'
    try {
      const result = await handleWorkOrdersList(req.body.args, req.mcpAuth);
      res.json({ success: true, ...result });
    } catch (error) {
      next(error);  // ← Pass error to Express error handler
    }
  }
);
```

#### 5. Healthcheck Endpoint Rules
- ✅ Implement `/health` endpoint that returns HTTP 200
- ✅ Healthcheck should verify MongoDB connection
- ✅ Use Railway's built-in healthcheck mechanism (defined in `railway.json`)
- ✅ **DO NOT** implement healthcheck in Dockerfile

**Configuration** (`railway.json`):
```json
{
  "deploy": {
    "healthcheckPath": "/health",
    "healthcheckTimeout": 300,
    "restartPolicyType": "on_failure"
  }
}
```

### Common Railway Deployment Issues

#### Issue: Healthcheck Fails Despite Server Starting
**Symptoms**:
- Server logs show successful startup
- MongoDB connects
- Healthcheck endpoint returns 503 Service Unavailable

**Root Causes**:
1. Route handlers missing `next` parameter → errors crash the app
2. Error handlers registered before routes → middleware order violation
3. Duplicate initialization code → conflicting Express app instances

**Fix**:
1. Check working configuration first (see protocol above)
2. Restore `next` parameter to all route handlers
3. Move error handler registration to after `initialize()`
4. Remove duplicate initialization code

#### Issue: Railway Uses Wrong PORT
**Symptoms**:
- App always uses 4005 even though Railway injects different PORT
- Healthcheck probes wrong port

**Root Cause**:
- Double fallback logic masks Railway's PORT injection

**Fix**:
1. Remove double fallbacks (config || 4005 AND PORT || 4005)
2. Use single source of truth in `src/config/index.js`
3. Require PORT in production (fail-fast)
4. Add PORT debug logging

### Verification Before Deployment

**Required Checks**:

```bash
# 1. Syntax check
node --check server.js

# 2. Compare with working version
git diff 9dc71f6 Dockerfile
git diff 9dc71f6 src/config/index.js
git diff 9dc71f6 server.js
git diff 9dc71f6 src/index.js

# 3. Run local tests
npm test

# 4. Verify route handler signatures
grep -n "async (req, res)" src/index.js  # Should return 0 results
grep -n "async (req, res, next)" src/index.js  # Should find all handlers

# 5. Verify error handler order in server.js
grep -A 3 -B 3 "microservice.app.use(notFound)" server.js
```

### Deployment Process

1. **Pre-deployment**: Run verification checks above
2. **Commit**: Use descriptive commit message with root cause analysis
3. **Push**: `git push origin main`
4. **Monitor**: Watch Railway build logs and deployment logs
5. **Verify**: Check healthcheck passes and service shows "healthy"

### Documentation Requirements

When fixing Railway deployment issues:

1. **Document Root Cause** in commit message
2. **Create Investigation Report** (e.g., `INVESTIGATION_REPORT.md`)
3. **Update Verification Guides** (e.g., `RAILWAY_VERIFICATION.md`)
4. **Include Test Scripts** for future verification

### References

- Railway Docs: https://docs.railway.app/deploy/deployments
- Last Known Working Commit: `9dc71f6`
- Investigation Reports: See `INVESTIGATION_REPORT.md`, `PORT_FIX_SUMMARY.md`

---

**Remember**: When in doubt, compare with the last working Railway configuration first!
