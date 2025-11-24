import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Intercept requests to add auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Contact Types
export interface Contact {
  id: string
  name: string
  phoneNumber: string
  segments: string[]
  createdAt: string
  updatedAt: string
}

export interface CreateContactDto {
  name: string
  phoneNumber: string
  segments?: string[]
}

// Campaign Types
export interface Campaign {
  id: string
  name: string
  status: 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED'
  targetContacts: string[]
  template?: string
  customMessage?: string
  variables: Record<string, string>
  sendRate: number
  createdAt: string
  updatedAt: string
}

export interface CreateCampaignDto {
  name: string
  targetContacts: string[]
  template?: string
  customMessage?: string
  variables: Record<string, string>
  sendRate: number
}

// Template Types
export interface Template {
  id: string
  name: string
  content: string
  category: string
  createdAt: string
  updatedAt: string
}

export interface CreateTemplateDto {
  name: string
  content: string
  category: string
}

// Contact API
export const contactsApi = {
  getAll: () => api.get<Contact[]>('/contacts'),
  getById: (id: string) => api.get<Contact>(`/contacts/${id}`),
  create: (data: CreateContactDto) => api.post<Contact>('/contacts', data),
  update: (id: string, data: Partial<CreateContactDto>) =>
    api.patch<Contact>(`/contacts/${id}`, data),
  delete: (id: string) => api.delete(`/contacts/${id}`),
  importCsv: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post<{ imported: number }>('/contacts/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
  },
}

// Campaign API
export const campaignsApi = {
  getAll: () => api.get<Campaign[]>('/campaigns'),
  getById: (id: string) => api.get<Campaign>(`/campaigns/${id}`),
  create: (data: CreateCampaignDto) => api.post<Campaign>('/campaigns', data),
  update: (id: string, data: Partial<CreateCampaignDto>) =>
    api.patch<Campaign>(`/campaigns/${id}`, data),
  delete: (id: string) => api.delete(`/campaigns/${id}`),
  start: (id: string) => api.post<Campaign>(`/campaigns/${id}/start`),
  pause: (id: string) => api.post<Campaign>(`/campaigns/${id}/pause`),
  resume: (id: string) => api.post<Campaign>(`/campaigns/${id}/resume`),
}

// Template API
export const templatesApi = {
  getAll: () => api.get<Template[]>('/templates'),
  getById: (id: string) => api.get<Template>(`/templates/${id}`),
  create: (data: CreateTemplateDto) => api.post<Template>('/templates', data),
  update: (id: string, data: Partial<CreateTemplateDto>) =>
    api.patch<Template>(`/templates/${id}`, data),
  delete: (id: string) => api.delete(`/templates/${id}`),
}

export default api