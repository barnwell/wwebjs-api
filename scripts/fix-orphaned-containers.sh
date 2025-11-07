#!/bin/bash

echo "🔧 Fixing orphaned container references in orchestrator..."

# This DOES NOT delete your instances - it just clears the broken container references
# Your instance configurations, names, ports, etc. are all preserved

echo "🗄️  Clearing orphaned container IDs from database..."
echo "ℹ️   This preserves all your instance data - just fixes the broken container links"

# Using the PostgreSQL connection from your docker-compose
docker exec -it wwebjs-orchestrator-postgres psql -U orchestrator -d orchestrator -c "
UPDATE instances 
SET container_id = NULL, 
    status = 'stopped', 
    updated_at = CURRENT_TIMESTAMP 
WHERE container_id IS NOT NULL;
"

if [ $? -eq 0 ]; then
    echo "✅ Database updated successfully"
    echo "📋 Your instances are preserved with all their configurations"
    echo "🎉 You can now start instances through the orchestrator UI"
    echo "   They will create new containers with the updated wwebjs-api image"
    
    echo ""
    echo "🔍 Verifying instances are still there..."
    docker exec -it wwebjs-orchestrator-postgres psql -U orchestrator -d orchestrator -c "
    SELECT id, name, port, status FROM instances;
    "
else
    echo "❌ Failed to update database"
    echo "💡 Try manually:"
    echo "   1. Connect to PostgreSQL: docker exec -it wwebjs-orchestrator-postgres psql -U orchestrator -d orchestrator"
    echo "   2. Run: UPDATE instances SET container_id = NULL, status = 'stopped' WHERE container_id IS NOT NULL;"
fi