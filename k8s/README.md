# Kubernetes Migration for WWebJS Orchestrator

This directory contains the Kubernetes manifests and Helm charts for migrating the WWebJS Orchestrator from Docker Compose to Kubernetes.

## Architecture Changes

### Current (Docker Compose)
- Single-node deployment
- Direct Docker API access
- Manual scaling
- Basic networking

### New (Kubernetes)
- Multi-node cluster support
- Kubernetes API for container management
- Horizontal Pod Autoscaling
- Service mesh ready
- GitOps deployment
- CI/CD pipeline integration

## Components

1. **Namespace**: `wwebjs-orchestrator`
2. **PostgreSQL**: StatefulSet with persistent storage
3. **Backend**: Deployment with HPA
4. **Frontend**: Deployment with HPA  
5. **wwebjs-api**: Dynamic Pod creation via Jobs/Deployments
6. **Ingress**: NGINX ingress controller
7. **Monitoring**: Prometheus + Grafana
8. **CI/CD**: GitHub Actions + ArgoCD

## Deployment

```bash
# Apply namespace and base resources
kubectl apply -f namespace.yaml
kubectl apply -f configmaps/
kubectl apply -f secrets/
kubectl apply -f storage/

# Deploy PostgreSQL
kubectl apply -f postgresql/

# Deploy backend and frontend
kubectl apply -f backend/
kubectl apply -f frontend/

# Setup ingress
kubectl apply -f ingress/

# Install monitoring (optional)
kubectl apply -f monitoring/
```

## Key Differences from Docker Compose

1. **Container Management**: Uses Kubernetes API instead of Docker API
2. **Networking**: Kubernetes Services instead of Docker networks
3. **Storage**: PersistentVolumes instead of Docker volumes
4. **Scaling**: HPA instead of manual scaling
5. **Service Discovery**: Kubernetes DNS instead of container names
6. **Load Balancing**: Kubernetes Services + Ingress
7. **Health Checks**: Kubernetes probes instead of Docker healthchecks