#!/bin/bash

# WhatsApp Instance Backup Restoration Script
# Usage: ./restore-backup.sh <instance-name> <backup-file.zip>

if [ $# -ne 2 ]; then
    echo "Usage: $0 <instance-name> <backup-file.zip>"
    echo "Example: $0 my-instance sessions-backup-2025-10-21.zip"
    exit 1
fi

INSTANCE_NAME=$1
BACKUP_FILE=$2
CONTAINER_NAME="wwebjs-${INSTANCE_NAME}"

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo "Error: Backup file '$BACKUP_FILE' not found"
    exit 1
fi

# Check if container exists
if ! docker ps -a --format "table {{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
    echo "Error: Container '$CONTAINER_NAME' not found"
    exit 1
fi

echo "Restoring backup for instance: $INSTANCE_NAME"
echo "Backup file: $BACKUP_FILE"

# Stop the container if running
echo "Stopping container..."
docker stop "$CONTAINER_NAME" 2>/dev/null || true

# Create temporary directory for extraction
TEMP_DIR=$(mktemp -d)
echo "Extracting backup to temporary directory: $TEMP_DIR"

# Extract backup
unzip -q "$BACKUP_FILE" -d "$TEMP_DIR"

# Clear existing sessions directory in container
echo "Clearing existing sessions..."
docker run --rm -v "${CONTAINER_NAME}_sessions:/sessions" alpine:latest sh -c "rm -rf /sessions/*"

# Copy extracted files to container
echo "Copying restored sessions to container..."
docker cp "$TEMP_DIR/." "$CONTAINER_NAME:/app/sessions/"

# Fix permissions
echo "Setting proper permissions..."
docker exec "$CONTAINER_NAME" chown -R node:node /app/sessions/

# Clean up temporary directory
rm -rf "$TEMP_DIR"

echo "Backup restoration completed!"
echo "You can now start the instance from the orchestrator dashboard."
echo ""
echo "To start the container manually:"
echo "docker start $CONTAINER_NAME"