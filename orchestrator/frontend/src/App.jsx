import { useState, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import LoginModal from './components/LoginModal'
import Profile from './components/Profile'
import Dashboard from './pages/Dashboard'
import Instances from './pages/Instances'
import InstanceDetails from './pages/InstanceDetails'
import Templates from './pages/Templates'
import Settings from './pages/Settings'
import UserManagement from './components/UserManagement'
import DebugInfo from './components/DebugInfo'

function App() {
  const [user, setUser] = useState(null)
  const [showLogin, setShowLogin] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Check if user is already logged in
    const storedUser = localStorage.getItem('user')
    const token = localStorage.getItem('token')
    
    if (storedUser && token) {
      setUser(JSON.parse(storedUser))
    } else {
      setShowLogin(true)
    }
    setIsLoading(false)
  }, [])

  const handleLogin = (userData) => {
    setUser(userData)
    setShowLogin(false)
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('user')
    setUser(null)
    setShowLogin(true)
  }

  const handleUserUpdate = (updatedUser) => {
    setUser(updatedUser)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    )
  }

  if (!user || showLogin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            wwebjs Orchestrator
          </h1>
          <p className="text-gray-600 mb-8">
            Please log in to continue
          </p>
          <button
            onClick={() => setShowLogin(true)}
            className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Login
          </button>
        </div>
        
        {showLogin && (
          <LoginModal
            onLogin={handleLogin}
            onClose={() => setShowLogin(false)}
          />
        )}
      </div>
    )
  }

  return (
    <>
      <Routes>
        <Route path="/" element={<Layout user={user} onLogout={handleLogout} />}>
          <Route index element={<Dashboard />} />
          <Route path="instances" element={<Instances />} />
          <Route path="instances/:id" element={<InstanceDetails />} />
          <Route path="templates" element={<Templates />} />
          <Route path="profile" element={<Profile user={user} onUserUpdate={handleUserUpdate} />} />
          <Route path="settings" element={<Settings />} />
          {user?.role === 'admin' && (
            <Route path="users" element={<UserManagement />} />
          )}
        </Route>
      </Routes>
      {process.env.NODE_ENV === 'development' && <DebugInfo />}
    </>
  )
}

export default App

