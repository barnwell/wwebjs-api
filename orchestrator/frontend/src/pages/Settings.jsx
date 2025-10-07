import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import toast from 'react-hot-toast'
import { settingsAPI } from '../api/client'
import { useState, useEffect } from 'react'

export default function Settings() {
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState({})

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsAPI.getAll,
  })

  useEffect(() => {
    if (settings) {
      setFormData(settings)
    }
  }, [settings])

  const updateMutation = useMutation({
    mutationFn: ({ key, value }) => settingsAPI.update(key, value),
    onSuccess: () => {
      queryClient.invalidateQueries(['settings'])
      toast.success('Settings saved successfully')
    },
    onError: (error) => {
      toast.error(`Failed to save settings: ${error.message}`)
    },
  })

  const handleSave = () => {
    Object.entries(formData).forEach(([key, value]) => {
      if (value !== settings[key]) {
        updateMutation.mutate({ key, value })
      }
    })
  }

  const handleChange = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }))
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Settings</h1>
        <button
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className="btn btn-primary flex items-center gap-2"
        >
          <Save className="w-5 h-5" />
          {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <div className="card max-w-3xl">
        <h2 className="text-xl font-semibold mb-6">General Settings</h2>

        <div className="space-y-6">
          <div>
            <label className="label">Portainer URL</label>
            <input
              type="url"
              value={formData.portainer_url || ''}
              onChange={(e) => handleChange('portainer_url', e.target.value)}
              className="input w-full"
              placeholder="http://localhost:9000"
            />
            <p className="text-sm text-gray-600 mt-1">
              URL to your Portainer instance (optional)
            </p>
          </div>

          <div>
            <label className="label">Next Available Port</label>
            <input
              type="number"
              value={formData.next_port || ''}
              onChange={(e) => handleChange('next_port', e.target.value)}
              className="input w-full"
              placeholder="3000"
            />
            <p className="text-sm text-gray-600 mt-1">
              Next port to be assigned to a new instance
            </p>
          </div>

          <div>
            <label className="label">Enable Metrics Collection</label>
            <select
              value={formData.enable_metrics || 'true'}
              onChange={(e) => handleChange('enable_metrics', e.target.value)}
              className="input w-full"
            >
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
            <p className="text-sm text-gray-600 mt-1">
              Collect resource usage metrics for running instances
            </p>
          </div>

          <div>
            <label className="label">Metrics Collection Interval (ms)</label>
            <input
              type="number"
              value={formData.metrics_interval || ''}
              onChange={(e) => handleChange('metrics_interval', e.target.value)}
              className="input w-full"
              placeholder="5000"
            />
            <p className="text-sm text-gray-600 mt-1">
              How often to collect metrics (in milliseconds)
            </p>
          </div>
        </div>

        <div className="border-t mt-8 pt-8">
          <h3 className="text-lg font-semibold mb-4">About</h3>
          <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Version:</span>
              <span className="font-medium">1.0.0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Backend:</span>
              <span className="font-medium">Node.js + Express</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Frontend:</span>
              <span className="font-medium">React + Vite</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Database:</span>
              <span className="font-medium">SQLite</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

