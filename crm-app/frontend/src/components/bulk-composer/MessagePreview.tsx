interface MessagePreviewProps {
  contactName: string
  phoneNumber: string
  messagePreview: string
}

export const MessagePreview = ({
  contactName,
  phoneNumber,
  messagePreview,
}: MessagePreviewProps) => {
  return (
    <div className="p-4">
      <div className="flex items-center space-x-3">
        <div className="flex-shrink-0">
          <div className="h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center">
            <span className="text-primary-700 font-medium">
              {contactName[0].toUpperCase()}
            </span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900">
            {contactName}
          </p>
          <p className="text-sm text-gray-500">
            {phoneNumber}
          </p>
        </div>
      </div>
      <div className="mt-4 bg-green-50 border border-green-100 rounded-lg p-4">
        <p className="text-sm text-gray-900">{messagePreview}</p>
      </div>
    </div>
  )
}