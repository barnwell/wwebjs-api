import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { X } from 'lucide-react'
import toast from 'react-hot-toast'
import { instancesAPI } from '../api/client'

export default function CreateInstanceModal({ templates, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    templateId: templates.find(t => t.is_default)?.id || '',
    config: {
      API_KEY: '',
      BASE_WEBHOOK_URL: '',
      ENABLE_WEBHOOK: 'true',
      LOG_LEVEL: 'info',
    },
  })

  const createMutation = useMutation({
    mutationFn: instancesAPI.create,
    onSuccess: () => {
      toast.success('Instance created successfully')
      onSuccess()
    },
    onError: (error) => {
      toast.error(`Failed to create instance: ${error.message}`)
    },
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    createMutation.mutate(formData)
  }

  const handleConfigChange = (key, value) => {
    setFormData(prev => ({
      ...prev,
      config: { ...prev.config, [key]: value }
    }))
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Create New Instance</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <label className="label">Instance Name *</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="input w-full"
              placeholder="my-whatsapp-instance"
            />
          </div>

          <div>
            <label className="label">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="input w-full"
              rows={3}
              placeholder="Optional description..."
            />
          </div>

          <div>
            <label className="label">Template</label>
            <select
              value={formData.templateId}
              onChange={(e) => setFormData({ ...formData, templateId: e.target.value })}
              className="input w-full"
            >
              <option value="">No template</option>
              {templates.map(template => (
                <option key={template.id} value={template.id}>
                  {template.name} {template.is_default && '(Default)'}
                </option>
              ))}
            </select>
          </div>

          <div className="border-t pt-4">
            <h3 className="font-medium mb-4">Configuration</h3>
            
            <div className="space-y-4">
              <div>
                <label className="label">API Key</label>
                <input
                  type="text"
                  value={formData.config.API_KEY}
                  onChange={(e) => handleConfigChange('API_KEY', e.target.value)}
                  className="input w-full"
                  placeholder="Leave empty to auto-generate"
                />
              </div>

              <div>
                <label className="label">Webhook URL</label>
                <input
                  type="url"
                  value={formData.config.BASE_WEBHOOK_URL}
                  onChange={(e) => handleConfigChange('BASE_WEBHOOK_URL', e.target.value)}
                  className="input w-full"
                  placeholder="https://your-webhook.com/webhook"
                />
              </div>

              <div>
                <label className="label">Enable Webhook</label>
                <select
                  value={formData.config.ENABLE_WEBHOOK}
                  onChange={(e) => handleConfigChange('ENABLE_WEBHOOK', e.target.value)}
                  className="input w-full"
                >
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </div>

              <div>
                <label className="label">Log Level</label>
                <select
                  value={formData.config.LOG_LEVEL}
                  onChange={(e) => handleConfigChange('LOG_LEVEL', e.target.value)}
                  className="input w-full"
                >
                  <option value="error">Error</option>
                  <option value="warn">Warn</option>
                  <option value="info">Info</option>
                  <option value="debug">Debug</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="btn btn-primary flex-1"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Instance'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

