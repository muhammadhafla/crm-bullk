interface TemplateSelectProps {
  onSelect: (templateId: string) => void
}

export const TemplateSelect = ({ onSelect }: TemplateSelectProps) => {
  const templates = [
    { id: '1', name: 'Welcome Message', category: 'Onboarding' },
    { id: '2', name: 'Follow-up', category: 'Sales' },
    { id: '3', name: 'Payment Reminder', category: 'Billing' },
    { id: '4', name: 'Feedback Request', category: 'Customer Service' },
  ]

  return (
    <div className="bg-white shadow rounded-lg p-4">
      <div className="space-y-4">
        <div>
          <div className="flex justify-between">
            <h4 className="text-sm font-medium text-gray-900">Templates</h4>
            <button
              type="button"
              className="text-sm font-medium text-primary-600 hover:text-primary-500"
            >
              Create New
            </button>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-4">
            {templates.map((template) => (
              <button
                key={template.id}
                onClick={() => onSelect(template.id)}
                className="relative flex items-center space-x-3 rounded-lg border border-gray-300 bg-white px-6 py-5 shadow-sm hover:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <div className="min-w-0 flex-1">
                  <span className="absolute inset-0" aria-hidden="true" />
                  <p className="text-sm font-medium text-gray-900">{template.name}</p>
                  <p className="truncate text-sm text-gray-500">{template.category}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}