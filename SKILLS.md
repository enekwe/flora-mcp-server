# Flora MCP Server - Development Skills & Workflows

## Skill: Railway Deployment (Required for Every Deployment)

### When to Use This Skill
**ALWAYS use this workflow for EVERY Railway deployment**, whether:
- Making routine code changes
- Fixing bugs or adding features
- Debugging failed deployments
- Railway healthcheck is failing
- Deployment succeeds but service shows unhealthy
- Server starts but endpoints don't respond
- PORT configuration issues
- Any Railway deployment (successful or failed)

**This is a mandatory workflow, not just for troubleshooting!**

### Workflow

#### Step 1: Identify Last Working Configuration
**Before making any code changes**, find the last successful deployment:

```bash
# Check recent commits
git log --oneline -20

# Find deployment-related commits
git log --oneline --grep="railway\|deploy\|fix" -10

# Check current HEAD
git log -1 --oneline

# Identify last known working commit (example: 9dc71f6)
WORKING_COMMIT="9dc71f6"
```

#### Step 2: Compare Working vs Current Configuration

```bash
# Compare key files
echo "=== Dockerfile Differences ==="
git diff $WORKING_COMMIT Dockerfile

echo "=== Config Differences ==="
git diff $WORKING_COMMIT src/config/index.js

echo "=== Server Differences ==="
git diff $WORKING_COMMIT server.js

echo "=== Routes Differences ==="
git diff $WORKING_COMMIT src/index.js | head -200
```

#### Step 3: Analyze Differences

Look for these common issues:

1. **Route Handler Signatures**
   - Working: `async (req, res, next) => {`
   - Broken: `async (req, res) => {` (missing `next`)

2. **Error Handler Registration**
   - Working: After `microservice.initialize()`
   - Broken: Before `microservice.initialize()`

3. **PORT Configuration**
   - Working: Single source of truth, fail-fast in production
   - Broken: Double fallbacks, always defaults to 4005

4. **Dockerfile Directives**
   - Working: No EXPOSE, no HEALTHCHECK
   - Broken: Has EXPOSE 4005, has HEALTHCHECK

#### Step 4: Create Targeted Fixes

Based on differences identified, restore working configuration:

```bash
# Example: Fix route handlers
# Find all handlers missing 'next' parameter
grep -n "async (req, res)" src/index.js

# For each match, add 'next' parameter
# Before: async (req, res) => {
# After:  async (req, res, next) => {
```

#### Step 5: Verify Alignment

```bash
# After making fixes, verify they match working version
git diff $WORKING_COMMIT src/index.js | wc -l
# Should be minimal (or zero if fully aligned)

# Check specific sections
git show $WORKING_COMMIT:src/index.js | grep -A 5 "POST.*work_orders/list"
# Compare with current version
```

#### Step 6: Test Before Deployment

```bash
# Syntax check
node --check server.js

# Verify route handler count
echo "Route handlers with correct signature:"
grep -c "async (req, res, next)" src/index.js

# Verify error handler order
grep -A 2 "microservice.initialize()" server.js | grep -c "microservice.app.use(notFound)"
# Should return 1 (handlers after initialize)
```

#### Step 7: Deploy with Confidence

```bash
# Stage changes
git add src/index.js server.js

# Commit with descriptive message
git commit -m "fix(railway): restore working configuration from $WORKING_COMMIT

Root Cause:
- [Describe what was broken]

Changes:
- [List specific fixes]

Verification:
- Compared with working commit $WORKING_COMMIT
- All changes align with last successful deployment

Expected Result:
- Healthcheck passes
- Service shows healthy status"

# Push to Railway
git push origin main
```

#### Step 8: Monitor Deployment

```bash
# Watch Railway logs (if Railway CLI is configured)
railway logs --follow

# Or check Railway dashboard:
# https://railway.app/project/[project-id]
```

### Success Criteria

- ✅ Build completes successfully
- ✅ Container starts and MongoDB connects
- ✅ Health endpoint returns HTTP 200
- ✅ Railway healthcheck passes (no "service unavailable" errors)
- ✅ Service shows "healthy" status in Railway dashboard

### Rollback Plan

If deployment fails:

```bash
# Revert to last working commit
git reset --hard $WORKING_COMMIT

# Force push (only if safe to do so)
git push --force origin main

# Or create a revert commit (safer)
git revert HEAD
git push origin main
```

### Common Pitfalls

❌ **Don't**: Make changes without comparing to working version
✅ **Do**: Always check `git diff $WORKING_COMMIT` first

❌ **Don't**: Guess at what Railway needs
✅ **Do**: Follow Railway documentation and working examples

❌ **Don't**: Test fixes only in production
✅ **Do**: Verify locally with syntax checks first

❌ **Don't**: Make multiple unrelated changes in one commit
✅ **Do**: Make focused, targeted fixes that match working version

### Documentation Requirements

After successful deployment, document:

1. **Root Cause**: What was broken and why
2. **Comparison**: How current differed from working version
3. **Fixes Applied**: Specific changes made to restore working config
4. **Verification**: Tests run to confirm alignment
5. **Commit Reference**: Link to working commit used as baseline

### Tools & References

- **Working Baseline**: Commit `9dc71f6`
- **Configuration Rules**: See `FLORA_DEVELOPMENT_RULES.md`
- **Investigation Reports**:
  - `INVESTIGATION_REPORT.md`
  - `PORT_FIX_SUMMARY.md`
  - `RAILWAY_PORT_FIX_AUDIT.md`
- **Verification Scripts**: `test-port-config.sh`

---

## Skill: Express Middleware Debugging

### Route Handler Error Pattern

**Problem**: Route handler throws error but Express app crashes

**Diagnosis**:
```bash
# Check if handlers have 'next' parameter
grep -n "async (req, res)" src/index.js
# Any results = missing 'next' parameter
```

**Fix**:
```javascript
// Before (WRONG)
async (req, res) => {
  try {
    // ...
  } catch (error) {
    next(error);  // ReferenceError: next is not defined!
  }
}

// After (CORRECT)
async (req, res, next) => {  // ← Add 'next' parameter
  try {
    // ...
  } catch (error) {
    next(error);  // ✅ Works correctly
  }
}
```

### Error Handler Registration Order

**Problem**: Error handlers not catching errors

**Diagnosis**:
```bash
# Check when error handlers are registered
grep -B 3 -A 3 "app.use(errorHandler)" server.js
```

**Fix**:
```javascript
// Before (WRONG)
const microservice = new FloraMcpServerMicroservice();
microservice.app.use(notFound);      // ← TOO EARLY
microservice.app.use(errorHandler);  // ← TOO EARLY
await microservice.initialize();     // Routes registered here

// After (CORRECT)
const microservice = new FloraMcpServerMicroservice();
await microservice.initialize();     // Routes registered here
microservice.app.use(notFound);      // ← After routes
microservice.app.use(errorHandler);  // ← After routes
```

---

## Skill: PORT Configuration Debugging

### Railway PORT Injection Issues

**Problem**: App always uses port 4005, Railway's PORT is ignored

**Diagnosis**:
```bash
# Check for double fallbacks
grep -n "PORT.*4005" src/config/index.js
grep -n "PORT.*||" src/index.js
```

**Working Pattern** (from `9dc71f6`):
```javascript
// src/config/index.js
const getPort = () => {
  // Production: REQUIRE PORT from Railway
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.PORT) {
      throw new Error('PORT required in production');
    }
    return parseInt(process.env.PORT, 10);
  }
  // Development: Allow fallback
  return parseInt(process.env.PORT || '4005', 10);
};

module.exports = {
  PORT: getPort(),  // Single source of truth
  // ...
};
```

**Wrong Pattern**:
```javascript
// DON'T DO THIS - Double fallback masks Railway's PORT
const PORT = config.PORT || 4005;  // First fallback
const server = app.listen(process.env.PORT || PORT);  // Second fallback
```

---

## Skill: MongoDB Authentication Failures on Railway

### When to Use This Skill

Use this skill when:
- Service crashes with "MongoDB connection failed: Authentication failed"
- Error code 18 (AuthenticationFailed)
- Service fails healthcheck during deployment
- Logs show "MongoServerError: Authentication failed"
- Service crash loops on startup
- MongoDB connection works locally but fails on Railway

### Symptoms

**Deployment Logs**:
```
[error]: MongoDB connection failed: Authentication failed.
{"service":"flora-docassemble-service","ok":0,"code":18,"codeName":"AuthenticationFailed"}
```

**Service Behavior**:
- Container starts successfully
- Other services initialize (S3, DocAssemble client)
- MongoDB connection fails immediately
- Server crashes before health endpoint responds
- Railway healthcheck fails with "service unavailable"
- Crash loop: service restarts every few seconds

### Diagnosis

#### Step 1: Check Current MONGODB_URI

```bash
# Get current value from Railway
railway variables --service <service-name> --json | grep MONGODB_URI

# Example output:
"MONGODB_URI": "mongodb://mongo:PASSWORD@metro.proxy.rlwy.net:59998/venturestudio"
```

#### Step 2: Compare with Working Service

```bash
# Check a known working service (e.g., flora-mcp-server)
railway variables --service flora-mcp-server --json | grep MONGODB_URI

# Look for differences in:
# - Host and port
# - Database name
# - Query parameters (especially authSource)
```

#### Step 3: Check for Common Issues

**Issue #1: Missing authSource Parameter**
```bash
# BROKEN (missing authSource):
mongodb://mongo:PASSWORD@metro.proxy.rlwy.net:59998/venturestudio

# WORKING (has authSource):
mongodb://mongo:PASSWORD@metro.proxy.rlwy.net:59998/venturestudio?authSource=admin
```

**Issue #2: Wrong Database Name**
```bash
# Check if database exists - should use shared 'venturestudio' database
# BROKEN: /flora-docassemble (service-specific database that doesn't exist)
# WORKING: /venturestudio (shared Flora database)
```

**Issue #3: Railway Internal DNS**
```bash
# BROKEN (internal DNS doesn't resolve):
mongodb://mongo:PASSWORD@mongodb.railway.internal:27017/venturestudio

# WORKING (TCP proxy):
mongodb://mongo:PASSWORD@metro.proxy.rlwy.net:59998/venturestudio
```

#### Step 4: Check Dockerfile for Anti-Patterns

```bash
# Check for Railway anti-patterns
grep -n "EXPOSE" Dockerfile
grep -n "HEALTHCHECK" Dockerfile

# Both should return NOTHING for Railway deployments
# Railway handles ports and healthchecks via railway.json
```

#### Step 5: Check Database Config Code

```bash
# Review how service connects to MongoDB
cat src/config/database.js

# Look for:
# - Deprecated options (useNewUrlParser, useUnifiedTopology)
# - Hardcoded connection strings
# - Environment variable overrides
```

### Fix

#### Fix 1: Add authSource Parameter

**Update Railway Variable**:
```bash
railway variables --service <service-name> --set \
  MONGODB_URI="mongodb://mongo:LegGfRDdPGDxZgqDGbqjFJWlWASmCGNB@metro.proxy.rlwy.net:59998/venturestudio?authSource=admin"
```

**Why This Works**:
- `authSource=admin` tells MongoDB to authenticate credentials against admin database
- User `mongo` has permissions defined in admin database
- Without this, MongoDB tries to authenticate against target database (venturestudio)
- Admin database has the user credentials, so authentication succeeds

#### Fix 2: Remove Dockerfile Anti-Patterns

**Remove EXPOSE directive**:
```dockerfile
# BEFORE (WRONG):
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3013  # ← REMOVE THIS LINE
CMD ["npm", "start"]

# AFTER (CORRECT):
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
# Railway injects PORT dynamically - no EXPOSE needed
CMD ["npm", "start"]
```

**Remove HEALTHCHECK directive**:
```dockerfile
# BEFORE (WRONG):
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3013/health')"

# AFTER (CORRECT):
# No HEALTHCHECK in Dockerfile
# Railway uses railway.json: { "deploy": { "healthcheckPath": "/health" } }
```

#### Fix 3: Remove Deprecated MongoDB Options

**File**: `src/config/database.js`

```javascript
// BEFORE (has deprecated options):
const options = {
  useNewUrlParser: true,         // DEPRECATED - remove
  useUnifiedTopology: true,      // DEPRECATED - remove
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  maxPoolSize: 10,
  minPoolSize: 2
};

// AFTER (modern options only):
const options = {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  maxPoolSize: 10,
  minPoolSize: 2
};
```

#### Fix 4: Use Correct Database Name

```bash
# Flora services use SHARED database 'venturestudio'
# NOT service-specific databases like 'flora-docassemble'

# CORRECT pattern:
mongodb://mongo:PASSWORD@metro.proxy.rlwy.net:59998/venturestudio?authSource=admin
```

### Verification

#### Step 1: Syntax Check

```bash
node --check src/config/database.js
node --check src/server.js
```

#### Step 2: Verify Railway Variable

```bash
railway variables --service <service-name> --json | grep MONGODB_URI
# Should show: ?authSource=admin at the end
```

#### Step 3: Verify Dockerfile

```bash
grep -c "EXPOSE" Dockerfile
# Should return: 0

grep -c "HEALTHCHECK" Dockerfile
# Should return: 0
```

#### Step 4: Monitor Deployment Logs

```bash
railway logs --service <service-name> --tail 30

# Watch for success indicators:
# ✅ "MongoDB connected successfully"
# ✅ "database: venturestudio"
# ✅ "host: metro.proxy.rlwy.net"
# ✅ "Service running on port <PORT>"
# ✅ "GET /health HTTP/1.1 200"

# Should NOT see:
# ❌ "Authentication failed"
# ❌ "MongoServerError"
# ❌ "service unavailable"
```

### Working Pattern Reference

**Complete Working Configuration**:

**Railway Variable**:
```bash
MONGODB_URI=mongodb://mongo:LegGfRDdPGDxZgqDGbqjFJWlWASmCGNB@metro.proxy.rlwy.net:59998/venturestudio?authSource=admin
```

**Dockerfile** (no EXPOSE, no HEALTHCHECK):
```dockerfile
FROM node:18-alpine
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN mkdir -p logs

# Railway injects PORT via environment variable
# Railway handles healthcheck via railway.json
CMD ["npm", "start"]
```

**database.js**:
```javascript
const mongoose = require('mongoose');
const logger = require('./logger');

const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/flora-docassemble';

const options = {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  maxPoolSize: 10,
  minPoolSize: 2
};

const connectDB = async () => {
  try {
    await mongoose.connect(mongoURI, options);
    logger.info('MongoDB connected successfully', {
      database: mongoose.connection.db.databaseName,
      host: mongoose.connection.host
    });
  } catch (error) {
    logger.error('MongoDB connection failed:', error);
    throw error;
  }
};

module.exports = { connectDB };
```

**railway.json**:
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "healthcheckPath": "/health",
    "healthcheckTimeout": 100,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### Common Mistakes

❌ **Don't**: Use Railway variable references like `${{MONGO_URL}}`
✅ **Do**: Use explicit connection string with `?authSource=admin`

❌ **Don't**: Use service-specific database names (e.g., `/flora-docassemble`)
✅ **Do**: Use shared Flora database `/venturestudio`

❌ **Don't**: Add EXPOSE or HEALTHCHECK to Dockerfile
✅ **Do**: Let Railway inject PORT and handle healthchecks via railway.json

❌ **Don't**: Use Railway internal DNS (`mongodb.railway.internal`)
✅ **Do**: Use Railway TCP proxy (`metro.proxy.rlwy.net`)

❌ **Don't**: Include deprecated MongoDB options
✅ **Do**: Use only modern, supported connection options

### Comparison Matrix

| Configuration | Working (flora-mcp-server) | Broken | Fixed |
|--------------|---------------------------|--------|-------|
| **authSource** | ✅ Has `?authSource=admin` | ❌ Missing | ✅ Added |
| **Database** | ✅ `/venturestudio` | ❌ `/flora-docassemble` | ✅ `/venturestudio` |
| **Host** | ✅ `metro.proxy.rlwy.net` | ❌ May use internal DNS | ✅ `metro.proxy.rlwy.net` |
| **EXPOSE** | ✅ None | ❌ Has `EXPOSE 3013` | ✅ Removed |
| **HEALTHCHECK** | ✅ None | ❌ Has HEALTHCHECK | ✅ Removed |
| **Deprecated Options** | ✅ None | ❌ Has deprecated options | ✅ Removed |

### Success Criteria

After applying fixes, deployment should show:

```
✅ Build completes successfully
✅ Container starts
✅ MongoDB connected successfully
✅ Service started on dynamic PORT (e.g., 8080)
✅ Healthcheck passes (200 OK)
✅ Service shows "healthy" in Railway dashboard
✅ No crash loops
✅ No authentication errors
```

**Verified Working** (flora-docassemble-service as of 2026-07-17):
```
[info]: MongoDB connected successfully
[info]: database: venturestudio
[info]: host: metro.proxy.rlwy.net
[info]: Sync service started
[info]: Flora DocAssemble Service running on port 8080
[info]: GET /health HTTP/1.1 200 253 "RailwayHealthCheck/1.0"
```

---

**Remember**: Always compare with last working Railway configuration before making changes!
