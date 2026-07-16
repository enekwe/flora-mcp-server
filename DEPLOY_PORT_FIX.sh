#!/bin/bash

# Flora MCP Server — Deploy PORT Configuration Fix
# This script commits and pushes the PORT debug/fix changes to trigger Railway redeploy

set -e

echo "=========================================="
echo "Flora MCP Server - PORT Fix Deployment"
echo "=========================================="
echo ""

# Change to the microservices directory
cd "$(dirname "$0")"
MICROSERVICE_DIR=$(pwd)
echo "Working directory: $MICROSERVICE_DIR"
echo ""

# Verify we're in the correct directory
if [ ! -f "server.js" ]; then
    echo "ERROR: server.js not found. Are you in the flora-mcp-server directory?"
    exit 1
fi

echo "Files modified for PORT fix:"
echo "  1. src/config/index.js - Added PORT validation & debug logging"
echo "  2. src/index.js - Removed double fallback, added logging"
echo "  3. server.js - Added Railway environment detection"
echo "  4. Dockerfile - Removed EXPOSE 4005 and HEALTHCHECK"
echo ""

# Show the changes
echo "=========================================="
echo "Git Diff Summary"
echo "=========================================="
git diff --stat src/config/index.js src/index.js server.js Dockerfile

echo ""
echo "=========================================="
echo "Detailed Changes"
echo "=========================================="
git diff src/config/index.js src/index.js server.js Dockerfile

echo ""
echo "=========================================="
read -p "Proceed with commit and push? (y/N) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled."
    exit 0
fi

# Stage the changes
echo ""
echo "Staging changes..."
git add src/config/index.js src/index.js server.js Dockerfile PORT_DEBUG_INSTRUCTIONS.md DEPLOY_PORT_FIX.sh

# Commit with detailed message
echo ""
echo "Creating commit..."
git commit -m "fix(mcp-server): resolve Railway PORT injection issue

Problem:
- App was binding to hardcoded port 4005 instead of Railway's PORT
- Healthcheck failing because Railway probes a different port
- Logs showed: 'Flora MCP Server Microservice running on port 4005'

Root Causes Identified:
1. Dockerfile had EXPOSE 4005 hardcoded (line 133)
2. Dockerfile HEALTHCHECK used shell variable expansion (unreliable)
3. Double fallback in code: config.PORT || 4005
4. No validation that Railway actually injected PORT

Changes Made:

1. src/config/index.js:
   - Added PORT debug logging to see Railway's injection
   - Added production PORT validation (fails if not set)
   - Explicit error when PORT missing in production
   - Throws error with all env keys for debugging

2. src/index.js:
   - Removed double fallback (config.PORT || 4005)
   - Added startup logging for PORT visibility
   - Now uses config.PORT directly (already validated)

3. server.js:
   - Added Railway environment detection logging
   - Logs NODE_ENV, PORT, RAILWAY_ENVIRONMENT at startup
   - Helps diagnose if Railway is injecting variables

4. Dockerfile:
   - REMOVED: EXPOSE 4005 (was interfering with Railway)
   - REMOVED: HEALTHCHECK (Railway has its own mechanism)
   - Railway uses healthcheckPath from railway.json instead

Expected Behavior After Deploy:

Success Case:
  [SERVER.JS] PORT: 8080
  [CONFIG DEBUG] PORT from process.env.PORT: 8080
  info: Flora MCP Server Microservice running on port 8080
  ✓ Healthcheck passes at Railway's assigned port

Failure Case:
  [SERVER.JS] PORT: NOT SET
  [CRITICAL] Railway did not inject PORT environment variable!
  Error: PORT environment variable is required in production
  → Manual PORT configuration needed in Railway dashboard

References:
- Railway PORT docs: https://docs.railway.app/deploy/deployments#port-variable
- Dockerfile EXPOSE vs runtime: EXPOSE is documentation only
- Railway healthcheck: Uses railway.json not Dockerfile HEALTHCHECK

Testing:
- Local dev: Uses PORT=4005 fallback (correct)
- Production: Requires PORT from Railway (enforced)
- Healthcheck: Railway probes /health at assigned PORT"

echo ""
echo "Commit created successfully!"
echo ""

# Push to remote
echo "Pushing to remote..."
git push origin main

echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo ""
echo "Next Steps:"
echo ""
echo "1. Monitor Railway deployment logs:"
echo "   - Go to Railway dashboard → flora-mcp-server → Deployments"
echo "   - Watch for PORT debug output in logs"
echo ""
echo "2. Check for these log patterns:"
echo ""
echo "   SUCCESS (Railway injecting PORT):"
echo "   ✓ [SERVER.JS] PORT: 8080"
echo "   ✓ [CONFIG DEBUG] PORT from process.env.PORT: 8080"
echo "   ✓ info: Flora MCP Server Microservice running on port 8080"
echo ""
echo "   FAILURE (Railway NOT injecting PORT):"
echo "   ✗ [SERVER.JS] PORT: NOT SET"
echo "   ✗ [CRITICAL] Railway did not inject PORT environment variable!"
echo "   ✗ Error: PORT environment variable is required..."
echo ""
echo "3. If FAILURE occurs:"
echo "   - Open Railway dashboard → flora-mcp-server → Variables"
echo "   - Manually add: PORT = 8080"
echo "   - Redeploy"
echo ""
echo "4. Verify healthcheck:"
echo "   - Railway dashboard → Service metrics"
echo "   - Should show 'Healthy' status"
echo "   - Healthcheck endpoint: https://<domain>/health"
echo ""
echo "5. Read detailed instructions:"
echo "   cat PORT_DEBUG_INSTRUCTIONS.md"
echo ""
echo "=========================================="
