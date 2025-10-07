# WWebJS Orchestrator

A powerful orchestration platform for managing multiple wwebjs-api instances with different configurations. Built with Node.js, React, and Docker.

## Features

- 🚀 **Instance Management**: Create, start, stop, restart, and delete wwebjs-api instances
- 📊 **Real-time Monitoring**: CPU, memory, and network usage metrics
- 🔧 **Configuration Templates**: Reusable configuration templates for quick instance creation
- 📱 **QR Code Scanner**: View and scan WhatsApp QR codes directly from the dashboard
- 📈 **Resource Dashboards**: Beautiful charts and visualizations
- 🔌 **WebSocket Support**: Real-time updates and notifications
- 🐳 **Docker Integration**: Seamless Docker container management
- 🎨 **Modern UI**: Clean, responsive dashboard built with React and Tailwind CSS

## Architecture

```
┌─────────────────────────────────────────┐
│         React Dashboard (Frontend)      │
│  - Instance Management                  │
│  - QR Code Viewer                       │
│  - Metrics & Monitoring                 │
│  - Templates & Settings                 │
└─────────────────────────────────────────┘
                    ▲
                    │ HTTP/WebSocket
                    ▼
┌─────────────────────────────────────────┐
│      Node.js API (Backend)              │
│  - Docker Management                    │
│  - Database (SQLite)                    │
│  - Metrics Collection                   │
│  - WebSocket Server                     │
└─────────────────────────────────────────┘
                    ▲
                    │ Docker API
                    ▼
┌─────────────────────────────────────────┐
│      wwebjs-api Instances (Docker)      │
│   instance-1, instance-2, instance-N    │
└─────────────────────────────────────────┘
```

## Prerequisites

- Docker and Docker Compose installed
- Node.js 18+ (for local development)
- Built wwebjs-api Docker image (see [Building wwebjs-api](#building-wwebjs-api))

## Quick Start

### 1. Build wwebjs-api Docker Image

First, build the wwebjs-api image that will be used by the orchestrator:

```bash
cd ../wwebjs-api
docker build -t wwebjs-api:latest .
```

### 2. Setup Portainer (Optional but Recommended)

```bash
npm run docker:portainer
```

Access Portainer at http://localhost:9000 and create an admin account.

### 3. Create Docker Network

```bash
docker network create wwebjs-network
```

### 4. Configure Environment

Copy the example environment file and customize it:

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` with your settings:

```env
PORT=5000
NODE_ENV=production
DATABASE_PATH=./data/orchestrator.db
DOCKER_SOCKET=/var/run/docker.sock
WWEBJS_IMAGE=wwebjs-api:latest
```

### 5. Start the Orchestrator

**Option A: Using Docker Compose (Production)**

```bash
docker-compose up -d
```

**Option B: Local Development**

```bash
# Install dependencies
npm run setup

# Start both backend and frontend
npm run dev
```

### 6. Access the Dashboard

- **Dashboard**: http://localhost:3001
- **Backend API**: http://localhost:5000
- **Portainer** (if installed): http://localhost:9000

## Usage

### Creating an Instance

1. Navigate to the **Instances** page
2. Click **Create Instance**
3. Fill in the instance details:
   - Name (e.g., "customer-support")
   - Description (optional)
   - Select a template or configure manually
   - Set environment variables (API_KEY, WEBHOOK_URL, etc.)
4. Click **Create**

### Managing Instances

- **Start**: Starts the instance container
- **Stop**: Stops the running container
- **Restart**: Restarts the container
- **Delete**: Removes the instance and its container
- **QR Code**: View WhatsApp QR code for authentication
- **Details**: View metrics, logs, and configuration

### Using Templates

Templates allow you to save common configurations for reuse:

1. Go to **Templates** page
2. Click **Create Template**
3. Define your configuration settings
4. Optionally mark as default
5. Use the template when creating new instances

### Monitoring

The dashboard provides real-time monitoring:

- **Dashboard**: Overview of all instances with key metrics
- **Instance Details**: CPU, memory, network usage charts
- **Logs**: Real-time container logs
- **Session Status**: WhatsApp connection status

## API Endpoints

### Instances

- `GET /api/instances` - List all instances
- `POST /api/instances` - Create new instance
- `GET /api/instances/:id` - Get instance details
- `PATCH /api/instances/:id` - Update instance
- `DELETE /api/instances/:id` - Delete instance
- `POST /api/instances/:id/start` - Start instance
- `POST /api/instances/:id/stop` - Stop instance
- `POST /api/instances/:id/restart` - Restart instance
- `GET /api/instances/:id/stats` - Get resource stats
- `GET /api/instances/:id/logs` - Get container logs
- `GET /api/instances/:id/qr` - Get QR code
- `GET /api/instances/:id/session-status` - Get WhatsApp session status

### Templates

- `GET /api/templates` - List all templates
- `POST /api/templates` - Create template
- `GET /api/templates/:id` - Get template
- `PATCH /api/templates/:id` - Update template
- `DELETE /api/templates/:id` - Delete template

### Metrics

- `GET /api/metrics/instance/:id` - Get instance metrics
- `GET /api/metrics/latest` - Get latest metrics for all instances
- `POST /api/metrics/collect/:id` - Collect metrics for instance

### Settings

- `GET /api/settings` - Get all settings
- `PUT /api/settings/:key` - Update setting

## Configuration

### Backend Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 5000 | Backend server port |
| `NODE_ENV` | development | Environment mode |
| `DATABASE_PATH` | ./data/orchestrator.db | SQLite database path |
| `DOCKER_SOCKET` | /var/run/docker.sock | Docker socket path |
| `WWEBJS_IMAGE` | wwebjs-api:latest | wwebjs-api Docker image |
| `WWEBJS_PORT_RANGE_START` | 3000 | Starting port for instances |
| `WWEBJS_PORT_RANGE_END` | 3100 | Ending port for instances |
| `DOCKER_NETWORK` | wwebjs-network | Docker network name |
| `ENABLE_METRICS` | true | Enable metrics collection |
| `METRICS_INTERVAL` | 5000 | Metrics collection interval (ms) |

### wwebjs-api Instance Configuration

When creating instances, you can configure:

- `API_KEY` - API authentication key
- `BASE_WEBHOOK_URL` - Webhook URL for events
- `ENABLE_WEBHOOK` - Enable/disable webhooks
- `LOG_LEVEL` - Logging level (error, warn, info, debug)
- `HEADLESS` - Run browser in headless mode
- Any other wwebjs-api environment variables

## Development

### Project Structure

```
orchestrator/
├── backend/
│   ├── src/
│   │   ├── db/              # Database setup
│   │   ├── docker/          # Docker management
│   │   ├── routes/          # API routes
│   │   ├── utils/           # Utilities
│   │   ├── websocket/       # WebSocket server
│   │   └── server.js        # Entry point
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── api/             # API client
│   │   ├── components/      # React components
│   │   ├── hooks/           # Custom hooks
│   │   ├── pages/           # Page components
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
└── package.json
```

### Running in Development

```bash
# Install all dependencies
npm run setup

# Start backend (port 5000)
npm run dev:backend

# Start frontend (port 3001)
npm run dev:frontend

# Or run both concurrently
npm run dev
```

### Building for Production

```bash
# Build frontend
npm run build:frontend

# Build Docker images
docker-compose build

# Start production
docker-compose up -d
```

## Troubleshooting

### Docker Socket Permission Denied

If you get permission errors accessing Docker:

```bash
# Add your user to docker group
sudo usermod -aG docker $USER

# Restart your session
```

### Port Already in Use

If ports are already in use, update the ports in:
- `docker-compose.yml` for orchestrator ports
- `backend/.env` for instance port ranges

### Database Locked

If you get database locked errors:
- Stop all orchestrator instances
- Delete `backend/data/orchestrator.db-wal` and `orchestrator.db-shm`
- Restart the orchestrator

### Instances Not Starting

1. Check if wwebjs-api image exists: `docker images | grep wwebjs-api`
2. Check Docker network exists: `docker network ls | grep wwebjs-network`
3. Check logs: `docker logs wwebjs-orchestrator-backend`

## Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
- Create an issue on GitHub
- Check existing documentation
- Review logs in the dashboard

## Roadmap

- [ ] Multi-server support (manage instances across multiple Docker hosts)
- [ ] Backup and restore functionality
- [ ] Auto-scaling based on metrics
- [ ] Advanced monitoring and alerting
- [ ] API rate limiting per instance
- [ ] User authentication and role-based access
- [ ] Integration with cloud providers
- [ ] Kubernetes support

---

Made with ❤️ for the WhatsApp automation community

