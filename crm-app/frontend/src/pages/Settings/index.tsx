import React, { useState } from 'react';
import WhatsAppConnectModal from '../../components/whatsapp/WhatsAppConnectModal';

export default function Settings() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div>
      <div className="md:flex md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-bold leading-7 text-gray-900 sm:text-3xl sm:truncate">
            Settings
          </h2>
        </div>
      </div>

      <div className="mt-8">
        <div className="bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg font-medium leading-6 text-gray-900">WhatsApp Settings</h3>
            <div className="mt-2 max-w-xl text-sm text-gray-500">
              <p>Configure your WhatsApp instance settings and preferences.</p>
            </div>
            <div className="mt-5">
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
              >
                Connect WhatsApp
              </button>
            </div>
          </div>
        </div>

        <div className="mt-8 bg-white shadow sm:rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg font-medium leading-6 text-gray-900">Message Settings</h3>
            <div className="mt-2 max-w-xl text-sm text-gray-500">
              <p>Configure default message settings and delivery preferences.</p>
            </div>
            <form className="mt-5">
              <div className="space-y-4">
                <div>
                  <label htmlFor="delay" className="block text-sm font-medium text-gray-700">
                    Default Delay Between Messages (seconds)
                  </label>
                  <input
                    type="number"
                    name="delay"
                    id="delay"
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                    defaultValue={1}
                  />
                </div>
                <div>
                  <label htmlFor="retries" className="block text-sm font-medium text-gray-700">
                    Maximum Retry Attempts
                  </label>
                  <input
                    type="number"
                    name="retries"
                    id="retries"
                    className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                    defaultValue={3}
                  />
                </div>
              </div>
              <div className="mt-4">
                <button
                  type="submit"
                  className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                >
                  Save Settings
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
      <WhatsAppConnectModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </div>
  )
}