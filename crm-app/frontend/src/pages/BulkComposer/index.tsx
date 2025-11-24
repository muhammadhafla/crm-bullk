import React, { useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'

const schema = z.object({
  name: z.string().min(3, 'Campaign name is required'),
  rate: z.number().min(1).max(500).default(30),
  message: z.string().min(1, 'Message cannot be empty'),
  segments: z.array(z.string()).optional(),
})

type FormValues = z.infer<typeof schema>

const MOCK_CONTACTS = [
  { id: '1', name: 'Sarah Johnson', phone: '+1234567890', company: 'Tech Corp' },
  { id: '2', name: 'Michael Chen', phone: '+1234567891', company: 'Startup Inc' },
  { id: '3', name: 'Emily Davis', phone: '+1234567892', company: 'Enterprise Ltd' },
  { id: '4', name: 'David Martinez', phone: '+1234567893', company: 'Local Business' },
  { id: '5', name: 'Lisa Anderson', phone: '+1234567894', company: 'Marketing Agency' },
]

const AVAILABLE_SEGMENTS = ['Premium', 'Active', 'Inactive', 'Enterprise', 'SMB', 'Startup', 'Agency', 'VIP', 'New']

const BulkComposer: React.FC = () => {
  const { register, watch, handleSubmit, setValue, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', rate: 30, message: '', segments: [] },
  })

  const watchAll = watch()

  const previewMessages = useMemo(() => {
    const tmpl = watchAll.message || ''
    if (!tmpl) return []
    return MOCK_CONTACTS.map((c) => {
      // simple variable replacement: {{name}}, {{phone}}, {{company}}
      const rendered = tmpl
        .replace(/{{\s*name\s*}}/gi, c.name)
        .replace(/{{\s*phone\s*}}/gi, c.phone)
        .replace(/{{\s*company\s*}}/gi, c.company)
      return { id: c.id, name: c.name, phone: c.phone, message: rendered }
    })
  }, [watchAll.message])

  const onSubmit = (data: FormValues) => {
    // For now, just log — next step: wire to API
    console.log('Campaign submit', data)
    alert('Campaign saved (mock). Check console for payload.')
  }

  const toggleSegment = (seg: string) => {
    const current: string[] = (watchAll.segments as string[]) || []
    if (current.includes(seg)) {
      setValue('segments', current.filter(s => s !== seg))
    } else {
      setValue('segments', [...current, seg])
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="md:flex md:items-center md:justify-between">
        <div className="flex-1 min-w-0">
          <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">Personalized Bulk Messaging Center</h2>
          <p className="mt-1 text-sm text-gray-500">Create and launch targeted campaigns with smart personalization</p>
        </div>
        <div className="mt-4 flex md:mt-0 md:ml-4">
          <button type="button" className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50" onClick={() => alert('Preview opened (mock)')}>Preview</button>
          <button type="submit" className="ml-3 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700">Launch Campaign</button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-3">
        {/* Target Contacts / segments */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900">Target Contacts</h3>
          <div className="bg-white shadow rounded-lg p-4">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Number of Contacts</label>
                <input type="number" readOnly value={MOCK_CONTACTS.length} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm p-2" />
              </div>
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_SEGMENTS.map((seg) => {
                  const selected = (watchAll.segments || []).includes(seg)
                  return (
                    <button key={seg} type="button" onClick={() => toggleSegment(seg)} className={`inline-flex items-center px-3 py-0.5 rounded-full text-sm font-medium ${selected ? 'bg-primary-100 text-primary-800' : 'bg-gray-100 text-gray-800'}`}>
                      {seg}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Est. Duration */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900">Est. Duration</h3>
          <div className="bg-white shadow rounded-lg p-4">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Total Time</label>
                <input type="text" readOnly value={`${Math.ceil((MOCK_CONTACTS.length / (watchAll.rate || 30)))}m`} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm p-2" />
              </div>
            </div>
          </div>
        </div>

        {/* Send Rate */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium text-gray-900">Send Rate</h3>
          <div className="bg-white shadow rounded-lg p-4">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Messages per Minute</label>
                <input type="range" min={1} max={200} {...register('rate', { valueAsNumber: true })} className="w-full" />
                <div className="text-sm text-gray-600 mt-1">{watchAll.rate || 30} msg/min</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Campaign Configuration */}
      <div className="mt-6">
        <h3 className="text-lg font-medium text-gray-900">Campaign Configuration</h3>
        <p className="mt-1 text-sm text-gray-500">Set up your campaign details and targeting</p>
        <div className="mt-4 bg-white shadow rounded-lg p-6">
          <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
            <div className="sm:col-span-4">
              <label htmlFor="campaign-name" className="block text-sm font-medium text-gray-700">Campaign Name</label>
              <div className="mt-1">
                <input {...register('name')} id="campaign-name" className="shadow-sm focus:ring-primary-500 focus:border-primary-500 block w-full sm:text-sm border-gray-300 rounded-md p-2" placeholder="e.g., Q4 Re-engagement Campaign" />
                {errors.name && <div className="text-xs text-red-600 mt-1">{errors.name.message}</div>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Message Content */}
      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <h3 className="text-lg font-medium text-gray-900">Message Content</h3>
          <p className="mt-1 text-sm text-gray-500">Compose your message with personalization variables</p>
          <div className="mt-4 bg-white shadow rounded-lg p-6">
            <div className="space-y-4">
              <div className="flex space-x-4">
                <button type="button" className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-primary-700 bg-primary-100">Use Template</button>
                <button type="button" className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white">Custom Message</button>
              </div>
              <div>
                <label htmlFor="message" className="sr-only">Message</label>
                <textarea {...register('message')} id="message" rows={6} className="block w-full border border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm p-3" placeholder="Type your message here... Use {{name}} or {{company}}" />
                {errors.message && <div className="text-xs text-red-600 mt-1">{errors.message.message}</div>}
              </div>
            </div>
          </div>
        </div>

        {/* Live Preview */}
        <div>
          <h3 className="text-lg font-medium text-gray-900">Live Preview</h3>
          <p className="mt-1 text-sm text-gray-500">See how messages will look</p>
          <div className="mt-4 bg-white shadow rounded-lg divide-y divide-gray-200">
            {previewMessages.length === 0 ? (
              <div className="p-4 text-sm text-gray-500">Message preview will appear here...</div>
            ) : (
              previewMessages.map((p) => (
                <div key={p.id} className="p-3">
                  <div className="text-sm font-medium text-gray-800">{p.name} <span className="text-xs text-gray-500">{p.phone}</span></div>
                  <div className="mt-2 p-3 bg-green-50 rounded text-sm text-gray-700">{p.message}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </form>
  )
}

export default BulkComposer