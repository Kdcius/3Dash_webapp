import { useRef, useState } from 'react';
import AnimatedLogo from '../../../components/AnimatedLogo';

interface Props {
  onConnect: () => void;
  onSimulation: () => void;
  onImport: (file: File) => void | Promise<void>;
}

export default function WelcomeStep({ onConnect, onSimulation, onImport }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  const handleFile = async (file: File) => {
    setImporting(true);
    try {
      await onImport(file);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="onboarding-step onboarding-welcome">
      <AnimatedLogo />
      <h2>Your 3D Dashboard, controlled by Home Assistant</h2>

      <p>
        Control your lights, displays, and sensors through an interactive 3D model
        of your home. This wizard will help you set everything up.
      </p>

      <div className="onboarding-welcome-actions">
        <button className="onboarding-btn primary" onClick={onConnect} disabled={importing}>
          Connect to Home Assistant
        </button>
        <button className="onboarding-btn simulation" onClick={onSimulation} disabled={importing}>
          Try Simulation
        </button>
        <p className="onboarding-welcome-simulation-hint">
          Preview only — a sample apartment with fake data, not your real setup
        </p>
        <button
          className="onboarding-btn import"
          onClick={() => fileRef.current?.click()}
          disabled={importing}
        >
          {importing ? 'Importing...' : 'Import Backup'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".zip"
          style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0 }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>

      {importing && (
        <p style={{ color: 'var(--muted)', marginTop: 12 }}>
          Restoring backup and testing connection...
        </p>
      )}
    </div>
  );
}
