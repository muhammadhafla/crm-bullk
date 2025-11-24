interface Variable {
  name: string
  description: string
  type: 'text' | 'number' | 'date' | 'boolean'
  defaultValue?: string
}

interface VariableManagerProps {
  variables: Variable[]
  onAdd: (variable: Variable) => void
  onRemove: (variableName: string) => void
}

export const VariableManager = ({
  variables,
  onAdd,
  onRemove,
}: VariableManagerProps) => {
  return (
    <div className="bg-white shadow rounded-lg p-4">
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h4 className="text-sm font-medium text-gray-900">Message Variables</h4>
          <button
            type="button"
            className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-primary-700 bg-primary-100 hover:bg-primary-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            Add Variable
          </button>
        </div>

        <div className="mt-2">
          <div className="flex flex-col space-y-2">
            {variables.map((variable) => (
              <div
                key={variable.name}
                className="flex items-center justify-between p-2 bg-gray-50 rounded-md"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {'{{'}{variable.name}{'}}'}
                  </p>
                  <p className="text-xs text-gray-500">{variable.description}</p>
                </div>
                <button
                  onClick={() => onRemove(variable.name)}
                  className="ml-2 text-gray-400 hover:text-gray-500"
                >
                  <span className="sr-only">Remove variable</span>
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <p className="text-xs text-gray-500">
            Use these variables in your message by typing {'{{'} followed by the variable name and {'}}'}
          </p>
        </div>
      </div>
    </div>
  )
}