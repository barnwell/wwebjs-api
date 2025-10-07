const Docker = require('dockerode');
const { logger } = require('../utils/logger');

let docker = null;

function initDocker() {
  const socketPath = process.env.DOCKER_SOCKET || '/var/run/docker.sock';
  
  docker = new Docker({ socketPath });
  
  // Test connection
  return docker.ping()
    .then(() => {
      logger.info('Docker connection successful');
      return docker;
    })
    .catch(err => {
      logger.error('Docker connection failed:', err.message);
      throw err;
    });
}

function getDocker() {
  if (!docker) {
    throw new Error('Docker not initialized. Call initDocker() first.');
  }
  return docker;
}

async function ensureNetwork() {
  const networkName = process.env.DOCKER_NETWORK || 'wwebjs-network';
  
  try {
    const networks = await docker.listNetworks({
      filters: { name: [networkName] }
    });

    if (networks.length === 0) {
      await docker.createNetwork({
        Name: networkName,
        Driver: 'bridge'
      });
      logger.info(`Created Docker network: ${networkName}`);
    }
    
    return networkName;
  } catch (error) {
    logger.error('Error ensuring network:', error);
    throw error;
  }
}

async function pullImage(imageName) {
  return new Promise((resolve, reject) => {
    docker.pull(imageName, (err, stream) => {
      if (err) return reject(err);

      docker.modem.followProgress(stream, (err, output) => {
        if (err) return reject(err);
        resolve(output);
      }, (event) => {
        logger.debug(`Pull progress: ${JSON.stringify(event)}`);
      });
    });
  });
}

async function createContainer(config) {
  try {
    const networkName = await ensureNetwork();
    
    const containerConfig = {
      Image: config.image,
      name: config.name,
      Hostname: config.name,
      Env: config.env || [],
      ExposedPorts: config.exposedPorts || {},
      HostConfig: {
        PortBindings: config.portBindings || {},
        Binds: config.volumes || [],
        RestartPolicy: config.restartPolicy || { Name: 'unless-stopped' },
        NetworkMode: networkName
      },
      Labels: config.labels || {}
    };

    const container = await docker.createContainer(containerConfig);
    logger.info(`Container created: ${config.name} (${container.id})`);
    
    return container;
  } catch (error) {
    logger.error('Error creating container:', error);
    throw error;
  }
}

async function getContainerStats(containerId) {
  try {
    const container = docker.getContainer(containerId);
    const stats = await container.stats({ stream: false });
    
    // Calculate CPU usage percentage
    const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
    const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
    const cpuUsage = (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100;

    // Calculate memory usage
    const memoryUsage = stats.memory_stats.usage;
    const memoryLimit = stats.memory_stats.limit;
    const memoryPercent = (memoryUsage / memoryLimit) * 100;

    // Calculate network I/O
    let networkRx = 0;
    let networkTx = 0;
    if (stats.networks) {
      Object.values(stats.networks).forEach(net => {
        networkRx += net.rx_bytes;
        networkTx += net.tx_bytes;
      });
    }

    return {
      cpuUsage: cpuUsage.toFixed(2),
      memoryUsage: (memoryUsage / (1024 * 1024)).toFixed(2), // MB
      memoryLimit: (memoryLimit / (1024 * 1024)).toFixed(2), // MB
      memoryPercent: memoryPercent.toFixed(2),
      networkRx: (networkRx / (1024 * 1024)).toFixed(2), // MB
      networkTx: (networkTx / (1024 * 1024)).toFixed(2) // MB
    };
  } catch (error) {
    logger.error('Error getting container stats:', error);
    throw error;
  }
}

async function getContainerLogs(containerId, options = {}) {
  try {
    const container = docker.getContainer(containerId);
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail: options.tail || 100,
      timestamps: options.timestamps !== false,
      ...options
    });

    return logs.toString('utf8');
  } catch (error) {
    logger.error('Error getting container logs:', error);
    throw error;
  }
}

async function stopContainer(containerId) {
  try {
    const container = docker.getContainer(containerId);
    await container.stop({ t: 10 }); // 10 second graceful shutdown
    logger.info(`Container stopped: ${containerId}`);
  } catch (error) {
    if (error.statusCode === 304) {
      logger.warn(`Container already stopped: ${containerId}`);
    } else {
      throw error;
    }
  }
}

async function startContainer(containerId) {
  try {
    const container = docker.getContainer(containerId);
    await container.start();
    logger.info(`Container started: ${containerId}`);
  } catch (error) {
    if (error.statusCode === 304) {
      logger.warn(`Container already started: ${containerId}`);
    } else {
      throw error;
    }
  }
}

async function restartContainer(containerId) {
  try {
    const container = docker.getContainer(containerId);
    await container.restart({ t: 10 });
    logger.info(`Container restarted: ${containerId}`);
  } catch (error) {
    logger.error('Error restarting container:', error);
    throw error;
  }
}

async function removeContainer(containerId, force = false) {
  try {
    const container = docker.getContainer(containerId);
    await container.remove({ force, v: true }); // v: true removes volumes
    logger.info(`Container removed: ${containerId}`);
  } catch (error) {
    logger.error('Error removing container:', error);
    throw error;
  }
}

async function inspectContainer(containerId) {
  try {
    const container = docker.getContainer(containerId);
    return await container.inspect();
  } catch (error) {
    logger.error('Error inspecting container:', error);
    throw error;
  }
}

async function listContainers(options = {}) {
  try {
    return await docker.listContainers({
      all: options.all !== false,
      ...options
    });
  } catch (error) {
    logger.error('Error listing containers:', error);
    throw error;
  }
}

module.exports = {
  initDocker,
  getDocker,
  ensureNetwork,
  pullImage,
  createContainer,
  getContainerStats,
  getContainerLogs,
  stopContainer,
  startContainer,
  restartContainer,
  removeContainer,
  inspectContainer,
  listContainers
};

