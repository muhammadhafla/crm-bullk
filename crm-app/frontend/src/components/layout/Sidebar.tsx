import { Link, useLocation } from 'react-router-dom'
import { MessageSquare, Users, FileText, BarChart2, Settings } from 'lucide-react'
import WhatsAppStatusCard from '../whatsapp/WhatsAppStatusCard'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: BarChart2 },
  { name: 'Bulk Composer', href: '/bulk', icon: MessageSquare },
  { name: 'Contacts', href: '/contacts', icon: Users },
  { name: 'Templates', href: '/templates', icon: FileText },
  { name: 'Settings', href: '/settings', icon: Settings },
]

export const Sidebar = () => {
  const location = useLocation()

  return (
    <div className="hidden lg:flex lg:flex-shrink-0">
      <div className="flex flex-col w-64">
        <div className="flex flex-col flex-grow bg-primary-700 pt-5 pb-4 overflow-y-auto">
          <div className="flex items-center flex-shrink-0 px-4">
            <img
              className="h-8 w-auto"
              src="/logo.svg"
              alt="WhatsApp CRM"
            />
          </div>
          <nav className="mt-5 flex-1 px-2 space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname.startsWith(item.href)
              
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`${
                    isActive
                      ? 'bg-primary-800 text-white'
                      : 'text-primary-100 hover:bg-primary-600'
                  } group flex items-center px-2 py-2 text-sm font-medium rounded-md`}
                >
                  <Icon
                    className={`${
                      isActive ? 'text-primary-100' : 'text-primary-300'
                    } mr-3 flex-shrink-0 h-6 w-6`}
                    aria-hidden="true"
                  />
                  {item.name}
                </Link>
              )
            })}
          </nav>
          <div className="px-3 mt-4">
            <WhatsAppStatusCard />
          </div>
        </div>
      </div>
    </div>
  )
}