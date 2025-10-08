import { useState, useEffect } from 'react'
import { apiClient } from '../api/client'

export default function DebugInfo() {
  const [debugInfo, setDebugInfo] = useState({
    user: null,
    token: null,
    apiTest: null,
    error: null
  })

  useEffect(() => {
    const user = localStorage.getItem('user')
    const token = localStorage.getItem('token')
    
    setDebugInfo(prev => ({
      ...prev,
      user: user ? JSON.parse(user) : null,
      token: token ? 'Present' : 'Missing'
    }))

    // Test API connection
    const testAPI = async () => {
      try {
        const response = await fetch('/api/health')
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = await response.json()
        setDebugInfo(prev => ({
          ...prev,
          apiTest: 'Success',
          error: null
        }))
      } catch (error) {
        setDebugInfo(prev => ({
          ...prev,
          apiTest: 'Failed',
          error: error.message
        }))
      }
    }

    testAPI()
  }, [])

  return (
    <div className="fixed bottom-4 right-4 bg-white border border-gray-300 rounded-lg p-4 shadow-lg max-w-sm">
      <h3 className="font-bold mb-2">Debug Info</h3>
      <div className="text-sm space-y-1">
        <div>User: {debugInfo.user?.username || 'None'}</div>
        <div>Token: {debugInfo.token}</div>
        <div>API Test: {debugInfo.apiTest || 'Testing...'}</div>
        {debugInfo.error && (
          <div className="text-red-600">Error: {debugInfo.error}</div>
        )}
      </div>
    </div>
  )
}