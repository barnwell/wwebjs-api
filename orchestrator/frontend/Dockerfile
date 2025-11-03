# Build stage
FROM node:18-alpine AS builder

# Build arguments for labels
ARG BUILD_DATE
ARG VERSION=1.0.0
ARG VCS_REF

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install && npm cache clean --force

# Copy source files
COPY . .

# Build application
RUN npm run build

# Production stage
FROM nginx:alpine AS production

# Add build labels
LABEL org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.title="wwebjs-orchestrator-frontend" \
      org.opencontainers.image.description="Frontend dashboard for WWebJS Orchestrator" \
      version="${VERSION}" \
      git.commit="${VCS_REF}" \
      build.date="${BUILD_DATE}"

# Ensure nginx user exists (it should already exist in nginx:alpine)
RUN id nginx || (addgroup -g 1001 -S nginx && adduser -S nginx -u 1001 -G nginx)

# Copy built files
COPY --from=builder --chown=nginx:nginx /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY --chown=nginx:nginx nginx.conf /etc/nginx/conf.d/default.conf

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

EXPOSE 80

USER nginx

CMD ["nginx", "-g", "daemon off;"]

