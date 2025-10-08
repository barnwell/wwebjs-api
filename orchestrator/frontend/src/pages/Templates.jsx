import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Edit2, Trash2, Star } from 'lucide-react'
import toast from 'react-hot-toast'
import { templatesAPI } from '../api/client'

export default function Templates() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const queryClient = useQueryClient()

  const { data: templates = [], isLoading, error } = useQuery({
    queryKey: ['templates'],
    queryFn: templatesAPI.getAll,
  })

  const deleteMutation = useMutation({
    mutationFn: templatesAPI.delete,
    onSuccess: () => {
      queryClient.invalidateQueries(['templates'])
      toast.success('Template deleted successfully')
    },
    onError: (error) => {
      toast.error(`Failed to delete template: ${error.message}`)
    },
  })

  const handleDelete = (id, name) => {
    if (window.confirm(`Are you sure you want to delete template "${name}"?`)) {
      deleteMutation.mutate(id)
    }
  }

  const handleEdit = (template) => {
    setEditingTemplate(template)
    setIsModalOpen(true)
  }

  const handleCreate = () => {
    setEditingTemplate(null)
    setIsModalOpen(true)
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
          Error loading templates: {error.message}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Templates</h1>
        <button
          onClick={handleCreate}
          className="btn btn-primary flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Create Template
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-gray-500 mb-4">No templates created yet</p>
          <button onClick={handleCreate} className="btn btn-primary">
            Create your first template
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {templates.map((template) => (
            <div key={template.id} className="card">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-semibold">{template.name}</h3>
                    {template.is_default && (
                      <Star className="w-5 h-5 text-yellow-500 fill-current" />
                    )}
                  </div>
                  {template.description && (
                    <p className="text-sm text-gray-600 mt-1">{template.description}</p>
                  )}
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Configuration:</p>
                <div className="space-y-1 text-sm">
                  {Object.entries(template.config).slice(0, 5).map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                      <span className="text-gray-600">{key}:</span>
                      <span className="font-mono text-gray-900">
                        {key.includes('KEY') || key.includes('SECRET') ? '••••••' : value}
                      </span>
                    </div>
                  ))}
                  {Object.keys(template.config).length > 5 && (
                    <p className="text-gray-500 italic">
                      + {Object.keys(template.config).length - 5} more...
                    </p>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleEdit(template)}
                  className="btn btn-secondary flex items-center gap-2 flex-1"
                >
                  <Edit2 className="w-4 h-4" />
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(template.id, template.name)}
                  disabled={deleteMutation.isPending}
                  className="btn btn-danger flex items-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {isModalOpen && (
        <TemplateModal
          template={editingTemplate}
          onClose={() => {
            setIsModalOpen(false)
            setEditingTemplate(null)
          }}
          onSuccess={() => {
            setIsModalOpen(false)
            setEditingTemplate(null)
            queryClient.invalidateQueries(['templates'])
          }}
        />
      )}
    </div>
  )
}

function TemplateModal({ template, onClose, onSuccess }) {
  const [formData, setFormData] = useState({
    name: template?.name || '',
    description: template?.description || '',
    is_default: template?.is_default || false,
    config: template?.config || {
      API_KEY: '',
      BASE_WEBHOOK_URL: '',
      ENABLE_WEBHOOK: 'true',
      LOG_LEVEL: 'info',
    },
  })

  const mutation = useMutation({
    mutationFn: (data) => {
      if (template) {
        return templatesAPI.update(template.id, data)
      }
      return templatesAPI.create(data)
    },
    onSuccess: () => {
      toast.success(`Template ${template ? 'updated' : 'created'} successfully`)
      onSuccess()
    },
    onError: (error) => {
      toast.error(`Failed to ${template ? 'update' : 'create'} template: ${error.message}`)
    },
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    mutation.mutate(formData)
  }

  const handleConfigChange = (key, value) => {
    setFormData(prev => ({
      ...prev,
      config: { ...prev.config, [key]: value }
    }))
  }

  const handleAddConfigItem = () => {
    const key = prompt('Enter configuration key:')
    if (key && !formData.config[key]) {
      const value = prompt(`Enter value for ${key}:`)
      if (value !== null) {
        handleConfigChange(key, value)
      }
    }
  }

  const handleRemoveConfigItem = (key) => {
    setFormData(prev => {
      const newConfig = { ...prev.config }
      delete newConfig[key]
      return { ...prev, config: newConfig }
    })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4">
          <h2 className="text-xl font-semibold">
            {template ? 'Edit Template' : 'Create Template'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <label className="label">Template Name *</label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="input w-full"
            />
          </div>

          <div>
            <label className="label">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="input w-full"
              rows={3}
            />
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="is_default"
              checked={formData.is_default}
              onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
              className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
            />
            <label htmlFor="is_default" className="ml-2 text-sm text-gray-700">
              Set as default template
            </label>
          </div>

          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium">Configuration</h3>
              <button
                type="button"
                onClick={handleAddConfigItem}
                className="text-sm text-primary-600 hover:text-primary-700"
              >
                + Add Item
              </button>
            </div>

            <div className="space-y-3">
              {Object.entries(formData.config).map(([key, value]) => (
                <div key={key} className="flex gap-2">
                  <input
                    type="text"
                    value={key}
                    disabled
                    className="input flex-1 bg-gray-50"
                  />
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => handleConfigChange(key, e.target.value)}
                    className="input flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveConfigItem(key)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn btn-secondary flex-1">
              Cancel
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="btn btn-primary flex-1"
            >
              {mutation.isPending ? 'Saving...' : template ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

