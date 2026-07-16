# Multi-stage build for Flora MCP Server
FROM node:20-alpine AS base

WORKDIR /app

# Install security updates and essential runtime dependencies
RUN apk update && apk upgrade && \
    apk add --no-cache \
    dumb-init \
    curl \
    tzdata \
    ca-certificates \
    && rm -rf /var/cache/apk/* \
    && update-ca-certificates

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S flora-mcp -u 1001 -G nodejs

# Create app directory with proper permissions
RUN mkdir -p /app && chown -R flora-mcp:nodejs /app

# Switch to non-root user for dependency installation
USER flora-mcp

# Copy package files with correct ownership
COPY --chown=flora-mcp:nodejs package*.json ./

# Install dependencies with optimizations
RUN npm ci --only=production --no-audit --no-fund && \
    npm cache clean --force

# =============================================================================
# PRODUCTION BUILD STAGE
# =============================================================================
FROM node:20-alpine AS production-build

WORKDIR /app

# Install build dependencies as root
RUN apk update && apk upgrade && \
    apk add --no-cache \
    dumb-init \
    curl \
    tzdata \
    ca-certificates \
    && rm -rf /var/cache/apk/* \
    && update-ca-certificates

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S flora-mcp -u 1001 -G nodejs

# Copy package files and install dependencies
COPY --chown=flora-mcp:nodejs package*.json ./
RUN npm ci --only=production --no-audit --no-fund && \
    npm cache clean --force

# Copy source code with proper ownership
COPY --chown=flora-mcp:nodejs . .

# Switch to flora-mcp user for build operations
USER flora-mcp

# Switch back to root for cleanup operations
USER root

# Remove development dependencies and unnecessary files
RUN npm prune --production && \
    rm -rf \
    .git \
    .github \
    tests \
    docs \
    .env.example \
    .env.*.example \
    .eslintrc* \
    .prettierrc \
    jest.config.js \
    nodemon.json \
    *.test.js \
    *.spec.js \
    __tests__ \
    coverage \
    node_modules/.cache \
    /tmp/* \
    /root/.npm

# =============================================================================
# PRODUCTION STAGE
# =============================================================================
FROM node:20-alpine AS production

# Install only essential runtime dependencies
RUN apk update && apk upgrade && \
    apk add --no-cache \
    dumb-init \
    curl \
    tzdata \
    ca-certificates \
    && rm -rf /var/cache/apk/* \
    && update-ca-certificates

# Create non-root user with specific UID/GID for consistency
RUN addgroup -g 1001 -S nodejs && \
    adduser -S flora-mcp -u 1001 -G nodejs

# Set working directory
WORKDIR /app

# Copy production build from previous stage with minimal surface area
COPY --from=production-build --chown=flora-mcp:nodejs /app/package*.json ./
COPY --from=production-build --chown=flora-mcp:nodejs /app/node_modules ./node_modules
COPY --from=production-build --chown=flora-mcp:nodejs /app/server.js ./server.js
COPY --from=production-build --chown=flora-mcp:nodejs /app/src ./src
COPY --from=production-build --chown=flora-mcp:nodejs /app/tools ./tools
COPY --from=production-build --chown=flora-mcp:nodejs /app/auth ./auth

# Create necessary directories with proper permissions
RUN mkdir -p /app/logs && \
    chown -R flora-mcp:nodejs /app/logs && \
    chmod 750 /app/logs && \
    # Remove any potential security risks
    find /app -name "*.sh" -type f -delete 2>/dev/null || true && \
    # Ensure no writable files except in designated directories
    find /app -type f -not -path "/app/logs/*" -exec chmod 644 {} \; && \
    find /app -type d -not -path "/app/logs*" -exec chmod 755 {} \;

# Switch to non-root user
USER flora-mcp

# Expose port (Railway injects PORT dynamically)
EXPOSE 4005

# Enhanced health check (uses Railway's injected PORT)
# NOTE: Uses sh -c to ensure PORT variable expansion works correctly
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD sh -c 'curl -f "http://localhost:${PORT:-4005}/health" || exit 1'

# Labels for container management
LABEL maintainer="Flora Team" \
      version="1.0.0" \
      description="Flora MCP Server — IDE/CLI bridge to Command Center" \
      app.name="flora-mcp-server" \
      app.version="1.0.0" \
      app.component="microservice" \
      app.part-of="flora-platform"

# Production environment variables with secure defaults
# NOTE: PORT is NOT set here to allow Railway's dynamic PORT injection
# The application code defaults to 4005 if PORT is not provided
ENV NODE_ENV=production \
    LOG_LEVEL=info \
    LOG_FORMAT=json \
    NODE_OPTIONS="--max-old-space-size=512 --enable-source-maps" \
    NPM_CONFIG_LOGLEVEL=error

# Start application with proper signal handling
CMD ["dumb-init", "--single-child", "--", "node", "server.js"]
