import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { 
  Trash2, 
  RefreshCw, 
  Users, 
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader,
  QrCode,
  User,
  Phone
} from 'lucide-react'
import { instancesAPI } from '../api/client'

export default function SessionManagement({ instanceId }) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [qrModalSession, setQrModalSession] = useState(null)
  const queryClient = useQueryClient()

  // Fetch sessions
  const { data: sessionsData, isLoading: sessionsLoading, error: sessionsError } = useQuery({
    queryKey: ['sessions', instanceId],
    queryFn: () => instancesAPI.getSessions(instanceId),
    refetchInterval: 10000, // Refresh every 10 seconds
  })

  // Fetch session class info for connected sessions
  const { data: sessionClassInfos = {} } = useQuery({
    queryKey: ['session-class-infos', instanceId],
    queryFn: async () => {
      if (!sessionsData?.sessions) return {}
      
      const connectedSessions = sessionsData.sessions.filter(s => s.status === 'connected')
      const classInfoPromises = connectedSessions.map(async (session) => {
        try {
          const info = await instancesAPI.getSessionClassInfo(instanceId, session.id)
          return { sessionId: session.id, info }
        } catch (error) {
          console.error(`Failed to fetch class info for session ${session.id}:`, error)
          return { sessionId: session.id, info: null }
        }
      })
      
      const results = await Promise.all(classInfoPromises)
      return results.reduce((acc, { sessionId, info }) => {
        acc[sessionId] = info
        return acc
      }, {})
    },
    enabled: !!sessionsData?.sessions?.some(s => s.status === 'connected'),
    refetchInterval: 30000, // Refresh every 30 seconds
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

  const handleShowQR = (sessionId) => {
    setQrModalSession(sessionId)
  }

  return (
    <div className="space-y-6">
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
            {sessionsData.sessions.map((session) => {
              const classInfo = sessionClassInfos[session.id]
              const isConnected = session.status === 'connected'
              
              return (
                <div
                  key={session.id}
                  className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3 flex-1">
                      {getStatusIcon(session.status)}
                      <div className="flex-1">
                        <div className="font-medium">{session.id}</div>
                        <div className="text-sm text-gray-500 mb-2">
                          State: {session.state || 'unknown'}
                        </div>
                        
                        {/* Show user info for connected sessions */}
                        {isConnected && classInfo && (
                          <div className="space-y-1">
                            {classInfo.wid?.user && (
                              <div className="flex items-center gap-2 text-sm">
                                <Phone className="w-3 h-3 text-blue-500" />
                                <span className="text-gray-700">
                                  {classInfo.wid.user}
                                </span>
                              </div>
                            )}
                            {classInfo.pushname && (
                              <div className="flex items-center gap-2 text-sm">
                                <User className="w-3 h-3 text-green-500" />
                                <span className="text-gray-700">
                                  {classInfo.pushname}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                        
                        {session.message && (
                          <div className="mt-2 text-sm text-gray-600">
                            {session.message}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(session.status)}`}>
                        {session.status}
                      </span>
                      
                      {/* Show QR code button for disconnected sessions */}
                      {!isConnected && (
                        <button
                          onClick={() => handleShowQR(session.id)}
                          className="text-blue-600 hover:text-blue-800 p-1"
                          title="Show QR Code"
                        >
                          <QrCode className="w-4 h-4" />
                        </button>
                      )}
                      
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
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <Users className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p>No sessions found</p>
            <p className="text-sm">Sessions will appear here when WhatsApp instances are running</p>
          </div>
        )}
      </div>

      {/* QR Code Modal */}
      {qrModalSession && (
        <QRCodeModal
          instanceId={instanceId}
          sessionId={qrModalSession}
          onClose={() => setQrModalSession(null)}
        />
      )}
    </div>
  )
}

// QR Code Modal Component
function QRCodeModal({ instanceId, sessionId, onClose }) {
  const [qrError, setQrError] = useState(null)
  
  const qrImageUrl = `/api/instances/${instanceId}/session-qr/${sessionId}`
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">QR Code for {sessionId}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <XCircle className="w-6 h-6" />
          </button>
        </div>
        
        <div className="text-center">
          <p className="text-sm text-gray-600 mb-4">
            Scan this QR code with WhatsApp to connect the session
          </p>
          
          <div className="bg-gray-100 rounded-lg p-4 mb-4">
            {qrError ? (
              <div className="text-center py-8">
                <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-2" />
                <p className="text-sm text-gray-600 mb-2">
                  QR code not available.
                </p>
                <p className="text-xs text-gray-500">
                  Possible reasons: Session already connected, API key not configured, or instance not running.
                </p>
              </div>
            ) : (
              <img
                src={qrImageUrl}
                alt="WhatsApp QR Code"
                className="mx-auto max-w-full h-auto"
                onError={() => setQrError(true)}
                onLoad={() => setQrError(false)}
              />
            )}
          </div>
          
          <button
            onClick={onClose}
            className="btn btn-primary w-full"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
