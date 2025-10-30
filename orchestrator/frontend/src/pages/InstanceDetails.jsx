import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Activity, Terminal, Settings as SettingsIcon, Users, Edit, Cpu, HardDrive, Loader, Eye, EyeOff, Key } from 'lucide-react'
import { instancesAPI, metricsAPI } from '../api/client'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import toast from 'react-hot-toast'
import SessionManagement from '../components/SessionManagement'
import EditInstanceModal from '../components/EditInstanceModal'

export default function InstanceDetails({ user }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('metrics')
  const [showEditModal, setShowEditModal] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [showImageUpdateModal, setShowImageUpdateModal] = useState(false)

  const [logs, setLogs] = useState('')

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }



  const { data: instance, isLoading, error } = useQuery({
    queryKey: ['instances', id],
    queryFn: () => instancesAPI.getById(id),
    refetchInterval: 5000,
  })

  const { data: metrics = [], error: metricsError } = useQuery({
    queryKey: ['metrics', id],
    queryFn: () => metricsAPI.getByInstance(id, '1h'),
    refetchInterval: 5000,
    enabled: activeTab === 'metrics',
  })

  // Fetch resource usage for instance header
  const { data: resourcesData, isLoading: resourcesLoading } = useQuery({
    queryKey: ['resources', id],
    queryFn: () => instancesAPI.getResources(id),
    refetchInterval: 5000,
  })

  const { data: logsData, error: logsError } = useQuery({
    queryKey: ['logs', id],
    queryFn: () => instancesAPI.getLogs(id, 100),
    refetchInterval: 5000,
    enabled: activeTab === 'logs',
  })

  // Update logs state when data changes
  useEffect(() => {
    if (logsData?.logs) {
      setLogs(logsData.logs)
    }
  }, [logsData])

  const handleClearLogs = () => {
    setLogs('')
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500 mb-4">Error loading instance: {error.message}</p>
        <button onClick={() => navigate('/instances')} className="btn btn-primary">
          Back to Instances
        </button>
      </div>
    )
  }

  if (!instance) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 mb-4">Instance not found</p>
        <button onClick={() => navigate('/instances')} className="btn btn-primary">
          Back to Instances
        </button>
      </div>
    )
  }

  const metricsData = metrics.reverse().map(m => ({
    time: new Date(m.timestamp).toLocaleTimeString(),
    cpu: parseFloat(m.cpu_usage),
    memory: parseFloat(m.memory_usage),
  }))

  return (
    <div>
      <button
        onClick={() => navigate('/instances')}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6"
      >
        <ArrowLeft className="w-5 h-5" />
        Back to Instances
      </button>

      <div className="card mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold">{instance.name}</h1>
            {instance.description && (
              <p className="text-gray-600 mt-2">{instance.description}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowEditModal(true)}
              className="btn btn-secondary flex items-center gap-2"
            >
              <Edit className="w-4 h-4" />
              Edit Instance
            </button>

            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${instance.status === 'running'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-gray-100 text-gray-700'
                  }`}>
                  {instance.status}
                </span>
                {instance.status === 'running' && resourcesData && (
                  <span className="text-xs text-gray-600">
                    Memory: {formatBytes(resourcesData.memoryUsed || 0)}
                  </span>
                )}
              </div>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${instance.session_status === 'connected'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-yellow-100 text-yellow-700'
                }`}>
                {instance.session_status || 'disconnected'}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div>
            <p className="text-sm text-gray-600">Instance</p>
            <p className="text-lg font-semibold">3.140.52.120:{instance.port}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Container ID</p>
            <p className="text-lg font-semibold font-mono text-sm">
              {instance.container_id ? instance.container_id.substring(0, 12) : 'N/A'}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Docker Image</p>
            <p className="text-lg font-semibold font-mono text-sm" title={instance.container_info?.image || 'N/A'}>
              {instance.container_info?.image ? 
                (instance.container_info.image.length > 20 ? 
                  `${instance.container_info.image.substring(0, 20)}...` : 
                  instance.container_info.image
                ) : 'N/A'
              }
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Image ID</p>
            <p className="text-lg font-semibold font-mono text-sm" title={instance.container_info?.image_id || 'N/A'}>
              {instance.container_info?.image_id ? 
                `${instance.container_info.image_id.substring(0, 12)}...` : 'N/A'
              }
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Created</p>
            <p className="text-lg font-semibold">
              {new Date(instance.created_at).toLocaleDateString()}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Last Started</p>
            <p className="text-lg font-semibold">
              {instance.last_started_at
                ? new Date(instance.last_started_at).toLocaleString()
                : 'Never'}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200">
        <div className="flex gap-6">
          {[
            { id: 'metrics', label: 'Metrics', icon: Activity },
            { id: 'sessions', label: 'Sessions', icon: Users },
            { id: 'logs', label: 'Logs', icon: Terminal },
            { id: 'config', label: 'Configuration', icon: SettingsIcon },
          ].map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${activeTab === tab.id
                  ? 'border-primary-600 text-primary-600 font-medium'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
              >
                <Icon className="w-5 h-5" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'sessions' && (
        <SessionManagement instanceId={id} />
      )}

      {activeTab === 'metrics' && (
        <div className="space-y-6">
          {/* Historical Metrics */}
          <div className="card">
            <h2 className="text-xl font-semibold mb-6">Historical Metrics (Last Hour)</h2>

            {metricsError ? (
              <div className="text-center py-12 text-red-500">
                Error loading metrics: {metricsError.message}
              </div>
            ) : metricsData.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                No historical metrics data available yet
              </div>
            ) : (
              <>
                <div className="mb-8">
                  <h3 className="text-sm font-medium text-gray-700 mb-4">CPU Usage (%)</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={metricsData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="time" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="cpu" stroke="#3b82f6" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-4">Memory Usage (MB)</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={metricsData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="time" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="memory" stroke="#10b981" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Container Logs</h2>
            <button
              onClick={handleClearLogs}
              className="btn btn-secondary text-sm"
            >
              Clear Logs
            </button>
          </div>
          <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm overflow-x-auto max-h-[500px] overflow-y-auto">
            {logsError ? (
              <p className="text-red-400">Error loading logs: {logsError.message}</p>
            ) : logs ? (
              <pre className="whitespace-pre-wrap">{logs}</pre>
            ) : (
              <p className="text-gray-400">No logs available</p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'config' && (
        <div className="space-y-6">
          {/* Container Information Section */}
          {instance.container_info && (
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Container Information</h3>
                {user?.role === 'admin' && (
                  <button
                    onClick={() => setShowImageUpdateModal(true)}
                    className="btn btn-secondary text-sm"
                  >
                    Update Image
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Docker Image</h4>
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs text-gray-500">Image Name</p>
                      <p className="font-mono text-sm bg-gray-50 rounded px-2 py-1 break-all">
                        {instance.container_info.image}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Image ID</p>
                      <p className="font-mono text-sm bg-gray-50 rounded px-2 py-1">
                        {instance.container_info.image_id}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Platform</p>
                      <p className="font-mono text-sm bg-gray-50 rounded px-2 py-1">
                        {instance.container_info.platform}
                      </p>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Build Information</h4>
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs text-gray-500">Version</p>
                      <p className="font-mono text-sm bg-gray-50 rounded px-2 py-1">
                        {instance.container_info.build_info?.version || 'Unknown'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Git Revision</p>
                      <p className="font-mono text-sm bg-gray-50 rounded px-2 py-1">
                        {instance.container_info.build_info?.revision || 'Unknown'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Build Date</p>
                      <p className="font-mono text-sm bg-gray-50 rounded px-2 py-1">
                        {instance.container_info.build_info?.build_date !== 'Unknown' ? 
                          new Date(instance.container_info.build_info.build_date).toLocaleString() :
                          'Unknown'
                        }
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* API Key Section */}
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Key className="w-5 h-5" />
                API Key
              </h3>
              <button
                onClick={() => setShowApiKey(!showApiKey)}
                className="btn btn-secondary flex items-center gap-2"
              >
                {showApiKey ? (
                  <>
                    <EyeOff className="w-4 h-4" />
                    Hide
                  </>
                ) : (
                  <>
                    <Eye className="w-4 h-4" />
                    Show
                  </>
                )}
              </button>
            </div>

            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-700 mb-1">Current API Key</p>
                  <div className="font-mono text-sm bg-white border rounded px-3 py-2">
                    {showApiKey ? (
                      <span className="text-gray-900">
                        {instance.config.API_KEY || 'Not configured'}
                      </span>
                    ) : (
                      <span className="text-gray-500">
                        {instance.config.API_KEY ? '••••••••••••••••••••••••••••••••' : 'Not configured'}
                      </span>
                    )}
                  </div>
                </div>
                {showApiKey && instance.config.API_KEY && (
                  <button
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(instance.config.API_KEY)
                        toast.success('API key copied to clipboard')
                      } catch (error) {
                        toast.error('Failed to copy API key')
                      }
                    }}
                    className="btn btn-secondary text-sm"
                    title="Copy to clipboard"
                  >
                    Copy
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs text-gray-500">
                  This API key is used to authenticate requests to the wwebjs-api instance.
                </p>
                {!instance.config.API_KEY && (
                  <span className="text-xs text-red-500 font-medium">
                    ⚠️ Not configured
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Configuration Section */}
          <div className="card">
            <h2 className="text-xl font-semibold mb-4">Environment Configuration</h2>
            <div className="space-y-4">
              {Object.entries(instance.config).map(([key, value]) => (
                <div key={key} className="border-b border-gray-200 pb-3">
                  <p className="text-sm font-medium text-gray-700">{key}</p>
                  <p className="text-gray-900 mt-1 font-mono text-sm">
                    {key.includes('KEY') || key.includes('SECRET') ? '••••••••' : value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Edit Instance Modal */}
      {showEditModal && (
        <EditInstanceModal
          instance={instance}
          user={user}
          onClose={() => setShowEditModal(false)}
          onSuccess={() => setShowEditModal(false)}
        />
      )}

      {/* Image Update Modal */}
      {showImageUpdateModal && (
        <ImageUpdateModal
          instance={instance}
          onClose={() => setShowImageUpdateModal(false)}
          onSuccess={() => setShowImageUpdateModal(false)}
        />
      )}
    </div>
  )
}

// Image Update Modal Component
function ImageUpdateModal({ instance, onClose, onSuccess }) {
  const [image, setImage] = useState(instance.container_info?.image || 'wwebjs-api:latest')
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const response = await instancesAPI.updateImage(instance.id, { image })
      toast.success(response.message || 'Image updated successfully')
      onSuccess()
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to update image')
    } finally {
      setIsLoading(false)
    }
  }

  const commonImages = [
    'wwebjs-api:latest',
    'wwebjs-api:dev',
    'wwebjs-api:v1.1-message-status',
    'wwebjs-api:stable'
  ]

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-semibold mb-4">Update Docker Image</h2>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Docker Image
            </label>
            <input
              type="text"
              value={image}
              onChange={(e) => setImage(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="e.g., wwebjs-api:latest"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Current: {instance.container_info?.image || 'Unknown'}
            </p>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Common Images
            </label>
            <div className="grid grid-cols-2 gap-2">
              {commonImages.map((img) => (
                <button
                  key={img}
                  type="button"
                  onClick={() => setImage(img)}
                  className={`text-xs px-2 py-1 rounded border ${
                    image === img 
                      ? 'bg-primary-100 border-primary-300 text-primary-700'
                      : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {img}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 mb-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">
                  Important: Session Preservation
                </h3>
                <div className="mt-2 text-sm text-yellow-700">
                  <ul className="list-disc list-inside space-y-1">
                    <li>This will stop and recreate the container with the new image</li>
                    <li>WhatsApp sessions are preserved via volume mounting</li>
                    <li>There will be a brief downtime during the update</li>
                    <li>Backup your sessions before major updates (recommended)</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50"
              disabled={isLoading}
            >
              {isLoading ? 'Updating...' : 'Update Image'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

