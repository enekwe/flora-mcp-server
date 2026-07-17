# Claude Code Configuration for Flora MCP Server

## CRITICAL: Session Initialization Protocol

**This instruction MUST be followed at EVERY session start, including after chat compaction or when context usage exceeds 50%.**

### Mandatory First Action

When starting ANY work session in this repository, you MUST:

1. **Read the deployment rules** (even if you think you remember them):
   ```
   Read: /FLORA_DEVELOPMENT_RULES.md
   Read: /SKILLS.md
   ```

2. **Acknowledge understanding** by confirming:
   - ✅ You've read the latest version of both files
   - ✅ You understand the "check working configuration first" protocol
   - ✅ You will follow the Railway deployment workflow for EVERY deployment
   - ✅ You will not make Railway-related changes without comparing to last working commit

### Why This Matters

**Context compaction does NOT preserve learned workflows.** Every time context is compacted or a new session starts:
- Previous understanding of deployment protocols is lost
- Working configuration patterns are forgotten
- Railway-specific requirements may be ignored

**Reading these files at session start ensures:**
- You have current deployment protocols (files may have been updated)
- You understand Railway's specific requirements
- You follow the mandatory "compare with working config" workflow
- You don't repeat past mistakes that broke deployments

### Session Start Checklist

```
□ Read FLORA_DEVELOPMENT_RULES.md
□ Read SKILLS.md
□ Identify last working Railway commit (currently: 9dc71f6)
□ Understand mandatory pre-deployment verification steps
□ Ready to work with proper context
```

### Key Rules to Remember After Reading

From **FLORA_DEVELOPMENT_RULES.md**:
- ✅ Always check working configuration FIRST (before any Railway changes)
- ✅ No EXPOSE or HEALTHCHECK in Dockerfile
- ✅ PORT must be injected by Railway (fail-fast in production)
- ✅ Error handlers registered AFTER microservice.initialize()
- ✅ All route handlers must have `next` parameter

From **SKILLS.md**:
- ✅ Railway deployment workflow is mandatory for EVERY deployment
- ✅ Compare current vs working config before making changes
- ✅ Verify alignment with last working commit
- ✅ Test locally before pushing to Railway

### If You Haven't Read These Files This Session

**STOP.** Do not proceed with any Railway-related work until you:
1. Read `/FLORA_DEVELOPMENT_RULES.md`
2. Read `/SKILLS.md`
3. Confirm understanding of the protocols

### After Context Compaction

If you notice this is a resumed session or context has been compacted:
1. **Immediately** re-read both files
2. Ask the user for the current working commit hash if not obvious
3. Verify you understand the current deployment state
4. Only then proceed with work

---

## Additional Project Configuration

### Project Structure
```
flora-mcp-server/
├── server.js                    # Main entry point
├── src/
│   ├── index.js                 # FloraMcpServerMicroservice class
│   ├── config/
│   │   ├── index.js             # Configuration (PORT logic here!)
│   │   ├── database.js          # MongoDB connection
│   │   └── logger.js            # Winston logger
│   ├── middleware/              # Auth, RBAC, rate limiting
│   ├── models/                  # McpApiKey, McpConnection
│   └── tools/                   # MCP tool handlers
├── Dockerfile                   # Multi-stage build (NO EXPOSE, NO HEALTHCHECK)
├── railway.json                 # Railway configuration
├── FLORA_DEVELOPMENT_RULES.md   # ⚠️ READ THIS FIRST
└── SKILLS.md                    # ⚠️ READ THIS FIRST
```

### Working Baseline
- **Last Known Working Commit**: `9dc71f6`
- **Commit Message**: "fix(mcp-server): resolve Railway PORT injection with comprehensive validation"
- **Date**: Thu Jul 16 16:01:57 2026

### Verification Commands
```bash
# Always compare with working baseline before Railway changes
git diff 9dc71f6 Dockerfile
git diff 9dc71f6 src/config/index.js
git diff 9dc71f6 server.js
git diff 9dc71f6 src/index.js
```

---

## Never Skip These Steps

Even if the user says:
- "Just fix it quickly"
- "This is a small change"
- "I know what the issue is"

You MUST still:
1. Read FLORA_DEVELOPMENT_RULES.md and SKILLS.md (this session)
2. Compare with working configuration
3. Follow the deployment protocol

**No exceptions.** Past Railway failures were caused by skipping these steps.

---

**This configuration persists across context compaction and session restarts.**
