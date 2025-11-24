import React, { useEffect, useState } from 'react';
import { fetchConnectionState, ConnectionState } from '../../services/whatsappApi';
import WhatsAppConnectModal from './WhatsAppConnectModal';

const DEFAULT_INSTANCE = 'my-whatsapp-crm';

export const WhatsAppStatusCard: React.FC = () => {
  const [state, setState] = useState<ConnectionState | null>(null);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchConnectionState(DEFAULT_INSTANCE);
      setState(res);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch state');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 1000 * 30); // refresh every 30s
    return () => clearInterval(t);
  }, []);

  const isConnected = state?.state === 'open' || state?.state === 'connected' || state?.state === 'running';

  return (
    <div className="px-3 py-4">
      <div className="bg-white rounded-md shadow p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-gray-700">WhatsApp</div>
            <div className="text-xs text-gray-500">Instance: {state?.instanceName ?? DEFAULT_INSTANCE}</div>
          </div>
          <div>
            <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${isConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {loading ? '...' : (isConnected ? 'Connected' : 'Disconnected')}
            </div>
          </div>
        </div>

        <div className="mt-3">
          {error && <div className="text-xs text-red-600">{error}</div>}
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => setIsOpen(true)}
              className="flex-1 inline-flex items-center justify-center px-3 py-2 bg-primary-700 text-white rounded-md text-sm"
            >
              Connect
            </button>
            <button
              onClick={load}
              className="inline-flex items-center px-3 py-2 border rounded-md text-sm"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      <WhatsAppConnectModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </div>
  );
};

export default WhatsAppStatusCard;
