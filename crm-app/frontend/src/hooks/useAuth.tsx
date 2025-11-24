import { createContext, useContext, ReactNode } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import api from '@services/api'

interface User {
  id: string
  email: string
  name: string
  role: 'admin' | 'user'
}

interface AuthContextType {
  user: User | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  register: (email: string, password: string, name: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { data: user, isLoading, refetch } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      try {
        const response = await api.get<User>('/auth/me')
        return response.data
      } catch (error) {
        return null
      }
    },
  })

  const loginMutation = useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      const response = await api.post<{ token: string }>('/auth/login', credentials)
      localStorage.setItem('token', response.data.token)
      await refetch()
    },
  })

  const login = async (email: string, password: string) => {
    return loginMutation.mutateAsync({ email, password })
  }

  const registerMutation = useMutation({
    mutationFn: async (data: { email: string; password: string; name: string }) => {
      const response = await api.post<{ token: string }>('/auth/register', data)
      localStorage.setItem('token', response.data.token)
      await refetch()
    },
  })

  const register = async (email: string, password: string, name: string) => {
    return registerMutation.mutateAsync({ email, password, name })
  }

  const logout = async () => {
    localStorage.removeItem('token')
    await refetch()
  }

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        login,
        logout,
        register,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}