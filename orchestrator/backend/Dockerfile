# Multi-stage build for optimized production image
FROM node:18-alpine AS builder

WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./
RUN npm install --only=production && npm cache clean --force

# Production stage
FROM node:18-alpine AS production

# Build arguments for labels
ARG BUILD_DATE
ARG VERSION=1.0.0
ARG VCS_REF

# Add build labels
LABEL org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.title="wwebjs-orchestrator-backend" \
      org.opencontainers.image.description="Backend API for WWebJS Orchestrator with Kubernetes support" \
      version="${VERSION}" \
      git.commit="${VCS_REF}" \
      build.date="${BUILD_DATE}"

# Create app directory and user
WORKDIR /usr/src/app
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

# Copy dependencies from builder stage
COPY --from=builder --chown=nodejs:nodejs /usr/src/app/node_modules ./node_modules

# Copy application code
COPY --chown=nodejs:nodejs . .

# Create directories for data
RUN mkdir -p instances data && chown -R nodejs:nodejs instances data

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

EXPOSE 5000

USER nodejs

CMD ["node", "src/server.js"]

