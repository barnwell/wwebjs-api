import { useState, useEffect } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { X, CheckCircle, XCircle, Loader } from 'lucide-react'
import toast from 'react-hot-toast'
import { instancesAPI } from '../api/client'

export default function CreateInstanceModal({ templates, onClose, onSuccess }) {
  // Fetch default configuration from backend
  const { data: defaultConfig, isLoading: isLoadingConfig } = useQuery({
    queryKey: ['default-config'],
    queryFn: instancesAPI.getDefaultConfig,
    select: (response) => response.data,
  })

  // Fetch port range configuration
  const { data: portRange } = useQuery({
    queryKey: ['port-range'],
    queryFn: instancesAPI.getPortRange,
  })

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    templateId: templates.find(t => t.is_default)?.id || '',
    config: {},
    port: '', // Add port field
    useCustomPort: false, // Add custom port toggle
  })

  const [portStatus, setPortStatus] = useState({
    checking: false,
    available: null,
    message: ''
  })

  const [nameError, setNameError] = useState('')

  // Validate instance name
  const validateInstanceName = (name) => {
    if (!name.trim()) {
      return 'Instance name is required'
    }
    
    // Docker container name validation: only [a-zA-Z0-9][a-zA-Z0-9_.-] are allowed
    const validNameRegex = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/
    if (!validNameRegex.test(name)) {
      return 'Instance name can only contain letters, numbers, underscores, dots, and hyphens. It must start with a letter or number.'
    }
    
    if (name.length > 50) {
      return 'Instance name must be 50 characters or less'
    }
    
    return ''
  }

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
    if (isLoadingConfig) {
      toast.error('Default configuration not loaded yet. Please wait.')
      return
    }
    
    // Validate instance name
    const nameValidationError = validateInstanceName(formData.name)
    if (nameValidationError) {
      setNameError(nameValidationError)
      toast.error(nameValidationError)
      return
    }
    setNameError('')
    
    // Validate custom port if selected
    if (formData.useCustomPort && formData.port) {
      if (portStatus.available === false) {
        toast.error('Selected port is not available. Please choose a different port.')
        return
      }
      if (portStatus.checking) {
        toast.error('Please wait for port availability check to complete.')
        return
      }
    }
    
    // Prepare submission data
    const submissionData = {
      name: formData.name,
      description: formData.description,
      templateId: formData.templateId || undefined,
      config: formData.config,
      ...(formData.useCustomPort && formData.port && { port: parseInt(formData.port) })
    }
    
    createMutation.mutate(submissionData)
  }

  const handleConfigChange = (key, value) => {
    setFormData(prev => ({
      ...prev,
      config: { ...prev.config, [key]: value }
    }))
  }

  // Check port availability
  const checkPortAvailability = async (port) => {
    if (!port) {
      setPortStatus({
        checking: false,
        available: false,
        message: 'Port is required'
      })
      return
    }

    setPortStatus({ checking: true, available: null, message: '' })
    
    try {
      const response = await instancesAPI.checkPortAvailability(port)
      setPortStatus({
        checking: false,
        available: response.available,
        message: response.message || (response.available ? 'Port is available' : 'Port is already in use')
      })
    } catch (error) {
      // Extract error message from backend response
      const errorMessage = error.response?.data?.error || error.message || 'Failed to check port availability'
      setPortStatus({
        checking: false,
        available: false,
        message: errorMessage
      })
    }
  }

  // Debounced port checking
  useEffect(() => {
    if (formData.useCustomPort && formData.port) {
      const timeoutId = setTimeout(() => {
        checkPortAvailability(parseInt(formData.port))
      }, 500)
      
      return () => clearTimeout(timeoutId)
    }
  }, [formData.port, formData.useCustomPort])

  const handleTemplateChange = (templateId) => {
    setFormData(prev => ({
      ...prev,
      templateId
    }))

    // If a template is selected, merge its config with the current config
    if (templateId) {
      const selectedTemplate = templates.find(t => t.id === templateId)
      if (selectedTemplate && selectedTemplate.config) {
        setFormData(prev => ({
          ...prev,
          config: { ...prev.config, ...selectedTemplate.config }
        }))
      }
    } else {
      // If no template selected, reset to default config
      if (defaultConfig) {
        setFormData(prev => ({
          ...prev,
          config: { ...defaultConfig }
        }))
      }
    }
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
              onChange={(e) => {
                const newName = e.target.value
                setFormData({ ...formData, name: newName })
                // Clear error when user starts typing
                if (nameError) {
                  setNameError('')
                }
              }}
              onBlur={() => {
                // Validate on blur
                const error = validateInstanceName(formData.name)
                setNameError(error)
              }}
              className={`input w-full ${nameError ? 'border-red-500 focus:border-red-500' : ''}`}
              placeholder="my-whatsapp-instance"
            />
            {nameError && (
              <p className="text-sm text-red-600 mt-1">{nameError}</p>
            )}
            {!nameError && formData.name && (
              <p className="text-sm text-green-600 mt-1">✓ Valid instance name</p>
            )}
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

          {/* Port Selection */}
          <div>
            <label className="label">Port Assignment</label>
            <div className="space-y-3">
              <div className="flex items-center space-x-3">
                <input
                  type="radio"
                  id="auto-port"
                  name="port-mode"
                  checked={!formData.useCustomPort}
                  onChange={() => setFormData({ ...formData, useCustomPort: false, port: '' })}
                  className="text-blue-600"
                />
                <label htmlFor="auto-port" className="text-sm font-medium">
                  Auto-assign port (recommended)
                </label>
              </div>
              
              <div className="flex items-center space-x-3">
                <input
                  type="radio"
                  id="custom-port"
                  name="port-mode"
                  checked={formData.useCustomPort}
                  onChange={() => setFormData({ ...formData, useCustomPort: true })}
                  className="text-blue-600"
                />
                <label htmlFor="custom-port" className="text-sm font-medium">
                  Use specific port
                </label>
              </div>
              
              {formData.useCustomPort && (
                <div className="ml-6 space-y-2">
                  <input
                    type="number"
                    value={formData.port}
                    onChange={(e) => setFormData({ ...formData, port: e.target.value })}
                    className="input w-full"
                    placeholder={portRange?.minPort?.toString() || "21000"}
                    min={portRange?.minPort || 21000}
                    max={portRange?.maxPort || 22000}
                  />
                  {portRange && (
                    <p className="text-xs text-gray-500 mt-1">
                      Allowed range: {portRange.minPort} - {portRange.maxPort}
                    </p>
                  )}
                  
                  {/* Port Status Indicator */}
                  {formData.port && (
                    <div className="flex items-center space-x-2 text-sm">
                      {portStatus.checking && (
                        <>
                          <Loader className="w-4 h-4 animate-spin text-blue-500" />
                          <span className="text-blue-600">Checking availability...</span>
                        </>
                      )}
                      {!portStatus.checking && portStatus.available === true && (
                        <>
                          <CheckCircle className="w-4 h-4 text-green-500" />
                          <span className="text-green-600">{portStatus.message}</span>
                        </>
                      )}
                      {!portStatus.checking && portStatus.available === false && (
                        <>
                          <XCircle className="w-4 h-4 text-red-500" />
                          <span className="text-red-600">{portStatus.message}</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="label">Template</label>
            <select
              value={formData.templateId}
              onChange={(e) => handleTemplateChange(e.target.value)}
              className="input w-full"
            >
              <option value="">No template</option>
              {templates.map(template => (
                <option key={template.id} value={template.id}>
                  {template.name} {template.is_default && '(Default)'}
                </option>
              ))}
            </select>
            {formData.templateId && (
              <p className="text-sm text-blue-600 mt-1">
                ✓ Template selected - form fields updated with template values
              </p>
            )}
          </div>

          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium">Configuration</h3>
              {defaultConfig && (
                <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded">
                  ✓ Default config loaded
                </span>
              )}
            </div>
            
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

