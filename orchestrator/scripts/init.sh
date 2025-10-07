#!/bin/bash

# WWebJS Orchestrator - Initialization Script
# This script sets up everything needed to run the orchestrator

set -e

echo "🚀 WWebJS Orchestrator - Initialization Script"
echo "=============================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if Docker is installed
echo "📦 Checking prerequisites..."
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed. Please install Docker first.${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ Docker Compose is not installed. Please install Docker Compose first.${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Docker is installed${NC}"
echo -e "${GREEN}✅ Docker Compose is installed${NC}"
echo ""

# Check if wwebjs-api image exists
echo "🔍 Checking for wwebjs-api image..."
if ! docker images | grep -q "wwebjs-api"; then
    echo -e "${YELLOW}⚠️  wwebjs-api image not found${NC}"
    echo "Building wwebjs-api image..."
    
    if [ -d "../wwebjs-api" ]; then
        cd ../wwebjs-api
        docker build -t wwebjs-api:latest .
        cd ../orchestrator
        echo -e "${GREEN}✅ wwebjs-api image built successfully${NC}"
    else
        echo -e "${RED}❌ wwebjs-api directory not found. Please ensure it exists at ../wwebjs-api${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✅ wwebjs-api image found${NC}"
fi
echo ""

# Create Docker network
echo "🌐 Setting up Docker network..."
if ! docker network ls | grep -q "wwebjs-network"; then
    docker network create wwebjs-network
    echo -e "${GREEN}✅ Docker network created${NC}"
else
    echo -e "${GREEN}✅ Docker network already exists${NC}"
fi
echo ""

# Setup environment file
echo "⚙️  Setting up environment configuration..."
if [ ! -f "backend/.env" ]; then
    cp backend/.env.example backend/.env
    echo -e "${GREEN}✅ Environment file created at backend/.env${NC}"
    echo -e "${YELLOW}⚠️  Please edit backend/.env to customize your configuration${NC}"
else
    echo -e "${GREEN}✅ Environment file already exists${NC}"
fi
echo ""

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p backend/data
mkdir -p instances
mkdir -p logs
echo -e "${GREEN}✅ Directories created${NC}"
echo ""

# Ask about Portainer
echo "🎯 Portainer Setup"
read -p "Do you want to install Portainer for Docker management? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Installing Portainer..."
    
    if ! docker ps -a | grep -q "portainer"; then
        docker volume create portainer_data 2>/dev/null || true
        docker run -d \
            -p 9000:9000 \
            -p 8000:8000 \
            --name portainer \
            --restart always \
            -v /var/run/docker.sock:/var/run/docker.sock \
            -v portainer_data:/data \
            portainer/portainer-ce:latest
        
        echo -e "${GREEN}✅ Portainer installed successfully${NC}"
        echo -e "   Access Portainer at: ${GREEN}http://localhost:9000${NC}"
    else
        echo -e "${GREEN}✅ Portainer is already installed${NC}"
    fi
fi
echo ""

# Ask about starting the orchestrator
echo "🚀 Orchestrator Startup"
read -p "Do you want to start the orchestrator now? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Starting orchestrator..."
    docker-compose up -d
    
    echo ""
    echo -e "${GREEN}✅ Orchestrator started successfully!${NC}"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "  📊 ${GREEN}Dashboard:${NC}    http://localhost:3001"
    echo -e "  🔌 ${GREEN}Backend API:${NC}  http://localhost:5000"
    echo -e "  🐳 ${GREEN}Portainer:${NC}    http://localhost:9000"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "📝 Useful commands:"
    echo "  - View logs:        docker-compose logs -f"
    echo "  - Stop orchestrator: docker-compose down"
    echo "  - Restart:          docker-compose restart"
    echo ""
else
    echo ""
    echo -e "${YELLOW}Orchestrator not started.${NC}"
    echo "To start manually, run: ${GREEN}docker-compose up -d${NC}"
    echo ""
fi

echo -e "${GREEN}🎉 Setup complete!${NC}"
echo ""
echo "📚 Next steps:"
echo "  1. Open the dashboard at http://localhost:3001"
echo "  2. Create your first instance"
echo "  3. Start the instance and scan the QR code"
echo "  4. Begin automating WhatsApp!"
echo ""
echo "For detailed documentation, see:"
echo "  - README.md for general usage"
echo "  - SETUP.md for detailed setup guide"
echo ""

