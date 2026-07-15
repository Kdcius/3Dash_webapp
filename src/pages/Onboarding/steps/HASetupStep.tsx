import { useState } from 'react';
import { updateSettings } from '../../../services/settingsStore';
import { buildWsUrl } from '../../../services/haWebSocket';

interface Props {
  onComplete: () => void;
  initialHA?: { url: string; port: number; token: string; error?: string };
}

/** Test HA connection by opening a temporary WebSocket. */
export async function testHA(url: string, port: number, token: string): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const ws = new WebSocket(buildWsUrl(url, port));
    const timeout = setTimeout(() => { ws.close(); resolve({ success: false, error: 'Timeout (5s)' }); }, 5000);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'auth_required') {
        ws.send(JSON.stringify({ type: 'auth', access_token: token }));
      } else if (msg.type === 'auth_ok') {
        clearTimeout(timeout); ws.close(); resolve({ success: true });
      } else if (msg.type === 'auth_invalid') {
        clearTimeout(timeout); ws.close(); resolve({ success: false, error: 'Invalid token' });
      }
    };
    ws.onerror = () => {
      clearTimeout(timeout); ws.close();
      // A bare host from an HTTP page is tried over plain ws:// — if HA itself
      // uses SSL, that handshake fails, so point the user at an https:// URL.
      const hint = !/^(https?|wss?):\/\//i.test(url.trim()) && window.location.protocol !== 'https:'
        ? ' — if your Home Assistant uses HTTPS/SSL, enter its full URL (https://...)'
        : '';
      resolve({ success: false, error: `Connection failed${hint}` });
    };
  });
}

export default function HASetupStep({ onComplete, initialHA }: Props) {
  const [url, setUrl] = useState(initialHA?.url ?? '');
  const [port, setPort] = useState(initialHA?.port ?? 8123);
  const [token, setToken] = useState(initialHA?.token ?? '');
  const [status, setStatus] = useState<'idle' | 'testing' | 'success' | 'error'>(initialHA?.error ? 'error' : 'idle');
  const [errorMsg, setErrorMsg] = useState(initialHA?.error ?? '');
  const [saving, setSaving] = useState(false);

  const handleTest = async () => {
    if (!url || !token) return;
    setStatus('testing');
    setErrorMsg('');
    try {
      const result = await testHA(url, port, token);
      if (result.success) {
        setStatus('success');
      } else {
        setStatus('error');
        setErrorMsg(result.error || 'Connection failed');
      }
    } catch {
      setStatus('error');
      setErrorMsg('Network error');
    }
  };

  const handleSave = () => {
    if (!url || !token) return;
    setSaving(true);
    try {
      updateSettings('connection', { haSettings: { url, port, token } });
      onComplete();
    } catch {
      setStatus('error');
      setErrorMsg('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="onboarding-step">
      <div>
        <h1>Home Assistant</h1>
        <h2>Connect to your Home Assistant instance</h2>
      </div>

      {window.location.protocol === 'https:' && (
        <div className="onboarding-tips">
          <div className="onboarding-tips-title">HTTPS detected</div>
          <ul>
            <li>Your browser requires a secure WebSocket connection (WSS)</li>
            <li>Make sure your Home Assistant is accessible over HTTPS (e.g. via Nabu Casa or a reverse proxy with SSL)</li>
            <li>A local <code>ws://</code> address will not work from an HTTPS page</li>
          </ul>
          <div style={{ marginTop: 12, fontSize: '0.9em', opacity: 0.85 }}>
            Don't have Nabu Casa, or don't want to expose your Home Assistant to the internet?
            No problem — host 3Dash directly on your HA server in a few clicks:
          </div>
          <a
            href="https://my.home-assistant.io/redirect/supervisor_add_addon_repository/?repository_url=https%3A%2F%2Fgithub.com%2Fkdcius%2F3Dash_webapp"
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-block', marginTop: 8 }}
          >
            <img
              src="https://my.home-assistant.io/badges/supervisor_add_addon_repository.svg"
              alt="Add repository to Home Assistant"
            />
          </a>
        </div>
      )}

      <div className="onboarding-row">
        <div className="onboarding-field" style={{ flex: 3 }}>
          <label className="onboarding-label">IP Address or URL</label>
          <input
            className="onboarding-input"
            type="text"
            placeholder="192.168.1.xxx or https://ha.example.com"
            value={url}
            onChange={(e) => { setUrl(e.target.value); setStatus('idle'); }}
          />
        </div>
        <div className="onboarding-field" style={{ flex: 1 }}>
          <label className="onboarding-label">Port</label>
          <input
            className="onboarding-input"
            type="number"
            value={port}
            onChange={(e) => { setPort(parseInt(e.target.value) || 8123); setStatus('idle'); }}
          />
        </div>
      </div>

      <div className="onboarding-field">
        <label className="onboarding-label">Long-Lived Access Token</label>
        <input
          className="onboarding-input"
          type="password"
          placeholder="eyJhbGci..."
          value={token}
          onChange={(e) => { setToken(e.target.value); setStatus('idle'); }}
        />
        <p>
          Generate one in Home Assistant: Profile &gt; Security &gt; Long-lived access tokens
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          className="onboarding-btn"
          onClick={handleTest}
          disabled={!url || !token}
        >
          Test Connection
        </button>
        <button
          className="onboarding-btn primary"
          onClick={handleSave}
          disabled={!url || !token || saving}
        >
          {saving ? 'Saving...' : 'Save & Continue'}
        </button>
      </div>

      {status !== 'idle' && (
        <div className={`onboarding-status ${status}`}>
          {status === 'testing' && 'Testing connection...'}
          {status === 'success' && '\u2713 Connected successfully'}
          {status === 'error' && `\u2717 ${errorMsg}`}
        </div>
      )}
    </div>
  );
}
