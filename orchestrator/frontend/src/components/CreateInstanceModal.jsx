import { useState, useEffect } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import toast from 'react-hot-toast'
import { instancesAPI } from '../api/client'

export default function CreateInstanceModal({ templates, onClose, onSuccess }) {
  // Fetch default configuration from backend
  const { data: defaultConfig, isLoading: isLoadingConfig } = useQuery({
    queryKey: ['default-config'],
    queryFn: instancesAPI.getDefaultConfig,
    select: (response) => response.data,
  })

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    templateId: templates.find(t => t.is_default)?.id || '',
    config: {},
  })

  // Update form data when default config is loaded
  useEffect(() => {
    if (defaultConfig) {
      setFormData(prev => ({
        ...prev,
        config: { ...defaultConfig }
      }))
    }
  }, [defaultConfig])

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
    if (!defaultConfig) {
      toast.error('Default configuration not loaded yet. Please wait.')
      return
    }
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

        {isLoadingConfig ? (
          <div className="p-6 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading default configuration...</p>
            </div>
          </div>
        ) : (
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
            
            <div className="space-y-6">
              {/* Core Configuration */}
              <div>
                <h4 className="font-medium text-sm text-gray-700 mb-3">Core Configuration</h4>
                <div className="space-y-3">
                  <div>
                    <label className="label">API Key</label>
                    <input
                      type="text"
                      value={formData.config.API_KEY}
                      onChange={(e) => handleConfigChange('API_KEY', e.target.value)}
                      className="input w-full"
                      placeholder="SET_YOUR_API_KEY_HERE"
                    />
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

              {/* Webhook Configuration */}
              <div>
                <h4 className="font-medium text-sm text-gray-700 mb-3">Webhook Configuration</h4>
                <div className="space-y-3">
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
                    <label className="label">Webhook URL</label>
                    <input
                      type="url"
                      value={formData.config.BASE_WEBHOOK_URL}
                      onChange={(e) => handleConfigChange('BASE_WEBHOOK_URL', e.target.value)}
                      className="input w-full"
                      placeholder="https://your-webhook-endpoint.com/webhook (optional - can be set later)"
                    />
                    {formData.config.ENABLE_WEBHOOK === 'true' && (!formData.config.BASE_WEBHOOK_URL || formData.config.BASE_WEBHOOK_URL.trim() === '') && (
                      <p className="text-sm text-amber-600 mt-1">
                        ⚠️ Webhook is enabled but no URL provided. You can set a webhook URL later when starting a session.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Callback Configuration */}
              <div>
                <h4 className="font-medium text-sm text-gray-700 mb-3">Callback Configuration</h4>
                <div className="space-y-3">
                  <div>
                    <label className="label">Disabled Callbacks</label>
                    <input
                      type="text"
                      value={formData.config.DISABLED_CALLBACKS}
                      onChange={(e) => handleConfigChange('DISABLED_CALLBACKS', e.target.value)}
                      className="input w-full"
                      placeholder="message_ack|message_reaction|unread_count (separated by |)"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Callbacks to disable, separated by | (e.g., message_ack|message_reaction|unread_count)
                    </p>
                  </div>

                  <div>
                    <label className="label">Enable Local Callback Example</label>
                    <select
                      value={formData.config.ENABLE_LOCAL_CALLBACK_EXAMPLE}
                      onChange={(e) => handleConfigChange('ENABLE_LOCAL_CALLBACK_EXAMPLE', e.target.value)}
                      className="input w-full"
                    >
                      <option value="false">No</option>
                      <option value="true">Yes</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Browser Configuration */}
              <div>
                <h4 className="font-medium text-sm text-gray-700 mb-3">Browser Configuration</h4>
                <div className="space-y-3">
                  <div>
                    <label className="label">Headless Mode</label>
                    <select
                      value={formData.config.HEADLESS}
                      onChange={(e) => handleConfigChange('HEADLESS', e.target.value)}
                      className="input w-full"
                    >
                      <option value="true">Yes (Headless)</option>
                      <option value="false">No (Show Browser)</option>
                    </select>
                  </div>

                  <div>
                    <label className="label">Chrome Binary Path</label>
                    <input
                      type="text"
                      value={formData.config.CHROME_BIN}
                      onChange={(e) => handleConfigChange('CHROME_BIN', e.target.value)}
                      className="input w-full"
                      placeholder="Leave empty for default"
                    />
                  </div>

                  <div>
                    <label className="label">Web Version</label>
                    <input
                      type="text"
                      value={formData.config.WEB_VERSION}
                      onChange={(e) => handleConfigChange('WEB_VERSION', e.target.value)}
                      className="input w-full"
                      placeholder="Leave empty for latest"
                    />
                  </div>

                  <div>
                    <label className="label">Web Version Cache Type</label>
                    <select
                      value={formData.config.WEB_VERSION_CACHE_TYPE}
                      onChange={(e) => handleConfigChange('WEB_VERSION_CACHE_TYPE', e.target.value)}
                      className="input w-full"
                    >
                      <option value="none">None</option>
                      <option value="local">Local</option>
                      <option value="remote">Remote</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Session Configuration */}
              <div>
                <h4 className="font-medium text-sm text-gray-700 mb-3">Session Configuration</h4>
                <div className="space-y-3">
                  <div>
                    <label className="label">Sessions Path</label>
                    <input
                      type="text"
                      value={formData.config.SESSIONS_PATH}
                      onChange={(e) => handleConfigChange('SESSIONS_PATH', e.target.value)}
                      className="input w-full"
                      placeholder="./sessions"
                    />
                  </div>

                  <div>
                    <label className="label">Auto Start Sessions</label>
                    <select
                      value={formData.config.AUTO_START_SESSIONS}
                      onChange={(e) => handleConfigChange('AUTO_START_SESSIONS', e.target.value)}
                      className="input w-full"
                    >
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                  </div>

                  <div>
                    <label className="label">Recover Sessions</label>
                    <select
                      value={formData.config.RECOVER_SESSIONS}
                      onChange={(e) => handleConfigChange('RECOVER_SESSIONS', e.target.value)}
                      className="input w-full"
                    >
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Advanced Configuration */}
              <div>
                <h4 className="font-medium text-sm text-gray-700 mb-3">Advanced Configuration</h4>
                <div className="space-y-3">
                  <div>
                    <label className="label">Enable WebSocket</label>
                    <select
                      value={formData.config.ENABLE_WEBSOCKET}
                      onChange={(e) => handleConfigChange('ENABLE_WEBSOCKET', e.target.value)}
                      className="input w-full"
                    >
                      <option value="false">No</option>
                      <option value="true">Yes</option>
                    </select>
                  </div>

                  <div>
                    <label className="label">Rate Limit Max</label>
                    <input
                      type="number"
                      value={formData.config.RATE_LIMIT_MAX}
                      onChange={(e) => handleConfigChange('RATE_LIMIT_MAX', e.target.value)}
                      className="input w-full"
                      placeholder="1000"
                    />
                  </div>

                  <div>
                    <label className="label">Rate Limit Window (ms)</label>
                    <input
                      type="number"
                      value={formData.config.RATE_LIMIT_WINDOW_MS}
                      onChange={(e) => handleConfigChange('RATE_LIMIT_WINDOW_MS', e.target.value)}
                      className="input w-full"
                      placeholder="1000"
                    />
                  </div>

                  <div>
                    <label className="label">Max Attachment Size (bytes)</label>
                    <input
                      type="number"
                      value={formData.config.MAX_ATTACHMENT_SIZE}
                      onChange={(e) => handleConfigChange('MAX_ATTACHMENT_SIZE', e.target.value)}
                      className="input w-full"
                      placeholder="10000000"
                    />
                  </div>

                  <div>
                    <label className="label">Set Messages as Seen</label>
                    <select
                      value={formData.config.SET_MESSAGES_AS_SEEN}
                      onChange={(e) => handleConfigChange('SET_MESSAGES_AS_SEEN', e.target.value)}
                      className="input w-full"
                    >
                      <option value="false">No</option>
                      <option value="true">Yes</option>
                    </select>
                  </div>

                  <div>
                    <label className="label">Enable Swagger Endpoint</label>
                    <select
                      value={formData.config.ENABLE_SWAGGER_ENDPOINT}
                      onChange={(e) => handleConfigChange('ENABLE_SWAGGER_ENDPOINT', e.target.value)}
                      className="input w-full"
                    >
                      <option value="false">No</option>
                      <option value="true">Yes</option>
                    </select>
                  </div>
                </div>
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
              disabled={createMutation.isPending || isLoadingConfig}
              className="btn btn-primary flex-1"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Instance'}
            </button>
          </div>
        </form>
        )}
      </div>
    </div>
  )
}

