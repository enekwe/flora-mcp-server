# AI Agent Configuration for Flora MCP Server

## For ALL AI Coding Assistants (Claude Code, Cursor, GitHub Copilot, etc.)

### 🚨 CRITICAL: Read This Section EVERY Session Start

**This applies to:**
- Claude Code
- Cursor AI
- GitHub Copilot Chat
- Windsurf
- Qwen Code
- Any AI coding assistant

**When this applies:**
- First time accessing this repository
- After chat/context compaction
- After session restart
- When context usage exceeds 50%
- ANY time you're unsure of deployment protocols

### Mandatory Session Initialization

**Before doing ANY work in this repository, you MUST:**

1. **Read these two files completely:**
   - `/FLORA_DEVELOPMENT_RULES.md` - Railway deployment protocol
   - `/SKILLS.md` - Development workflows and debugging

2. **Confirm you understand:**
   - The "check working configuration first" protocol
   - Railway-specific requirements (PORT, healthcheck, etc.)
   - Error handler registration order
   - Route handler signature requirements

3. **Identify the baseline:**
   - Last working Railway commit: `9dc71f6` (may change - check git log)
   - Current deployment state
   - Recent deployment issues (if any)

### Why This Is Non-Negotiable

**Previous Railway deployment failures were caused by:**
- ❌ AI assistants making changes without reading current protocols
- ❌ Skipping the "compare with working config" step
- ❌ Not understanding Railway's PORT injection requirements
- ❌ Breaking working configurations with "helpful" refactoring

**This mandatory reading prevents:**
- ✅ Repeating past mistakes
- ✅ Breaking working deployments
- ✅ Introducing bugs that cause healthcheck failures
- ✅ Wasting time debugging preventable issues

### Session Start Protocol (Required)

```
STEP 1: Read mandatory files
□ Read /FLORA_DEVELOPMENT_RULES.md completely
□ Read /SKILLS.md completely

STEP 2: Understand current state
□ Check last working commit: git log --oneline -5
□ Verify working baseline is still 9dc71f6 (or note new baseline)
□ Review any recent deployment issues

STEP 3: Acknowledge understanding
□ Confirm you've read both files THIS SESSION
□ Confirm you understand the mandatory protocols
□ Ready to proceed with proper context

STEP 4: Before ANY Railway-related changes
□ Compare current with working config first
□ Follow the deployment workflow from SKILLS.md
□ Verify changes align with working baseline
```

### After Context Compaction

Context compaction erases learned workflows. If you detect:
- Previous conversation history is missing
- You don't remember recent work
- Context usage was high and is now low
- Session was restarted

**You MUST:**
1. Re-read `/FLORA_DEVELOPMENT_RULES.md`
2. Re-read `/SKILLS.md`
3. Ask user for current state summary if needed
4. Re-familiarize yourself with working baseline

### Quick Reference Checklist

Before making Railway-related changes, verify:

**Dockerfile:**
- [ ] No `EXPOSE` directive
- [ ] No `HEALTHCHECK` directive
- [ ] Multi-stage build with non-root user

**PORT Configuration (src/config/index.js):**
- [ ] Fail-fast in production if PORT not provided
- [ ] Single source of truth (no double fallbacks)
- [ ] Development fallback to 4005 allowed

**Error Handlers (server.js):**
- [ ] Registered AFTER `microservice.initialize()`
- [ ] Registered BEFORE `microservice.start()`

**Route Handlers (src/index.js):**
- [ ] All handlers have `async (req, res, next)` signature
- [ ] All handlers call `next(error)` in catch blocks
- [ ] No handlers missing `next` parameter

**Pre-Deployment:**
- [ ] Compared with working commit (git diff 9dc71f6)
- [ ] Syntax check passed (node --check server.js)
- [ ] Verified route handler count and signatures
- [ ] Confirmed error handler registration order

### For Team Coordination

If multiple AI assistants work on this project:
- Each assistant MUST read these files at their session start
- Working baseline may change - check git log
- Update AGENTS.md if new patterns or issues are discovered
- Document any new "last working commit" in this file

### Current Project State (Update This Section)

**Last Known Working Deployment:**
- Commit: `9dc71f6`
- Date: Thu Jul 16 16:01:57 2026
- Message: "fix(mcp-server): resolve Railway PORT injection with comprehensive validation"

**Recent Issues Resolved:**
- Fixed missing `next` parameter in route handlers
- Fixed error handler registration order
- Removed duplicate initialization code

**Files Modified in Last Fix:**
- `server.js` - Error handler placement
- `src/index.js` - Route handler signatures, removed duplicates

**Next Deployment Status:**
- [ ] Ready for deployment
- [ ] Needs testing
- [ ] Has unresolved issues

(Update this section after each deployment)

---

## For Cursor AI Users

Add to `.cursorrules` in project root:
```
Before making any Railway deployment changes:
1. Read /FLORA_DEVELOPMENT_RULES.md
2. Read /SKILLS.md
3. Compare with working commit: git diff 9dc71f6
```

## For GitHub Copilot Users

Add to workspace settings (`.vscode/settings.json`):
```json
{
  "github.copilot.chat.codeGeneration.instructions": [
    {
      "text": "Before making Railway deployment changes, read FLORA_DEVELOPMENT_RULES.md and SKILLS.md, then compare with working commit 9dc71f6"
    }
  ]
}
```

## For Windsurf Users

Add to `.windsurfrules`:
```
Railway Deployment Protocol:
1. Read FLORA_DEVELOPMENT_RULES.md first
2. Read SKILLS.md second
3. Compare changes with commit 9dc71f6
4. Follow mandatory verification steps
```

---

## Violation Consequences

If you (AI assistant) make Railway-related changes without reading these files:
- ⚠️ High risk of breaking working deployment
- ⚠️ Potential healthcheck failures
- ⚠️ User will have to rollback changes
- ⚠️ Wasted time debugging preventable issues

**When in doubt, read the files again. They're short and critical.**

---

**This configuration applies to all AI assistants, in all sessions, forever.**
