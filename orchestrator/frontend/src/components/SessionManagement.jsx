import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  Trash2, 
  RefreshCw, 
  Users, 
  Cpu, 
  HardDrive, 
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader
} from 'lucide-react'
import { instancesAPI } from '../api/client'

export default function SessionManagement({ instanceId }) {
  const [isDeleting, setIsDeleting] = useState(false)
  const queryClient = useQueryClient()

  // Fetch sessions
  const { data: sessionsData, isLoading: sessionsLoading, error: sessionsError } = useQuery({
    queryKey: ['sessions', instanceId],
    queryFn: () => instancesAPI.getSessions(instanceId),
    refetchInterval: 10000, // Refresh every 10 seconds
  })

  // Fetch resource usage
  const { data: resourcesData, isLoading: resourcesLoading } = useQuery({
    queryKey: ['resources', instanceId],
    queryFn: () => instancesAPI.getResources(instanceId),
    refetchInterval: 5000, // Refresh every 5 seconds
  })

  // Delete single session mutation
  const deleteSessionMutation = useMutation({
    mutationFn: (sessionId) => instancesAPI.deleteSession(instanceId, sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries(['sessions', instanceId])
    },
  })

  // Delete all sessions mutation
  const deleteAllSessionsMutation = useMutation({
    mutationFn: () => instancesAPI.deleteAllSessions(instanceId),
    onSuccess: () => {
      queryClient.invalidateQueries(['sessions', instanceId])
    },
  })

  const handleDeleteSession = async (sessionId) => {
    if (window.confirm(`Are you sure you want to delete session "${sessionId}"?`)) {
      await deleteSessionMutation.mutateAsync(sessionId)
    }
  }

  const handleDeleteAllSessions = async () => {
    if (window.confirm('Are you sure you want to delete ALL sessions? This action cannot be undone.')) {
      setIsDeleting(true)
      try {
        await deleteAllSessionsMutation.mutateAsync()
      } finally {
        setIsDeleting(false)
      }
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'connected':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'disconnected':
        return <XCircle className="w-4 h-4 text-red-500" />
      case 'error':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />
      default:
        return <Loader className="w-4 h-4 text-gray-500 animate-spin" />
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'connected':
        return 'text-green-600 bg-green-50'
      case 'disconnected':
        return 'text-red-600 bg-red-50'
      case 'error':
        return 'text-yellow-600 bg-yellow-50'
      default:
        return 'text-gray-600 bg-gray-50'
    }
  }

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div className="space-y-6">
      {/* Resource Usage */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Cpu className="w-5 h-5" />
          Resource Usage
        </h3>
        
        {resourcesLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader className="w-6 h-6 animate-spin text-blue-500" />
            <span className="ml-2">Loading resource usage...</span>
          </div>
        ) : resourcesData ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Cpu className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-medium text-blue-800">CPU Usage</span>
              </div>
              <div className="text-2xl font-bold text-blue-900">
                {resourcesData.cpu || 0}%
              </div>
            </div>
            
            <div className="bg-green-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <HardDrive className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-green-800">Memory Usage</span>
              </div>
              <div className="text-2xl font-bold text-green-900">
                {resourcesData.memory || 0}%
              </div>
              <div className="text-sm text-green-700">
                {formatBytes(resourcesData.memoryUsed || 0)} / {formatBytes(resourcesData.memoryLimit || 0)}
              </div>
            </div>
            
            <div className="bg-purple-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-purple-600" />
                <span className="text-sm font-medium text-purple-800">Active Sessions</span>
              </div>
              <div className="text-2xl font-bold text-purple-900">
                {sessionsData?.sessions?.filter(s => s.status === 'connected').length || 0}
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            No resource data available
          </div>
        )}
      </div>

      {/* Sessions Management */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Users className="w-5 h-5" />
            Session Management
          </h3>
          <div className="flex gap-2">
            <button
              onClick={() => queryClient.invalidateQueries(['sessions', instanceId])}
              className="btn btn-secondary flex items-center gap-2"
              disabled={sessionsLoading}
            >
              <RefreshCw className={`w-4 h-4 ${sessionsLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={handleDeleteAllSessions}
              className="btn btn-danger flex items-center gap-2"
              disabled={isDeleting || deleteAllSessionsMutation.isPending}
            >
              <Trash2 className="w-4 h-4" />
              {isDeleting ? 'Deleting...' : 'Delete All'}
            </button>
          </div>
        </div>

        {sessionsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader className="w-6 h-6 animate-spin text-blue-500" />
            <span className="ml-2">Loading sessions...</span>
          </div>
        ) : sessionsError ? (
          <div className="text-center py-8">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <p className="text-red-600 mb-2">Failed to load sessions</p>
            <p className="text-sm text-gray-500">{sessionsError.message}</p>
          </div>
        ) : sessionsData?.sessions?.length > 0 ? (
          <div className="space-y-3">
            {sessionsData.sessions.map((session) => (
              <div
                key={session.id}
                className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(session.status)}
                    <div>
                      <div className="font-medium">{session.id}</div>
                      <div className="text-sm text-gray-500">
                        State: {session.state || 'unknown'}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(session.status)}`}>
                      {session.status}
                    </span>
                    
                    <button
                      onClick={() => handleDeleteSession(session.id)}
                      className="text-red-600 hover:text-red-800 p-1"
                      disabled={deleteSessionMutation.isPending}
                      title="Delete session"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                
                {session.message && (
                  <div className="mt-2 text-sm text-gray-600">
                    {session.message}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <Users className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p>No sessions found</p>
            <p className="text-sm">Sessions will appear here when WhatsApp instances are running</p>
          </div>
        )}
      </div>
    </div>
  )
}
