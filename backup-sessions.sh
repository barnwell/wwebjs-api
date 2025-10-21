#!/bin/bash

# WhatsApp Instance Sessions Backup Script
# Usage: ./backup-sessions.sh [instance-name] [backup-directory]
# If no instance name provided, backs up all instances

BACKUP_DIR="${2:-./backups}"
DATE=$(date +%Y-%m-%d_%H-%M-%S)

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Function to backup a single instance
backup_instance() {
    local instance_name="$1"
    local container_name="wwebjs-${instance_name}"
    
    echo "Backing up instance: $instance_name"
    
    # Check if container exists
    if ! docker ps -a --format "table {{.Names}}" | grep -q "^${container_name}$"; then
        echo "Warning: Container '$container_name' not found, skipping..."
        return 1
    fi
    
    # Create instance-specific backup directory
    local instance_backup_dir="${BACKUP_DIR}/${instance_name}_${DATE}"
    mkdir -p "$instance_backup_dir"
    
    # Copy sessions directory from container
    if docker cp "${container_name}:/app/sessions/." "$instance_backup_dir/" 2>/dev/null; then
        # Create a compressed archive
        local archive_name="${BACKUP_DIR}/${instance_name}_sessions_${DATE}.tar.gz"
        tar -czf "$archive_name" -C "$instance_backup_dir" .
        
        # Remove temporary directory
        rm -rf "$instance_backup_dir"
        
        echo "✓ Backup created: $archive_name"
        
        # Show backup size
        local size=$(du -h "$archive_name" | cut -f1)
        echo "  Size: $size"
        
        return 0
    else
        echo "✗ Failed to backup $instance_name (container may not be running or sessions directory empty)"
        rm -rf "$instance_backup_dir"
        return 1
    fi
}

# Function to get all wwebjs container names
get_all_instances() {
    docker ps -a --format "table {{.Names}}" | grep "^wwebjs-" | sed 's/^wwebjs-//'
}

# Main execution
if [ -n "$1" ]; then
    # Backup specific instance
    backup_instance "$1"
else
    # Backup all instances
    echo "Backing up all WhatsApp instances..."
    echo "Backup directory: $BACKUP_DIR"
    echo "Timestamp: $DATE"
    echo ""
    
    instances=$(get_all_instances)
    
    if [ -z "$instances" ]; then
        echo "No WhatsApp instances found."
        exit 1
    fi
    
    success_count=0
    total_count=0
    
    while IFS= read -r instance; do
        if [ -n "$instance" ]; then
            total_count=$((total_count + 1))
            if backup_instance "$instance"; then
                success_count=$((success_count + 1))
            fi
            echo ""
        fi
    done <<< "$instances"
    
    echo "Backup Summary:"
    echo "  Total instances: $total_count"
    echo "  Successful backups: $success_count"
    echo "  Failed backups: $((total_count - success_count))"
    echo ""
    echo "Backups stored in: $BACKUP_DIR"
fi

# List all backups
echo "Available backups:"
ls -lh "$BACKUP_DIR"/*.tar.gz 2>/dev/null | awk '{print "  " $9 " (" $5 ")"}'