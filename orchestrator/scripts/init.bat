@echo off
REM WWebJS Orchestrator - Initialization Script for Windows
REM This script sets up everything needed to run the orchestrator

echo ========================================
echo WWebJS Orchestrator - Initialization
echo ========================================
echo.

REM Check if Docker is installed
echo Checking prerequisites...
docker --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker is not installed. Please install Docker Desktop first.
    exit /b 1
)

docker-compose --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker Compose is not installed. Please install Docker Compose first.
    exit /b 1
)

echo [OK] Docker is installed
echo [OK] Docker Compose is installed
echo.

REM Check if wwebjs-api image exists
echo Checking for wwebjs-api image...
docker images | findstr "wwebjs-api" >nul 2>&1
if errorlevel 1 (
    echo [WARNING] wwebjs-api image not found
    echo Building wwebjs-api image...
    
    if exist "..\wwebjs-api" (
        cd ..\wwebjs-api
        docker build -t wwebjs-api:latest .
        cd ..\orchestrator
        echo [OK] wwebjs-api image built successfully
    ) else (
        echo [ERROR] wwebjs-api directory not found
        exit /b 1
    )
) else (
    echo [OK] wwebjs-api image found
)
echo.

REM Create Docker network
echo Setting up Docker network...
docker network ls | findstr "wwebjs-network" >nul 2>&1
if errorlevel 1 (
    docker network create wwebjs-network
    echo [OK] Docker network created
) else (
    echo [OK] Docker network already exists
)
echo.

REM Setup environment file
echo Setting up environment configuration...
if not exist "backend\.env" (
    copy backend\.env.example backend\.env
    echo [OK] Environment file created at backend\.env
    echo [WARNING] Please edit backend\.env to customize your configuration
) else (
    echo [OK] Environment file already exists
)
echo.

REM Create necessary directories
echo Creating directories...
if not exist "backend\data" mkdir backend\data
if not exist "instances" mkdir instances
if not exist "logs" mkdir logs
echo [OK] Directories created
echo.

REM Ask about Portainer
echo Portainer Setup
set /p portainer="Do you want to install Portainer? (y/n): "
if /i "%portainer%"=="y" (
    echo Installing Portainer...
    docker ps -a | findstr "portainer" >nul 2>&1
    if errorlevel 1 (
        docker volume create portainer_data
        docker run -d -p 9000:9000 -p 8000:8000 --name portainer --restart always -v /var/run/docker.sock:/var/run/docker.sock -v portainer_data:/data portainer/portainer-ce:latest
        echo [OK] Portainer installed successfully
        echo     Access Portainer at: http://localhost:9000
    ) else (
        echo [OK] Portainer is already installed
    )
)
echo.

REM Ask about starting orchestrator
echo Orchestrator Startup
set /p start="Do you want to start the orchestrator now? (y/n): "
if /i "%start%"=="y" (
    echo Starting orchestrator...
    docker-compose up -d
    
    echo.
    echo [OK] Orchestrator started successfully!
    echo.
    echo ============================================
    echo   Dashboard:    http://localhost:3001
    echo   Backend API:  http://localhost:5000
    echo   Portainer:    http://localhost:9000
    echo ============================================
    echo.
    echo Useful commands:
    echo   - View logs:         docker-compose logs -f
    echo   - Stop orchestrator: docker-compose down
    echo   - Restart:           docker-compose restart
    echo.
) else (
    echo.
    echo Orchestrator not started.
    echo To start manually, run: docker-compose up -d
    echo.
)

echo Setup complete!
echo.
echo Next steps:
echo   1. Open the dashboard at http://localhost:3001
echo   2. Create your first instance
echo   3. Start the instance and scan the QR code
echo   4. Begin automating WhatsApp!
echo.
echo For detailed documentation, see:
echo   - README.md for general usage
echo   - SETUP.md for detailed setup guide
echo.

pause

