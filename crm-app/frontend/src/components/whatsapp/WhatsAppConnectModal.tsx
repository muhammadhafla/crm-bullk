import React, { useState, useEffect } from 'react';
import { generateQr } from '../../services/whatsappApi';

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

export const WhatsAppConnectModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [instanceName, setInstanceName] = useState('my-whatsapp-crm');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [rawCode, setRawCode] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    // clear state when modal opens
    setError(null);
    setQrDataUrl(null);
    setExpiresAt(null);
    setPairingCode(null);
    setRawCode(null);
  }, [isOpen]);

  if (!isOpen) return null;

  const onGenerate = async () => {
    setError(null);
    if (!instanceName || instanceName.trim().length === 0) {
      setError('Instance name is required');
      return;
    }
    setLoading(true);
    try {
      const res = await generateQr(instanceName.trim());
      setQrDataUrl(res.qrDataUrl ?? null);
      setPairingCode(res.pairingCode ?? null);
      setRawCode(res.rawCode ?? null);
      setExpiresAt(res.expiresAt);
    } catch (err: any) {
      setError(err?.message || 'Failed to generate QR');
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = () => {
    // regenerate (calls same flow)
    onGenerate();
  };

  const expired = expiresAt ? Date.now() > expiresAt : false;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-[720px] max-w-full bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-semibold">Connect WhatsApp</h3>
          <button aria-label="close" onClick={onClose} className="text-gray-500">✕</button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">Instance Name</label>
            <input
              value={instanceName}
              onChange={(e) => setInstanceName(e.target.value)}
              className="mt-2 block w-full rounded-md border-gray-200 shadow-sm p-2"
            />

            <div className="mt-4">
              <p className="text-sm text-gray-600">Scan QR code in WhatsApp on your phone (Linked Devices).</p>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={onGenerate}
                disabled={loading}
                className="inline-flex items-center px-4 py-2 bg-slate-900 text-white rounded-md disabled:opacity-60"
              >
                {loading ? 'Generating...' : 'Generate QR Code'}
              </button>

              <button
                onClick={onRefresh}
                disabled={loading || !qrDataUrl}
                className="inline-flex items-center px-4 py-2 border rounded-md"
              >
                Refresh
              </button>
            </div>

            {error && (
              <div className="mt-3 p-3 bg-red-50 text-red-700 rounded">{error}</div>
            )}

            <div className="mt-6 text-xs text-gray-500">
              <p className="font-semibold">Config Instructions</p>
              <ol className="list-decimal pl-5">
                <li>Open WhatsApp on your phone</li>
                <li>Go to Menu &gt; Linked devices &gt; Link a device</li>
                <li>Scan the QR shown here</li>
              </ol>
            </div>
          </div>

          <div>
            <div className="w-full h-[320px] bg-gray-100 rounded flex items-center justify-center">
              {qrDataUrl ? (
                <div className="text-center">
                  <img src={qrDataUrl} alt="qr" className="mx-auto" style={{ width: 240, height: 240 }} />
                  <div className="mt-2 text-sm text-gray-600">{expired ? 'Expired' : 'Valid'}</div>
                </div>
              ) : pairingCode ? (
                <div className="text-center p-4">
                  <div className="mb-2 text-sm text-gray-700">Pairing Code</div>
                  <div className="inline-flex items-center gap-2 bg-white p-3 rounded border">
                    <code className="font-mono text-lg">{pairingCode}</code>
                    <button
                      onClick={() => navigator.clipboard?.writeText(pairingCode)}
                      className="px-2 py-1 border rounded text-sm"
                    >Copy</button>
                  </div>
                  <div className="mt-2 text-xs text-gray-500">Use this code in the Evolution API manager if needed.</div>
                </div>
              ) : rawCode ? (
                <div className="text-center">
                  <pre className="max-h-[240px] overflow-auto text-xs p-3 bg-white rounded border">{rawCode}</pre>
                  <div className="mt-2 text-sm text-gray-600">Raw code returned by API</div>
                </div>
              ) : (
                <div className="text-center text-gray-400">QR will appear here after generation</div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded border">Close</button>
        </div>
      </div>
    </div>
  );
};

export default WhatsAppConnectModal;
