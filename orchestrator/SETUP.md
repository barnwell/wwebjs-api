# WWebJS Orchestrator - Setup Guide

This guide will walk you through setting up the WWebJS Orchestrator from scratch.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Step 1: Build wwebjs-api Image](#step-1-build-wwebjs-api-image)
3. [Step 2: Setup Portainer (Optional)](#step-2-setup-portainer-optional)
4. [Step 3: Configure Orchestrator](#step-3-configure-orchestrator)
5. [Step 4: Start Orchestrator](#step-4-start-orchestrator)
6. [Step 5: Create Your First Instance](#step-5-create-your-first-instance)
7. [Troubleshooting](#troubleshooting)

## Prerequisites

Before you begin, ensure you have:

- ✅ Docker and Docker Compose installed
- ✅ Node.js 18+ (for local development)
- ✅ At least 2GB of free RAM
- ✅ Ports 5000, 3001, and 9000 available (or configure different ports)

### Check Docker Installation

```bash
docker --version
docker-compose --version
```

## Step 1: Build wwebjs-api Image

The orchestrator needs a wwebjs-api Docker image to create instances.

### From the project root:

```bash
cd wwebjs-api
docker build -t wwebjs-api:latest .
```

### Verify the image was built:

```bash
docker images | grep wwebjs-api
```

You should see:
```
wwebjs-api    latest    <image-id>    <time>    <size>
```

## Step 2: Setup Portainer (Optional)

Portainer provides a web UI for Docker management. While optional, it's highly recommended.

### Install Portainer:

```bash
cd orchestrator
npm run docker:portainer
```

Or manually:

```bash
docker volume create portainer_data

docker run -d \
  -p 9000:9000 \
  -p 8000:8000 \
  --name portainer \
  --restart always \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce:latest
```

### Access Portainer:

1. Open http://localhost:9000
2. Create admin account (username: admin, password: your-secure-password)
3. Select "Local" Docker environment
4. Click "Connect"

## Step 3: Configure Orchestrator

### Create Docker Network:

```bash
docker network create wwebjs-network
```

### Configure Backend:

```bash
cd orchestrator
cp backend/.env.example backend/.env
```

Edit `backend/.env`:

```env
# Server Configuration
PORT=5000
NODE_ENV=production

# Database
DATABASE_PATH=./data/orchestrator.db

# Docker Configuration
DOCKER_SOCKET=/var/run/docker.sock
PORTAINER_URL=http://localhost:9000

# wwebjs-api Configuration
WWEBJS_IMAGE=wwebjs-api:latest
WWEBJS_PORT_RANGE_START=3000
WWEBJS_PORT_RANGE_END=3100

# Network
DOCKER_NETWORK=wwebjs-network
```

### Important Configuration Notes:

- `WWEBJS_IMAGE`: Must match the image you built in Step 1
- `WWEBJS_PORT_RANGE_*`: Range of ports for instances (100 ports = max 100 instances)
- `DOCKER_NETWORK`: Network for instance communication

## Step 4: Start Orchestrator

You have two options:

### Option A: Production (Docker Compose)

```bash
cd orchestrator
docker-compose up -d
```

Check status:
```bash
docker-compose ps
```

View logs:
```bash
docker-compose logs -f
```

### Option B: Development (Local)

```bash
cd orchestrator

# Install dependencies
npm run setup

# Start backend and frontend
npm run dev
```

The orchestrator will start:
- **Backend API**: http://localhost:5000
- **Frontend Dashboard**: http://localhost:3001
- **WebSocket**: ws://localhost:5000/ws

## Step 5: Create Your First Instance

### Via Web Dashboard:

1. **Open Dashboard**: Navigate to http://localhost:3001

2. **Create Instance**:
   - Click "Instances" in the sidebar
   - Click "Create Instance" button
   - Fill in the form:
     ```
     Name: my-first-instance
     Description: My first WhatsApp instance
     API Key: (leave empty to auto-generate)
     Webhook URL: (optional)
     ```
   - Click "Create Instance"

3. **Start Instance**:
   - Click the "Start" button on your instance card
   - Wait for status to change to "running" (green)

4. **Scan QR Code**:
   - Click "QR" button
   - Scan the QR code with WhatsApp on your phone:
     - Open WhatsApp → Settings → Linked Devices
     - Tap "Link a Device"
     - Scan the QR code

5. **Verify Connection**:
   - Wait for session status to change to "connected" (blue)
   - Your instance is now ready to use!

### Via API:

```bash
# Create instance
curl -X POST http://localhost:5000/api/instances \
  -H "Content-Type: application/json" \
  -d '{
    "name": "api-instance",
    "description": "Created via API",
    "config": {
      "API_KEY": "my-secret-key",
      "BASE_WEBHOOK_URL": "https://my-webhook.com/webhook"
    }
  }'

# Start instance (use returned ID)
curl -X POST http://localhost:5000/api/instances/<instance-id>/start

# Get QR code
curl http://localhost:5000/api/instances/<instance-id>/qr
```

## Common Use Cases

### Use Case 1: Multiple Customer Support Lines

```bash
# Create template for customer support
curl -X POST http://localhost:5000/api/templates \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Customer Support",
    "config": {
      "BASE_WEBHOOK_URL": "https://crm.company.com/webhook",
      "ENABLE_WEBHOOK": "true",
      "LOG_LEVEL": "info"
    }
  }'

# Create instances from template
for i in {1..5}; do
  curl -X POST http://localhost:5000/api/instances \
    -H "Content-Type: application/json" \
    -d "{
      \"name\": \"support-line-$i\",
      \"templateId\": \"<template-id>\"
    }"
done
```

### Use Case 2: Testing Environment

Create instances with different configurations for testing:

```javascript
// Development instance
{
  "name": "dev-testing",
  "config": {
    "LOG_LEVEL": "debug",
    "HEADLESS": "false"  // See browser for debugging
  }
}

// Staging instance
{
  "name": "staging",
  "config": {
    "LOG_LEVEL": "info",
    "BASE_WEBHOOK_URL": "https://staging-api.com/webhook"
  }
}
```

## Monitoring Your Instances

### Dashboard Overview:

- **Total Instances**: Count of all created instances
- **Running**: Currently active instances
- **Connected**: Instances connected to WhatsApp
- **Resource Usage**: CPU, memory, network stats

### Instance Details:

Click on any instance to view:
- **Metrics Tab**: CPU and memory usage charts
- **Logs Tab**: Real-time container logs
- **Config Tab**: Current configuration

### WebSocket Events:

The dashboard receives real-time updates via WebSocket:
- Instance started/stopped
- Configuration changes
- Metrics updates
- Session status changes

## Troubleshooting

### Issue: "Docker connection failed"

**Solution:**
```bash
# Check Docker is running
docker ps

# Check Docker socket permissions
ls -la /var/run/docker.sock

# If permission denied, add user to docker group
sudo usermod -aG docker $USER
# Log out and back in
```

### Issue: "Port already in use"

**Solution:**
```bash
# Find process using port
lsof -i :5000  # or :3001

# Kill process or change port in config
# Edit docker-compose.yml or .env
```

### Issue: "wwebjs-api image not found"

**Solution:**
```bash
# Verify image exists
docker images | grep wwebjs-api

# If not found, rebuild
cd wwebjs-api
docker build -t wwebjs-api:latest .
```

### Issue: "Network wwebjs-network not found"

**Solution:**
```bash
# Create network
docker network create wwebjs-network

# Verify
docker network ls | grep wwebjs-network
```

### Issue: "Instance won't start"

**Solutions:**
1. Check logs:
   ```bash
   docker-compose logs orchestrator-backend
   ```

2. Verify image and network:
   ```bash
   docker images | grep wwebjs-api
   docker network ls | grep wwebjs-network
   ```

3. Check port availability:
   ```bash
   # Port should be free
   lsof -i :<port-number>
   ```

4. Manually inspect container (if exists):
   ```bash
   docker logs <container-id>
   docker inspect <container-id>
   ```

### Issue: "QR code not loading"

**Solutions:**
1. Ensure instance is running (green status)
2. Wait 5-10 seconds after starting
3. Click refresh button in QR modal
4. Check instance logs for errors

### Issue: "Database locked"

**Solution:**
```bash
# Stop orchestrator
docker-compose down

# Remove lock files
rm backend/data/orchestrator.db-wal
rm backend/data/orchestrator.db-shm

# Restart
docker-compose up -d
```

## Uninstall

To completely remove the orchestrator:

```bash
# Stop and remove containers
cd orchestrator
docker-compose down -v

# Remove Docker network
docker network rm wwebjs-network

# Remove Portainer (if installed)
docker stop portainer
docker rm portainer
docker volume rm portainer_data

# Remove data (optional)
rm -rf backend/data
rm -rf instances
```

## Next Steps

Now that your orchestrator is running:

1. ✅ Create templates for common configurations
2. ✅ Set up webhooks for event handling
3. ✅ Configure monitoring and alerts
4. ✅ Scale by creating multiple instances
5. ✅ Integrate with your applications via API

## Support

Need help?
- 📚 Check the [README.md](README.md) for detailed documentation
- 🐛 Report issues on GitHub
- 💬 Join the community discussions

Happy orchestrating! 🚀

