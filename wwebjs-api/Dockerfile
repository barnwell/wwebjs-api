# Use the official Node.js Debian image as the base image
FROM node:22-bookworm-slim AS base

ENV CHROME_BIN="/usr/bin/chromium" \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD="true" \
    NODE_ENV="production"

WORKDIR /usr/src/app

FROM base AS deps

COPY package*.json ./

RUN npm ci --only=production --ignore-scripts

# Create the final stage
FROM base

# Build arguments for labels
ARG BUILD_DATE
ARG VERSION=1.1.0
ARG VCS_REF

# Add build labels
LABEL org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.title="wwebjs-api" \
      org.opencontainers.image.description="REST API wrapper for whatsapp-web.js with message_status callback support" \
      org.opencontainers.image.source="https://github.com/your-org/wwebjs-api" \
      version="${VERSION}" \
      git.commit="${VCS_REF}" \
      build.date="${BUILD_DATE}"

# Install system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    fonts-freefont-ttf \
    chromium \
    ffmpeg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copy only production dependencies from deps stage
COPY --from=deps /usr/src/app/node_modules ./node_modules

# Copy application code
COPY .. .

EXPOSE 3000

CMD ["npm", "start"]
