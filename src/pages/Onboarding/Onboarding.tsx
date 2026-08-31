import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sun, Moon, Github } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { useDemoMode } from '../../contexts/DemoModeContext';
import { useSimulationMode } from '../../contexts/SimulationModeContext';
import { getConfig, updateConfig, importBackup, getModelBlob } from '../../services/configApi';
import { getSettings, getSetting } from '../../services/settingsStore';
import WelcomeStep from './steps/WelcomeStep';
import ImportReportStep from './steps/ImportReportStep';
import HASetupStep, { testHA } from './steps/HASetupStep';
import ModelUploadStep from './steps/ModelUploadStep';
import LocationStep from './steps/LocationStep';
import CompletionStep from './steps/CompletionStep';
import ToastHost from '../../components/Toast';
import './Onboarding.css';

// Steps: Welcome(0) ImportReport(1) HA(2) Model(3) Location(4) Done(5)
const STEP_LABELS = ['Welcome', 'Import', 'Home Assistant', '3D Model', 'Location', 'Done'];

interface ImportReport {
  hasModel: boolean;
  modelSize?: string;
  hasSettings: boolean;
  haStatus: 'success' | 'error' | 'missing';
  haError?: string;
  haUrl?: string;
  haPort?: number;
  lightsCount: number;
  displaysCount: number;
  wallsCount: number;
  tubesCount: number;
  settingsCount: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const DEFAULT_SETTINGS_VALUES: Record<string, Record<string, unknown>> = {
  connection: { mode: 'live' },
  appearance: { theme: 'dark' },
  render: { edgeMode: 'enhanced', edgeWidth: 3, groundGrid: false, perspective: true },
  environment: { sunLiveMode: true, weatherEnabled: true },
};

function countCustomSettings(): number {
  const settings = getSettings();
  let count = 0;
  for (const [section, defaults] of Object.entries(DEFAULT_SETTINGS_VALUES)) {
    const sectionData = settings[section as keyof typeof settings] as unknown as Record<string, unknown>;
    for (const [key, defaultVal] of Object.entries(defaults)) {
      if (JSON.stringify(sectionData[key]) !== JSON.stringify(defaultVal)) count++;
    }
  }
  // Camera controls: check if any differ from all-true defaults
  const cam = settings.controls.cameraControls;
  const allTrue = (f: { zoom: boolean; rotate: boolean; pan: boolean }) => f.zoom && f.rotate && f.pan;
  if (!allTrue(cam.desktop) || !allTrue(cam.mobile)) count++;
  return count;
}

export default function Onboarding() {
  const { theme, resolved, setTheme } = useTheme();
  const { setDemoMode } = useDemoMode();
  const { setSimulationMode } = useSimulationMode();
  const navigate = useNavigate();

  const [currentStep, setCurrentStep] = useState(0);
  const [isImportMode, setIsImportMode] = useState(false);
  const [hasModel, setHasModel] = useState(false);
  const [hasLocation, setHasLocation] = useState(false);
  const [importedHA, setImportedHA] = useState<{ url: string; port: number; token: string; error?: string } | null>(null);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);

  const goTo = useCallback((step: number) => {
    setCurrentStep(step);
  }, []);

  const handleConnect = useCallback(() => {
    setDemoMode(false);
    goTo(2); // HA setup
  }, [goTo, setDemoMode]);

  const handleSimulation = useCallback(() => {
    setSimulationMode(true);
    navigate('/');
  }, [setSimulationMode, navigate]);

  const handleHAComplete = useCallback(() => {
    if (isImportMode) {
      // Import already loaded config + model, just finish
      updateConfig({ onboarding: { completed: true } });
      window.location.href = '/';
      return;
    }
    goTo(3); // Model upload
  }, [goTo, isImportMode]);

  const handleModelComplete = useCallback(() => {
    setHasModel(true);
    goTo(4); // Location
  }, [goTo]);

  const handleLocationComplete = useCallback(() => {
    setHasLocation(true);
    goTo(5); // Completion
  }, [goTo]);

  const handleImport = useCallback(async (file: File) => {
    try {
      const result = await importBackup(file);
      setIsImportMode(true);

      // Test HA settings from the imported backup
      const ha = getSetting('connection').haSettings;
      let haStatus: ImportReport['haStatus'] = 'missing';
      let haError: string | undefined;

      if (ha.url && ha.token) {
        const test = await testHA(ha.url, ha.port, ha.token);
        if (test.success) {
          haStatus = 'success';
        } else {
          haStatus = 'error';
          haError = test.error || 'Connection failed';
          setImportedHA({ ...ha, error: haError });
        }
      } else {
        setImportedHA(ha.url ? { ...ha } : null);
      }

      // Gather stats from imported config
      const config = getConfig();
      let modelSize: string | undefined;
      if (result.hasModel) {
        const blob = await getModelBlob();
        if (blob) modelSize = formatBytes(blob.size);
      }

      setImportReport({
        hasModel: result.hasModel,
        modelSize,
        hasSettings: result.hasSettings,
        haStatus,
        haError,
        haUrl: ha.url || undefined,
        haPort: ha.url ? ha.port : undefined,
        lightsCount: config.lights?.length ?? 0,
        displaysCount: config.displays?.length ?? 0,
        wallsCount: config.shadowWalls?.length ?? 0,
        tubesCount: config.tubes?.length ?? 0,
        settingsCount: result.hasSettings ? countCustomSettings() : 0,
      });

      goTo(1); // Import Report
    } catch {
      // TODO: surface error to user
    }
  }, [goTo]);

  const handleImportReportContinue = useCallback(() => {
    if (importReport?.haStatus === 'success') {
      // HA works — go straight to dashboard
      updateConfig({ onboarding: { completed: true } });
      window.location.href = '/';
    } else {
      // HA failed or missing — go to HA setup
      goTo(2);
    }
  }, [goTo, importReport]);

  const handleEnterDashboard = useCallback(async () => {
    try {
      await updateConfig({ onboarding: { completed: true } });
    } catch {
      // Continue anyway — worst case user sees onboarding again
    }
    localStorage.setItem('showTour', 'true');
    // Full reload so AppRoutes re-fetches config with onboarding.completed = true
    window.location.href = '/';
  }, []);

  const slideClass = (index: number) => {
    if (index === currentStep) return 'onboarding-slide active';
    if (index < currentStep) return 'onboarding-slide left';
    return 'onboarding-slide right';
  };

  // Steps where Back/Skip should not appear
  const isReportStep = currentStep === 1;
  const showNav = currentStep > 0 && currentStep < STEP_LABELS.length - 1 && !isReportStep;

  // Compute visible steps for the current path
  // Connect: Welcome → HA → Model → Location → Done
  // Import:  Welcome → Report → (HA →) Dashboard  (HA only if connection failed)
  // Simulation: goes directly to dashboard (not through these steps)
  const pathSteps: number[] = isImportMode
    ? importReport?.haStatus === 'success'
      ? [0, 1]           // report then dashboard
      : [0, 1, 2]        // report then HA then dashboard
    : [0, 2, 3, 4, 5];   // full path

  const dotIndex = pathSteps.indexOf(currentStep);
  const dotCount = pathSteps.length;

  return (
    <div className="onboarding">
      <ToastHost />
      <button
        className="onboarding-theme-toggle"
        onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')}
        title={`Switch to ${resolved === 'dark' ? 'light' : 'dark'} theme`}
      >
        {resolved === 'dark'
          ? <Sun key="sun" size={28} strokeWidth={1.5} />
          : <Moon key="moon" size={28} strokeWidth={1.5} />}
      </button>

      <div className="onboarding-steps">
        <div className={slideClass(0)}>
          <WelcomeStep onConnect={handleConnect} onSimulation={handleSimulation} onImport={handleImport} />
        </div>

        <div className={slideClass(1)}>
          {importReport && (
            <ImportReportStep
              hasModel={importReport.hasModel}
              modelSize={importReport.modelSize}
              hasSettings={importReport.hasSettings}
              haStatus={importReport.haStatus}
              haError={importReport.haError}
              haUrl={importReport.haUrl}
              haPort={importReport.haPort}
              lightsCount={importReport.lightsCount}
              displaysCount={importReport.displaysCount}
              wallsCount={importReport.wallsCount}
              tubesCount={importReport.tubesCount}
              settingsCount={importReport.settingsCount}
              onContinue={handleImportReportContinue}
            />
          )}
        </div>

        <div className={slideClass(2)}>
          <HASetupStep onComplete={handleHAComplete} initialHA={importedHA ?? undefined} />
        </div>

        <div className={slideClass(3)}>
          <ModelUploadStep onComplete={handleModelComplete} />
        </div>

        <div className={slideClass(4)}>
          <LocationStep onComplete={handleLocationComplete} />
        </div>

        <div className={slideClass(5)}>
          <CompletionStep
            demoMode={false}
            hasModel={hasModel}
            hasLocation={hasLocation}
            onEnter={handleEnterDashboard}
          />
        </div>
      </div>

      <div className="onboarding-nav">
        <div className="onboarding-nav-group">
          {showNav && dotIndex > 0 && (
            <button
              className="onboarding-btn"
              onClick={() => goTo(pathSteps[dotIndex - 1])}
            >
              Back
            </button>
          )}
        </div>

        {currentStep > 0 && (
          <div className="onboarding-dots">
            {Array.from({ length: dotCount }, (_, i) => (
              <div
                key={i}
                className={`onboarding-dot${i === dotIndex ? ' active' : ''}${i < dotIndex ? ' done' : ''}`}
              />
            ))}
          </div>
        )}

        <div className="onboarding-nav-group" />
      </div>

      <a
        className="onboarding-github-link"
        href="https://github.com/Kdcius/3Dash_webapp"
        target="_blank"
        rel="noopener noreferrer"
        title="View on GitHub"
      >
        <Github size={28} strokeWidth={1.5} />
      </a>
    </div>
  );
}
