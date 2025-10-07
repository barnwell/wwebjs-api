#!/bin/bash

# PostgreSQL Migration Setup Script
# This script helps set up the PostgreSQL database for the orchestrator

echo "🚀 Setting up PostgreSQL for wwebjs-orchestrator..."

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose not found. Please install docker-compose first."
    exit 1
fi

# Create .env file if it doesn't exist
if [ ! -f "backend/.env" ]; then
    echo "📝 Creating .env file from template..."
    cp backend/env.example backend/.env
    echo "✅ Created backend/.env file"
    echo "⚠️  Please review and update the database credentials in backend/.env"
else
    echo "✅ .env file already exists"
fi

# Set default PostgreSQL password if not set
if ! grep -q "POSTGRES_PASSWORD" backend/.env; then
    echo "POSTGRES_PASSWORD=orchestrator123" >> backend/.env
    echo "✅ Added default PostgreSQL password to .env"
fi

echo ""
echo "🔧 Next steps:"
echo "1. Review backend/.env and update POSTGRES_PASSWORD if needed"
echo "2. Run: docker-compose down (to stop existing containers)"
echo "3. Run: docker-compose up --build (to start with PostgreSQL)"
echo ""
echo "📊 PostgreSQL will be available at:"
echo "   - Host: localhost"
echo "   - Port: 15432 (changed from 5432 to avoid conflicts)"
echo "   - Database: orchestrator"
echo "   - Username: orchestrator"
echo "   - Password: (check your .env file)"
echo ""
echo "🌐 Service URLs:"
echo "   - Frontend: http://localhost:13001"
echo "   - Backend API: http://localhost:15000"
echo "   - PostgreSQL: localhost:15432"
echo ""
echo "🎉 Setup complete! Your orchestrator will now use PostgreSQL instead of SQLite."
