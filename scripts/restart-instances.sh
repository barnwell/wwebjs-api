#!/bin/bash

echo "🔄 Restarting wwebjs instances with updated image..."

# Build new wwebjs-api image
echo "📦 Building new wwebjs-api image..."
cd wwebjs-api
docker build -t wwebjs-api:latest .

if [ $? -ne 0 ]; then
    echo "❌ Failed to build image"
    exit 1
fi

echo "✅ Image built successfully"

# Go back to root
cd ..

# Find and restart all wwebjs containers
echo "🔍 Finding wwebjs containers..."
CONTAINERS=$(docker ps -a --filter "name=wwebjs-" --format "{{.Names}}")

if [ -z "$CONTAINERS" ]; then
    echo "⚠️  No wwebjs containers found"
    exit 0
fi

echo "📋 Found containers:"
echo "$CONTAINERS"

# Stop and remove containers, then let orchestrator recreate them
for container in $CONTAINERS; do
    echo "🛑 Stopping $container..."
    docker stop "$container"
    
    echo "🗑️  Removing $container..."
    docker rm "$container"
done

echo "✅ All containers stopped and removed"
echo "🎉 Done! Start your instances through the orchestrator dashboard to use the new image."