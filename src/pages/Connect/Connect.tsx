import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { testHA } from '../Onboarding/steps/HASetupStep';
import { updateSettings } from '../../services/settingsStore';
import { updateConfig, getConfig, replaceConfig } from '../../services/configApi';

/**
 * One-tap device setup: /#/connect?ha_url=...&ha_port=...&ha_token=...
 *
 * Lets a single generated link configure a new device (phone, tablet) without
 * retyping the HA URL/token by hand. Tests the connection, saves it, marks
 * onboarding complete, and enables cross-device sync — then redirects home.
 */
export default function Connect() {
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState<'connecting' | 'error'>('connecting');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const url = params.get('ha_url');
    const port = parseInt(params.get('ha_port') || '8123', 10);
    const token = params.get('ha_token');

    if (!url || !token) {
      setStatus('error');
      setErrorMsg('Missing ha_url or ha_token in link');
      return;
    }

    (async () => {
      const result = await testHA(url, port, token);
      if (!result.success) {
        setStatus('error');
        setErrorMsg(result.error || 'Connection failed');
        return;
      }

      updateSettings('connection', { haSettings: { url, port, token } });
      updateSettings('sync', { autoSync: true, modelSource: 'ha', modelName: 'model' });

      const cfg = getConfig();
      updateConfig({
        onboarding: { completed: true },
        location: cfg.location ?? { latitude: 51.0, longitude: 10.0 },
      });
      // Zero the timestamp: this device starts empty, so any remote config
      // must win the first sync instead of being clobbered by this stub.
      replaceConfig({ ...getConfig(), updatedAt: 0 });

      navigate('/', { replace: true });
    })();
  }, [location.search, navigate]);

  return (
    <div className="onboarding-step" style={{ textAlign: 'center', paddingTop: '20vh' }}>
      <h1>3Dash</h1>
      {status === 'connecting' && <h2>Connecting to Home Assistant…</h2>}
      {status === 'error' && (
        <>
          <h2>Couldn't connect</h2>
          <p>{errorMsg}</p>
          <button className="onboarding-btn primary" onClick={() => navigate('/onboarding', { replace: true })}>
            Set up manually
          </button>
        </>
      )}
    </div>
  );
}
