# Use Node.js 18 Alpine as base image
FROM node:18-alpine

# Force cache bust — Railway was caching stale Docker layers
ARG CACHE_BUST=1

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy application source
COPY . .

# Create logs directory
RUN mkdir -p logs

# Expose port
EXPOSE 4005

# Set environment variables
ENV NODE_ENV=production
ENV PORT=4005

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4005/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the application
CMD ["node", "src/index.js"]
