// Mocked WhatsApp API service for QR generation and connection flow
// This is a frontend-side mock to allow UI development without a backend.

export type GenerateQrResult = {
  qrDataUrl?: string | null; // data:image/... url (if returned)
  pairingCode?: string | null; // textual pairing code from Evolution API
  rawCode?: string | null; // raw code field if any
  expiresAt: number; // epoch ms
  status: 'ready' | 'pending' | 'failed';
};

const EVOLUTION_BASE = (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.VITE_EVOLUTION_API_URL) || null;
const EVOLUTION_APIKEY = (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.VITE_EVOLUTION_API_KEY) || null;

async function callEvolution<T = any>(path: string, opts?: RequestInit) {
  if (!EVOLUTION_BASE) throw new Error('Evolution API base URL not configured (VITE_EVOLUTION_API_URL)');
  const base = EVOLUTION_BASE.replace(/\/$/, '');
  const res = await fetch(`${base}${path}`, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Evolution API error ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

export async function generateQr(instanceName: string): Promise<GenerateQrResult> {
  // if Evolution API is configured, try to use it
  if (EVOLUTION_BASE && EVOLUTION_APIKEY) {
    try {
      // Try to create instance first (idempotent if name exists may return 403 or similar)
      try {
        await callEvolution('/instance/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: EVOLUTION_APIKEY,
          },
          body: JSON.stringify({ instanceName, qrcode: true, integration: 'WHATSAPP-BAILEYS' }),
        });
      } catch (err) {
        // ignore create errors (instance may already exist)
      }

      // Then request connect/pairing info
      const connect = await callEvolution(`/instance/connect/${encodeURIComponent(instanceName)}`, {
        method: 'GET',
        headers: { apikey: EVOLUTION_APIKEY },
      });

      // connect may return { pairingCode, code }
      const pairingCode = connect?.pairingCode || null;
      const rawCode = connect?.code || null;

      let qrDataUrl: string | null = null;
      if (rawCode) {
        // if rawCode already contains data:image, use it
        if (typeof rawCode === 'string' && rawCode.startsWith('data:image')) {
          qrDataUrl = rawCode;
        } else if (typeof rawCode === 'string' && rawCode.includes('<svg')) {
          // raw svg
          qrDataUrl = `data:image/svg+xml;base64,${window.btoa(rawCode)}`;
        } else if (typeof rawCode === 'string' && /^[A-Za-z0-9+/=\n]+$/.test(rawCode) && rawCode.length > 100) {
          // probably base64 png
          qrDataUrl = `data:image/png;base64,${rawCode}`;
        }
      }

      return {
        qrDataUrl,
        pairingCode,
        rawCode,
        expiresAt: Date.now() + 1000 * 60 * 5,
        status: 'ready',
      };
    } catch (err: any) {
      // fallthrough to mocked behavior on failure
      console.warn('Evolution API QR generation failed, falling back to mock:', err?.message || err);
    }
  }

  // Fallback: mocked SVG QR
  // simulate network latency
  await new Promise((r) => setTimeout(r, 400));

  if (!instanceName || instanceName.trim().length === 0) {
    throw new Error('Instance name is required');
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns='http://www.w3.org/2000/svg' width='360' height='360' viewBox='0 0 360 360'>` +
    `<rect width='100%' height='100%' fill='#fff'/>` +
    `<rect x='12' y='12' width='80' height='80' fill='#0f172a'/>` +
    `<rect x='268' y='12' width='80' height='80' fill='#0f172a'/>` +
    `<rect x='12' y='268' width='80' height='80' fill='#0f172a'/>` +
    `<g fill='#0f172a'>` +
    `<rect x='120' y='40' width='20' height='20'/>` +
    `<rect x='150' y='40' width='10' height='10'/>` +
    `<rect x='200' y='80' width='20' height='20'/>` +
    `<rect x='70' y='150' width='12' height='12'/>` +
    `<rect x='220' y='200' width='10' height='10'/>` +
    `</g>` +
    `<text x='180' y='320' font-size='14' text-anchor='middle' fill='#475569'>QR for: ${escapeXml(instanceName)}</text>` +
    `</svg>`;

  const base64 = typeof window !== 'undefined' ? window.btoa(svg) : Buffer.from(svg).toString('base64');
  const dataUrl = `data:image/svg+xml;base64,${base64}`;

  return {
    qrDataUrl: dataUrl,
    pairingCode: null,
    rawCode: null,
    expiresAt: Date.now() + 1000 * 60 * 5, // 5 minutes
    status: 'ready',
  };
}

function escapeXml(unsafe: string) {
  return unsafe.replace(/[&<>"']/g, function (c) {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&apos;';
      default: return c;
    }
  });
}

export type ConnectionState = {
  instanceName: string;
  state: string; // e.g. 'open' | 'close' | 'created'
  profileName?: string | null;
  owner?: string | null;
};

export async function fetchConnectionState(instanceName: string): Promise<ConnectionState> {
  if (EVOLUTION_BASE && EVOLUTION_APIKEY) {
    try {
      const res = await callEvolution(`/instance/connectionState/${encodeURIComponent(instanceName)}`, {
        method: 'GET',
        headers: { apikey: EVOLUTION_APIKEY },
      });
      return {
        instanceName: res?.instance?.instanceName || instanceName,
        state: res?.instance?.state || res?.instance?.status || 'unknown',
        profileName: res?.instance?.profileName || null,
        owner: res?.instance?.owner || null,
      } as ConnectionState;
    } catch (err) {
      console.warn('fetchConnectionState failed', err);
      throw err;
    }
  }

  // fallback: mock disconnected
  return {
    instanceName,
    state: 'close',
    profileName: null,
    owner: null,
  };
}
