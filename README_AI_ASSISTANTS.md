# 🤖 AI Assistant Quick Start Guide

## ⚠️ READ THIS FIRST - EVERY SESSION

If you're an AI coding assistant (Claude Code, Cursor, GitHub Copilot, Windsurf, etc.) working on this repository:

### 🚨 MANDATORY FIRST ACTION

**Before doing ANYTHING in this repository, read these two files:**

1. **[FLORA_DEVELOPMENT_RULES.md](./FLORA_DEVELOPMENT_RULES.md)** - Railway deployment protocol
2. **[SKILLS.md](./SKILLS.md)** - Development workflows and debugging

**This applies:**
- ✅ First time in this repository
- ✅ After chat/context compaction
- ✅ After session restart
- ✅ When context usage exceeds 50%
- ✅ EVERY time you're unsure about deployment protocols

### Why This Exists

Past Railway deployment failures were caused by AI assistants:
- ❌ Making changes without understanding Railway requirements
- ❌ Skipping the "compare with working config" protocol
- ❌ Breaking working deployments with "helpful" refactoring
- ❌ Not reading updated protocols after context compaction

**Reading these files prevents repeating these mistakes.**

### Your Session Initialization Checklist

```
□ Read /FLORA_DEVELOPMENT_RULES.md
□ Read /SKILLS.md
□ Check last working commit: git log --oneline -5
□ Understand current baseline: 9dc71f6 (verify this is still current)
□ Ready to work safely
```

### Quick Reference: Before Railway Changes

1. **Compare with working config:**
   ```bash
   git diff 9dc71f6 Dockerfile
   git diff 9dc71f6 src/config/index.js
   git diff 9dc71f6 server.js
   git diff 9dc71f6 src/index.js
   ```

2. **Verify requirements:**
   - No EXPOSE or HEALTHCHECK in Dockerfile
   - PORT fails fast in production (src/config/index.js)
   - Error handlers after microservice.initialize() (server.js)
   - All route handlers have `next` parameter (src/index.js)

3. **Test before deploy:**
   ```bash
   node --check server.js
   grep -c "async (req, res, next)" src/index.js
   ```

### Configuration Files Created for You

This repository includes AI assistant configurations:

- **CLAUDE.md** - Claude Code session initialization
- **AGENTS.md** - Cross-platform AI assistant rules
- **.cursorrules** - Cursor AI specific rules
- **.windsurfrules** - Windsurf AI specific rules
- **.vscode/settings.json** - GitHub Copilot instructions

**All files say the same thing: Read the docs first, compare with working config, then proceed.**

### Last Known Working Configuration

- **Commit**: `9dc71f6`
- **Date**: Thu Jul 16 16:01:57 2026
- **Message**: "fix(mcp-server): resolve Railway PORT injection with comprehensive validation"

Always compare your changes against this baseline.

### What If I Skip Reading?

You'll likely:
- ⚠️ Break the working deployment
- ⚠️ Cause healthcheck failures
- ⚠️ Create bugs that take hours to debug
- ⚠️ Force the team to rollback your changes

**Just read the two files. They're short. They're critical.**

---

## Human Developers

If you're a human developer (not an AI):

1. **Review** the AI assistant configuration files
2. **Update** AGENTS.md when deployment patterns change
3. **Document** new working baselines after successful deployments
4. **Verify** AI assistants are following the protocols

---

**TL;DR for AI Assistants:**
1. Read [FLORA_DEVELOPMENT_RULES.md](./FLORA_DEVELOPMENT_RULES.md)
2. Read [SKILLS.md](./SKILLS.md)
3. Compare changes with `git diff 9dc71f6`
4. Follow the protocols
5. Deploy safely

**No shortcuts. No exceptions.**
