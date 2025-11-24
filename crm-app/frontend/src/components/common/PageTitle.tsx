interface PageTitleProps {
  title: string
  description?: string
  actions?: React.ReactNode
}

export function PageTitle({ title, description, actions }: PageTitleProps) {
  return (
    <div className="md:flex md:items-center md:justify-between">
      <div className="flex-1 min-w-0">
        <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
          {title}
        </h2>
        {description && (
          <p className="mt-1 text-sm text-gray-500">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="mt-4 flex md:mt-0 md:ml-4">
          {actions}
        </div>
      )}
    </div>
  )
}