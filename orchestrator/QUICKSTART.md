# 🚀 Quick Start Guide

Get your WWebJS Orchestrator up and running in 5 minutes!

## Prerequisites

- ✅ Docker & Docker Compose installed
- ✅ Node.js 18+ (optional, for development)

## One-Line Setup (Linux/Mac)

```bash
cd orchestrator && chmod +x scripts/init.sh && ./scripts/init.sh
```

## One-Line Setup (Windows)

```cmd
cd orchestrator && scripts\init.bat
```

The script will:
1. ✅ Check prerequisites
2. ✅ Build wwebjs-api image
3. ✅ Create Docker network
4. ✅ Setup configuration
5. ✅ Optionally install Portainer
6. ✅ Start the orchestrator

## Manual Setup (3 Steps)

### Step 1: Build wwebjs-api Image

```bash
cd wwebjs-api
docker build -t wwebjs-api:latest .
```

### Step 2: Setup Orchestrator

```bash
cd orchestrator

# Create network
docker network create wwebjs-network

# Create config
cp backend/.env.example backend/.env

# Optional: Install Portainer
npm run docker:portainer
```

### Step 3: Start

```bash
docker-compose up -d
```

## Access Your Orchestrator

🌐 **Dashboard**: http://localhost:3001  
🔌 **API**: http://localhost:5000  
🐳 **Portainer**: http://localhost:9000

## Create Your First Instance

### Via Dashboard (Recommended)

1. Open http://localhost:3001
2. Click **"Instances"** → **"Create Instance"**
3. Enter:
   - Name: `my-first-instance`
   - Leave other fields default
4. Click **"Create Instance"**
5. Click **"Start"** button
6. Click **"QR"** button
7. Scan QR code with WhatsApp
8. Done! 🎉

### Via API

```bash
# Create instance
curl -X POST http://localhost:5000/api/instances \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-first-instance",
    "config": {
      "API_KEY": "my-secret-key"
    }
  }'

# Start (replace <ID> with returned id)
curl -X POST http://localhost:5000/api/instances/<ID>/start

# Get QR code
curl http://localhost:5000/api/instances/<ID>/qr
```

## Common Commands

```bash
# View logs
docker-compose logs -f

# Stop orchestrator
docker-compose down

# Restart
docker-compose restart

# Check status
docker-compose ps
```

## What's Next?

📚 **[Full Documentation](README.md)** - Detailed features and API  
🛠️ **[Setup Guide](SETUP.md)** - In-depth configuration  
🎯 **Templates** - Create reusable configs  
📊 **Monitoring** - View metrics and logs  
🔗 **Integration** - Connect to your apps

## Troubleshooting

### Can't connect to Docker?

```bash
# Add user to docker group
sudo usermod -aG docker $USER
# Log out and back in
```

### Port already in use?

```bash
# Find what's using the port
lsof -i :5000

# Or change port in docker-compose.yml
```

### Need help?

- Check [SETUP.md](SETUP.md) for detailed troubleshooting
- Review logs: `docker-compose logs -f`
- Verify setup: `docker images | grep wwebjs-api`

---

**Happy automating! 🚀**

