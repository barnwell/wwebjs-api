import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Activity, Terminal, Settings as SettingsIcon, Users, Edit } from 'lucide-react'
import { instancesAPI, metricsAPI } from '../api/client'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import SessionManagement from '../components/SessionManagement'
import EditInstanceModal from '../components/EditInstanceModal'

export default function InstanceDetails() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('metrics')
  const [showEditModal, setShowEditModal] = useState(false)

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

  const { data: logsData, error: logsError } = useQuery({
    queryKey: ['logs', id],
    queryFn: () => instancesAPI.getLogs(id, 100),
    refetchInterval: 5000,
    enabled: activeTab === 'logs',
  })

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
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              instance.status === 'running'
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-700'
            }`}>
              {instance.status}
            </span>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              instance.session_status === 'connected'
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
            <p className="text-sm text-gray-600">Port</p>
            <p className="text-lg font-semibold">{instance.port}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Container ID</p>
            <p className="text-lg font-semibold font-mono text-sm">
              {instance.container_id ? instance.container_id.substring(0, 12) : 'N/A'}
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
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${
                  activeTab === tab.id
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
        <div className="card">
          <h2 className="text-xl font-semibold mb-6">Resource Usage (Last Hour)</h2>
          
          {metricsError ? (
            <div className="text-center py-12 text-red-500">
              Error loading metrics: {metricsError.message}
            </div>
          ) : metricsData.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No metrics data available yet
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
      )}

      {activeTab === 'logs' && (
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Container Logs</h2>
          <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-sm overflow-x-auto max-h-[500px] overflow-y-auto">
            {logsError ? (
              <p className="text-red-400">Error loading logs: {logsError.message}</p>
            ) : logsData?.logs ? (
              <pre className="whitespace-pre-wrap">{logsData.logs}</pre>
            ) : (
              <p className="text-gray-400">No logs available</p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'config' && (
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Configuration</h2>
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
      )}

      {/* Edit Instance Modal */}
      {showEditModal && (
        <EditInstanceModal
          instance={instance}
          onClose={() => setShowEditModal(false)}
          onSuccess={() => setShowEditModal(false)}
        />
      )}
    </div>
  )
}

