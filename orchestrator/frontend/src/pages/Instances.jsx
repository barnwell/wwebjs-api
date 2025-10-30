import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Play, Square, RotateCw, Trash2, Edit2, User, Cpu, HardDrive } from 'lucide-react'
import toast from 'react-hot-toast'
import { instancesAPI, templatesAPI, metricsAPI } from '../api/client'
import CreateInstanceModal from '../components/CreateInstanceModal'
import EditInstanceModal from '../components/EditInstanceModal'

export default function Instances() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editingInstance, setEditingInstance] = useState(null)
  const queryClient = useQueryClient()

  // Get current user from localStorage 
  const user = JSON.parse(localStorage.getItem('user') || 'null')

  const { data: instances = [], isLoading, error } = useQuery({
    queryKey: ['instances'],
    queryFn: instancesAPI.getAll,
    refetchInterval: 5000,
  })

  const { data: templates = [], error: templatesError } = useQuery({
    queryKey: ['templates'],
    queryFn: templatesAPI.getAll,
  })

  const { data: latestMetrics = [] } = useQuery({
    queryKey: ['metrics', 'latest'],
    queryFn: metricsAPI.getLatest,
    refetchInterval: 5000,
  })

  const startMutation = useMutation({
    mutationFn: instancesAPI.start,
    onSuccess: () => {
      queryClient.invalidateQueries(['instances'])
      toast.success('Instance started successfully')
    },
    onError: (error) => {
      toast.error(`Failed to start instance: ${error.message}`)
    },
  })

  const stopMutation = useMutation({
    mutationFn: instancesAPI.stop,
    onSuccess: () => {
      queryClient.invalidateQueries(['instances'])
      toast.success('Instance stopped successfully')
    },
    onError: (error) => {
      toast.error(`Failed to stop instance: ${error.message}`)
    },
  })

  const restartMutation = useMutation({
    mutationFn: instancesAPI.restart,
    onSuccess: () => {
      queryClient.invalidateQueries(['instances'])
      toast.success('Instance restarted successfully')
    },
    onError: (error) => {
      toast.error(`Failed to restart instance: ${error.message}`)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: instancesAPI.delete,
    onSuccess: () => {
      queryClient.invalidateQueries(['instances'])
      toast.success('Instance deleted successfully')
    },
    onError: (error) => {
      toast.error(`Failed to delete instance: ${error.message}`)
    },
  })

  const handleDelete = (id, name) => {
    if (window.confirm(`Are you sure you want to delete "${name}"?`)) {
      deleteMutation.mutate(id)
    }
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

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-500">
          Error loading instances: {error.message}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Instances</h1>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Create Instance
        </button>
      </div>

      {instances.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500 mb-4">No instances created yet</p>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="btn btn-primary"
          >
            Create your first instance
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {instances.map((instance) => {
            const metrics = getMetricsForInstance(instance.id)
            return (
              <div key={instance.id} className="card">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold">{instance.name}</h3>
                    <div className="flex items-center gap-4 mt-1">
                      <p className="text-sm text-gray-600">Port: {instance.port}</p>
                      {instance.owner_username && (
                        <div className="flex items-center gap-1 text-sm text-gray-600">
                          <User className="w-3 h-3" />
                          <span>{instance.owner_username}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
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
                </div>

                {instance.description && (
                  <p className="text-sm text-gray-600 mb-4">{instance.description}</p>
                )}

                {/* Resource Usage */}
                {instance.status === 'running' && metrics.cpu_usage && (
                  <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Resource Usage</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-blue-500" />
                        <div>
                          <div className="text-sm text-gray-600">CPU</div>
                          <div className="text-sm font-medium">{metrics.cpu_usage}%</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <HardDrive className="w-4 h-4 text-green-500" />
                        <div>
                          <div className="text-sm text-gray-600">Memory</div>
                          <div className="text-sm font-medium">
                            {metrics.memory_usage}MB
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                {instance.status === 'stopped' ? (
                  <button
                    onClick={() => startMutation.mutate(instance.id)}
                    disabled={startMutation.isPending}
                    className="btn btn-success flex items-center gap-1 text-sm"
                  >
                    <Play className="w-4 h-4" />
                    Start
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => stopMutation.mutate(instance.id)}
                      disabled={stopMutation.isPending}
                      className="btn btn-secondary flex items-center gap-1 text-sm"
                    >
                      <Square className="w-4 h-4" />
                      Stop
                    </button>
                    <button
                      onClick={() => restartMutation.mutate(instance.id)}
                      disabled={restartMutation.isPending}
                      className="btn btn-secondary flex items-center gap-1 text-sm"
                    >
                      <RotateCw className="w-4 h-4" />
                      Restart
                    </button>
                  </>
                )}
                
                <button
                  onClick={() => setEditingInstance(instance)}
                  className="btn btn-secondary flex items-center gap-1 text-sm"
                >
                  <Edit2 className="w-4 h-4" />
                  Edit
                </button>
                
                <Link
                  to={`/instances/${instance.id}`}
                  className="btn btn-secondary text-sm"
                >
                  Details
                </Link>
                
                <button
                  onClick={() => handleDelete(instance.id, instance.name)}
                  disabled={deleteMutation.isPending}
                  className="btn btn-danger flex items-center gap-1 text-sm ml-auto"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {isCreateModalOpen && (
        <CreateInstanceModal
          templates={templates}
          user={user}
          onClose={() => setIsCreateModalOpen(false)}
          onSuccess={() => {
            setIsCreateModalOpen(false)
            queryClient.invalidateQueries(['instances'])
          }}
        />
      )}

      {editingInstance && (
        <EditInstanceModal
          instance={editingInstance}
          user={user}
          onClose={() => setEditingInstance(null)}
          onSuccess={() => {
            setEditingInstance(null)
            queryClient.invalidateQueries(['instances'])
          }}
        />
      )}


    </div>
  )
}

