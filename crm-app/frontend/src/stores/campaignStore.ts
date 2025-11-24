import { create } from 'zustand'

interface Contact {
  id: string
  name: string
  phoneNumber: string
  segments: string[]
}

interface Template {
  id: string
  name: string
  content: string
  category: string
}

interface Variable {
  name: string
  type: 'text' | 'number' | 'date' | 'boolean'
  defaultValue?: string
}

interface Campaign {
  name: string
  targetContacts: Contact[]
  template?: Template
  customMessage?: string
  variables: Variable[]
  sendRate: number
}

interface CampaignStore {
  campaign: Campaign
  setName: (name: string) => void
  setTargetContacts: (contacts: Contact[]) => void
  setTemplate: (template: Template) => void
  setCustomMessage: (message: string) => void
  addVariable: (variable: Variable) => void
  removeVariable: (name: string) => void
  setSendRate: (rate: number) => void
}

export const useCampaignStore = create<CampaignStore>((set) => ({
  campaign: {
    name: '',
    targetContacts: [],
    variables: [],
    sendRate: 30,
  },
  setName: (name) => 
    set((state) => ({ 
      campaign: { ...state.campaign, name } 
    })),
  setTargetContacts: (contacts) =>
    set((state) => ({
      campaign: { ...state.campaign, targetContacts: contacts },
    })),
  setTemplate: (template) =>
    set((state) => ({
      campaign: { ...state.campaign, template },
    })),
  setCustomMessage: (message) =>
    set((state) => ({
      campaign: { ...state.campaign, customMessage: message },
    })),
  addVariable: (variable) =>
    set((state) => ({
      campaign: {
        ...state.campaign,
        variables: [...state.campaign.variables, variable],
      },
    })),
  removeVariable: (name) =>
    set((state) => ({
      campaign: {
        ...state.campaign,
        variables: state.campaign.variables.filter((v) => v.name !== name),
      },
    })),
  setSendRate: (rate) =>
    set((state) => ({
      campaign: { ...state.campaign, sendRate: rate },
    })),
}))