import { useQuery } from '@tanstack/react-query'
import { Server, Activity, AlertCircle, CheckCircle, XCircle } from 'lucide-react'
import { instancesAPI, metricsAPI } from '../api/client'
import { Link } from 'react-router-dom'

export default function Dashboard() {
  const { data: instances = [], isLoading, error: instancesError } = useQuery({
    queryKey: ['instances'],
    queryFn: instancesAPI.getAll,
    refetchInterval: 5000,
  })

  const { data: latestMetrics = [], error: metricsError } = useQuery({
    queryKey: ['metrics', 'latest'],
    queryFn: metricsAPI.getLatest,
    refetchInterval: 5000,
  })

  const stats = {
    total: instances.length,
    running: instances.filter(i => i.status === 'running').length,
    stopped: instances.filter(i => i.status === 'stopped').length,
    connected: instances.filter(i => i.session_status === 'connected').length,
  }

  const getMetricsForInstance = (instanceId) => {
    return latestMetrics.find(m => m.instance_id === instanceId) || {}
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  if (instancesError) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-500">
          Error loading instances: {instancesError.message}
        </div>
      </div>
    )
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Dashboard</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Instances</p>
              <p className="text-3xl font-bold mt-1">{stats.total}</p>
            </div>
            <Server className="w-12 h-12 text-primary-500" />
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Running</p>
              <p className="text-3xl font-bold mt-1 text-green-600">{stats.running}</p>
            </div>
            <CheckCircle className="w-12 h-12 text-green-500" />
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Stopped</p>
              <p className="text-3xl font-bold mt-1 text-gray-600">{stats.stopped}</p>
            </div>
            <XCircle className="w-12 h-12 text-gray-400" />
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Connected to WhatsApp</p>
              <p className="text-3xl font-bold mt-1 text-blue-600">{stats.connected}</p>
            </div>
            <Activity className="w-12 h-12 text-blue-500" />
          </div>
        </div>
      </div>

      {/* Instances List */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-4">Recent Instances</h2>
        
        {instances.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No instances created yet</p>
            <Link to="/instances" className="btn btn-primary mt-4 inline-block">
              Create your first instance
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {instances.slice(0, 5).map((instance) => {
              const metrics = getMetricsForInstance(instance.id)
              
              return (
                <Link
                  key={instance.id}
                  to={`/instances/${instance.id}`}
                  className="block p-4 border border-gray-200 rounded-lg hover:border-primary-300 hover:bg-primary-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="font-medium">{instance.name}</h3>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          instance.status === 'running'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}>
                          {instance.status}
                        </span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          instance.session_status === 'connected'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {instance.session_status || 'disconnected'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">Port: {instance.port}</p>
                    </div>
                    
                    {metrics.cpu_usage && (
                      <div className="flex gap-6 text-sm">
                        <div>
                          <span className="text-gray-600">CPU:</span>
                          <span className="ml-2 font-medium">{metrics.cpu_usage}%</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Memory:</span>
                          <span className="ml-2 font-medium">{metrics.memory_usage} MB</span>
                        </div>
                      </div>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        )}

        {instances.length > 5 && (
          <Link to="/instances" className="block text-center mt-4 text-primary-600 hover:text-primary-700">
            View all instances →
          </Link>
        )}
      </div>
    </div>
  )
}

