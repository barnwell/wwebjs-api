#!/bin/bash

# WhatsApp Instance Backup Restoration Script
# Usage: ./restore-backup.sh <instance-name> <backup-file.tar.gz>

if [ $# -ne 2 ]; then
    echo "Usage: $0 <instance-name> <backup-file.tar.gz>"
    echo "Example: $0 my-instance my-instance_sessions_2025-10-21_14-30-15.tar.gz"
    exit 1
fi

INSTANCE_NAME=$1
BACKUP_FILE=$2
CONTAINER_NAME="wwebjs-${INSTANCE_NAME}"
INSTANCES_DIR="${WWEBJS_SESSIONS_PATH:-./instances}"
HOST_SESSIONS_PATH="${INSTANCES_DIR}/${INSTANCE_NAME}"

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo "Error: Backup file '$BACKUP_FILE' not found"
    exit 1
fi

echo "Restoring backup for instance: $INSTANCE_NAME"
echo "Backup file: $BACKUP_FILE"
echo "Target directory: $HOST_SESSIONS_PATH"

# Stop the container if running
if docker ps --format "table {{.Names}}" | grep -q "^${CONTAINER_NAME}$"; then
    echo "Stopping container..."
    docker stop "$CONTAINER_NAME" 2>/dev/null || true
    sleep 2
fi

# Create host sessions directory if it doesn't exist
mkdir -p "$HOST_SESSIONS_PATH"

# Clear existing sessions
echo "Clearing existing sessions..."
rm -rf "${HOST_SESSIONS_PATH:?}"/*

# Extract backup directly to host directory
echo "Extracting backup to host directory..."
if tar -xzf "$BACKUP_FILE" -C "$HOST_SESSIONS_PATH"; then
    echo "✓ Backup extracted successfully"
    
    # Show what was restored
    local file_count=$(find "$HOST_SESSIONS_PATH" -type f | wc -l)
    local dir_size=$(du -sh "$HOST_SESSIONS_PATH" | cut -f1)
    echo "  Restored: $file_count files ($dir_size)"
    
    # Set proper permissions (if running as root)
    if [ "$(id -u)" -eq 0 ]; then
        echo "Setting proper permissions..."
        chown -R 1000:1000 "$HOST_SESSIONS_PATH" 2>/dev/null || true
    fi
    
    echo ""
    echo "✓ Backup restoration completed!"
    echo ""
    echo "Next steps:"
    echo "1. Start the instance from the orchestrator dashboard"
    echo "2. Or start manually: docker start $CONTAINER_NAME"
    echo "3. Check the sessions are working in the orchestrator"
    
else
    echo "✗ Failed to extract backup file"
    exit 1
fi