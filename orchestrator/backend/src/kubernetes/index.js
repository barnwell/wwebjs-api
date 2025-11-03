const k8s = require('@kubernetes/client-node');
const { logger } = require('../utils/logger');

let k8sApi = null;
let k8sAppsApi = null;
let k8sBatchApi = null;
let k8sMetricsApi = null;

const NAMESPACE = process.env.KUBERNETES_NAMESPACE || 'wwebjs-orchestrator';
const WWEBJS_IMAGE = process.env.WWEBJS_IMAGE || 'wwebjs-api:latest';

function initKubernetes() {
  try {
    const kc = new k8s.KubeConfig();
    
    if (process.env.NODE_ENV === 'production') {
      // Load in-cluster config when running in Kubernetes
      kc.loadFromCluster();
    } else {
      // Load from kubeconfig file for development
      kc.loadFromDefault();
    }

    k8sApi = kc.makeApiClient(k8s.CoreV1Api);
    k8sAppsApi = kc.makeApiClient(k8s.AppsV1Api);
    k8sBatchApi = kc.makeApiClient(k8s.BatchV1Api);
    k8sMetricsApi = kc.makeApiClient(k8s.Metrics);

    logger.info('Kubernetes client initialized successfully');
    return Promise.resolve();
  } catch (error) {
    logger.error('Failed to initialize Kubernetes client:', error);
    throw error;
  }
}

function getKubernetesApi() {
  if (!k8sApi) {
    throw new Error('Kubernetes not initialized. Call initKubernetes() first.');
  }
  return { k8sApi, k8sAppsApi, k8sBatchApi, k8sMetricsApi };
}

async function createWwebjsDeployment(config) {
  try {
    const { k8sAppsApi, k8sApi } = getKubernetesApi();
    
    const deploymentName = `wwebjs-${config.name}`;
    const labels = {
      'app.kubernetes.io/name': 'wwebjs-api',
      'app.kubernetes.io/instance': config.name,
      'app.kubernetes.io/component': 'wwebjs-instance',
      'orchestrator.instance.id': config.instanceId,
      'orchestrator.instance.name': config.name
    };

    // Create ConfigMap for instance configuration
    const configMapManifest = {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: `${deploymentName}-config`,
        namespace: NAMESPACE,
        labels
      },
      data: config.env || {}
    };

    await k8sApi.createNamespacedConfigMap(NAMESPACE, configMapManifest);

    // Create Service for the instance
    const serviceManifest = {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: deploymentName,
        namespace: NAMESPACE,
        labels
      },
      spec: {
        type: 'ClusterIP',
        ports: [{
          port: 3000,
          targetPort: 3000,
          protocol: 'TCP',
          name: 'http'
        }],
        selector: labels
      }
    };

    await k8sApi.createNamespacedService(NAMESPACE, serviceManifest);

    // Create Deployment
    const deploymentManifest = {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: deploymentName,
        namespace: NAMESPACE,
        labels
      },
      spec: {
        replicas: 1,
        selector: {
          matchLabels: labels
        },
        template: {
          metadata: {
            labels
          },
          spec: {
            containers: [{
              name: 'wwebjs-api',
              image: WWEBJS_IMAGE,
              ports: [{
                containerPort: 3000,
                name: 'http'
              }],
              envFrom: [{
                configMapRef: {
                  name: `${deploymentName}-config`
                }
              }],
              volumeMounts: [{
                name: 'sessions',
                mountPath: '/usr/src/app/sessions',
                subPath: config.name
              }],
              livenessProbe: {
                httpGet: {
                  path: '/health',
                  port: 3000
                },
                initialDelaySeconds: 30,
                periodSeconds: 10,
                timeoutSeconds: 5,
                failureThreshold: 3
              },
              readinessProbe: {
                httpGet: {
                  path: '/health',
                  port: 3000
                },
                initialDelaySeconds: 5,
                periodSeconds: 5,
                timeoutSeconds: 3,
                failureThreshold: 3
              },
              resources: {
                requests: {
                  memory: '512Mi',
                  cpu: '250m'
                },
                limits: {
                  memory: '1Gi',
                  cpu: '500m'
                }
              }
            }],
            volumes: [{
              name: 'sessions',
              persistentVolumeClaim: {
                claimName: 'wwebjs-sessions-pvc'
              }
            }]
          }
        }
      }
    };

    const deployment = await k8sAppsApi.createNamespacedDeployment(NAMESPACE, deploymentManifest);
    
    logger.info(`Kubernetes deployment created: ${deploymentName}`);
    return {
      id: deployment.body.metadata.uid,
      name: deploymentName,
      namespace: NAMESPACE
    };
  } catch (error) {
    logger.error('Error creating Kubernetes deployment:', error);
    throw error;
  }
}

async function getDeploymentStatus(deploymentName) {
  try {
    const { k8sAppsApi } = getKubernetesApi();
    const deployment = await k8sAppsApi.readNamespacedDeployment(deploymentName, NAMESPACE);
    
    const status = deployment.body.status;
    const isReady = status.readyReplicas === status.replicas && status.replicas > 0;
    
    return {
      status: isReady ? 'running' : 'pending',
      replicas: status.replicas || 0,
      readyReplicas: status.readyReplicas || 0,
      conditions: status.conditions || []
    };
  } catch (error) {
    if (error.response?.statusCode === 404) {
      return { status: 'not-found' };
    }
    logger.error('Error getting deployment status:', error);
    throw error;
  }
}

async function scaleDeployment(deploymentName, replicas) {
  try {
    const { k8sAppsApi } = getKubernetesApi();
    
    const patch = {
      spec: {
        replicas: replicas
      }
    };

    await k8sAppsApi.patchNamespacedDeployment(
      deploymentName,
      NAMESPACE,
      patch,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { headers: { 'Content-Type': 'application/merge-patch+json' } }
    );

    logger.info(`Deployment ${deploymentName} scaled to ${replicas} replicas`);
  } catch (error) {
    logger.error('Error scaling deployment:', error);
    throw error;
  }
}

async function deleteDeployment(deploymentName) {
  try {
    const { k8sAppsApi, k8sApi } = getKubernetesApi();
    
    // Delete deployment
    await k8sAppsApi.deleteNamespacedDeployment(deploymentName, NAMESPACE);
    
    // Delete service
    try {
      await k8sApi.deleteNamespacedService(deploymentName, NAMESPACE);
    } catch (error) {
      logger.warn(`Service ${deploymentName} not found or already deleted`);
    }
    
    // Delete configmap
    try {
      await k8sApi.deleteNamespacedConfigMap(`${deploymentName}-config`, NAMESPACE);
    } catch (error) {
      logger.warn(`ConfigMap ${deploymentName}-config not found or already deleted`);
    }
    
    logger.info(`Deployment ${deploymentName} deleted`);
  } catch (error) {
    logger.error('Error deleting deployment:', error);
    throw error;
  }
}

async function getDeploymentLogs(deploymentName, options = {}) {
  try {
    const { k8sApi } = getKubernetesApi();
    
    // Get pods for the deployment
    const pods = await k8sApi.listNamespacedPod(
      NAMESPACE,
      undefined,
      undefined,
      undefined,
      undefined,
      `app.kubernetes.io/instance=${deploymentName.replace('wwebjs-', '')}`
    );

    if (pods.body.items.length === 0) {
      return 'No pods found for deployment';
    }

    const podName = pods.body.items[0].metadata.name;
    const logs = await k8sApi.readNamespacedPodLog(
      podName,
      NAMESPACE,
      'wwebjs-api',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      options.tail || 100,
      options.timestamps !== false
    );

    return logs.body;
  } catch (error) {
    logger.error('Error getting deployment logs:', error);
    throw error;
  }
}

async function getDeploymentMetrics(deploymentName) {
  try {
    const { k8sApi } = getKubernetesApi();
    
    // Get pods for the deployment
    const pods = await k8sApi.listNamespacedPod(
      NAMESPACE,
      undefined,
      undefined,
      undefined,
      undefined,
      `app.kubernetes.io/instance=${deploymentName.replace('wwebjs-', '')}`
    );

    if (pods.body.items.length === 0) {
      return { error: 'No pods found' };
    }

    const pod = pods.body.items[0];
    
    // Get metrics from metrics server (requires metrics-server to be installed)
    try {
      const metricsUrl = `/apis/metrics.k8s.io/v1beta1/namespaces/${NAMESPACE}/pods/${pod.metadata.name}`;
      const metrics = await k8sMetricsApi.request({ url: metricsUrl });
      
      const container = metrics.body.containers.find(c => c.name === 'wwebjs-api');
      if (container) {
        return {
          cpuUsage: container.usage.cpu,
          memoryUsage: container.usage.memory,
          timestamp: metrics.body.timestamp
        };
      }
    } catch (metricsError) {
      logger.warn('Metrics server not available, using basic pod info');
    }

    // Fallback to basic pod resource info
    const container = pod.spec.containers.find(c => c.name === 'wwebjs-api');
    return {
      cpuRequest: container?.resources?.requests?.cpu || '0',
      memoryRequest: container?.resources?.requests?.memory || '0',
      cpuLimit: container?.resources?.limits?.cpu || '0',
      memoryLimit: container?.resources?.limits?.memory || '0',
      status: pod.status.phase
    };
  } catch (error) {
    logger.error('Error getting deployment metrics:', error);
    throw error;
  }
}

async function listDeployments() {
  try {
    const { k8sAppsApi } = getKubernetesApi();
    
    const deployments = await k8sAppsApi.listNamespacedDeployment(
      NAMESPACE,
      undefined,
      undefined,
      undefined,
      undefined,
      'app.kubernetes.io/name=wwebjs-api'
    );

    return deployments.body.items.map(deployment => ({
      name: deployment.metadata.name,
      instanceId: deployment.metadata.labels['orchestrator.instance.id'],
      instanceName: deployment.metadata.labels['orchestrator.instance.name'],
      replicas: deployment.status.replicas || 0,
      readyReplicas: deployment.status.readyReplicas || 0,
      status: deployment.status.readyReplicas === deployment.status.replicas ? 'running' : 'pending',
      created: deployment.metadata.creationTimestamp
    }));
  } catch (error) {
    logger.error('Error listing deployments:', error);
    throw error;
  }
}

module.exports = {
  initKubernetes,
  getKubernetesApi,
  createWwebjsDeployment,
  getDeploymentStatus,
  scaleDeployment,
  deleteDeployment,
  getDeploymentLogs,
  getDeploymentMetrics,
  listDeployments
};