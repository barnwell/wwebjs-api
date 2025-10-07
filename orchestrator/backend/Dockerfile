FROM node:18-alpine

WORKDIR /usr/src/app

# Install dependencies
COPY package*.json ./
RUN npm install --only=production

# Copy application files
COPY . .

# Create data directory
RUN mkdir -p data instances

# Expose port
EXPOSE 5000

# Start application
CMD ["node", "src/server.js"]

