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

**Remember**: Always compare with last working Railway configuration before making changes!
