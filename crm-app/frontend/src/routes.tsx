import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { MainLayout } from '@components/layout/MainLayout'
import { PrivateRoute } from '@components/auth/PrivateRoute'

// Lazy load pages
const Dashboard = lazy(() => import('@pages/Dashboard'))
const BulkComposer = lazy(() => import('@pages/BulkComposer'))
const Contacts = lazy(() => import('@pages/Contacts'))
const Templates = lazy(() => import('@pages/Templates'))
const Settings = lazy(() => import('@pages/Settings'))
const Login = lazy(() => import('@pages/Login'))
const Register = lazy(() => import('@pages/Register'))

// Loading component
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-900"></div>
  </div>
)

export const AppRoutes = () => {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Protected routes */}
        <Route element={<PrivateRoute />}>
          <Route element={<MainLayout children={undefined} />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/bulk" element={<BulkComposer />} />
            <Route path="/contacts" element={<Contacts />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Route>

        {/* Fallback route */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  )
}