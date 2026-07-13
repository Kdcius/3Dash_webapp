import type { HASettings } from '../types';
import type { CameraControlsFlags } from '../contexts/CameraControlsContext';
import { isSimulationActive } from '../contexts/SimulationModeContext';

type ThemeMode = 'dark' | 'light' | 'auto' | 'system';

/* ── Section interfaces ── */

export interface ConnectionSettings {
  mode: 'live' | 'demo';
  haSettings: HASettings;
}

export interface AppearanceSettings {
  theme: ThemeMode;
  bgColor: string;
  primaryAccent: string;
  statusAccent: string;
  panelOpacity: number;
  panelDots: boolean;
  panelBgColor: string;
  backdropObscure: boolean;
  backdropBlur: boolean;
  hudVisible: boolean;
  borderStyle: 'subtle' | 'large' | 'none';
  cornerRadius: 'sharp' | 'soft' | 'round';
}

export interface RenderSettings {
  edgeMode: 'classic' | 'enhanced';
  edgeWidth: number;
  groundGrid: boolean;
  perspective: boolean;
  sunShadowRes: number;
  pointShadowRes: number;
  showTextures: boolean;
  sketchColor: string;
  sketchSpecular: number;
}

export interface EnvironmentSettings {
  sunLiveMode: boolean;
  weatherEnabled: boolean;
}

export interface HomeViewPose {
  alpha: number;
  beta: number;
  radius: number;
  target: { x: number; y: number; z: number };
}

export interface ControlsSettings {
  cameraControls: {
    desktop: CameraControlsFlags;
    mobile: CameraControlsFlags;
  };
  homeView: HomeViewPose | null;
}

export interface MiscSettings {
  panelRatio: number | null;
}

export interface SyncSettings {
  /** Auto-sync config to HA's frontend user-data store (cross-device sync). */
  autoSync: boolean;
  /** Where the 3D model is loaded from: this device's IndexedDB, or HA's /local/3dash/. */
  modelSource: 'device' | 'ha';
  /** Model file name (without .glb) under config/www/3dash/ when modelSource is 'ha'. */
  modelName: string;
}

/* ── Root interface ── */

export interface AppSettings {
  connection: ConnectionSettings;
  appearance: AppearanceSettings;
  render: RenderSettings;
  environment: EnvironmentSettings;
  controls: ControlsSettings;
  misc: MiscSettings;
  sync: SyncSettings;
}

/* ── Section type (for getSetting / updateSettings) ── */

export type SettingsSection = keyof AppSettings;

const STORAGE_KEY = 'settings';

const DEFAULT_SETTINGS: AppSettings = {
  connection: {
    mode: 'live',
    haSettings: { url: '', port: 8123, token: '' },
  },
  appearance: {
    theme: 'dark',
    bgColor: '',
    primaryAccent: '',
    statusAccent: '',
    panelOpacity: 100,
    panelDots: false,
    panelBgColor: '',
    backdropObscure: true,
    backdropBlur: true,
    hudVisible: true,
    borderStyle: 'subtle',
    cornerRadius: 'soft',
  },
  render: {
    edgeMode: 'enhanced',
    edgeWidth: 3,
    groundGrid: false,
    perspective: true,
    sunShadowRes: 512,
    pointShadowRes: 512,
    showTextures: false,
    sketchColor: '#ffffff',
    sketchSpecular: 0.1,
  },
  environment: {
    sunLiveMode: true,
    weatherEnabled: true,
  },
  controls: {
    cameraControls: {
      desktop: { zoom: true, rotate: true, pan: true },
      mobile: { zoom: true, rotate: true, pan: true },
    },
    homeView: null,
  },
  misc: {
    panelRatio: null,
  },
  sync: {
    autoSync: false,
    modelSource: 'device',
    modelName: 'model',
  },
};

/** Migrate old flat localStorage structure into the new sectioned format. Runs once. */
function migrate(): void {
  const raw = localStorage.getItem(STORAGE_KEY);

  // Already migrated to sectioned format
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.connection) return; // already sectioned
      // Flat format → convert to sectioned
      migrateFlatToSectioned(parsed);
      return;
    } catch { /* fall through */ }
  }

  // Migrate from individual keys (oldest format)
  const partial: Record<string, unknown> = {};

  const demoMode = localStorage.getItem('demoMode');
  if (demoMode !== null) partial.mode = demoMode === 'true' ? 'demo' : 'live';

  const haSettings = localStorage.getItem('haSettings');
  if (haSettings) {
    try { partial.haSettings = JSON.parse(haSettings); } catch { /* ignore */ }
  }

  const theme = localStorage.getItem('theme');
  if (theme) partial.theme = theme;

  const edgeMode = localStorage.getItem('edgeMode');
  if (edgeMode) partial.edgeMode = edgeMode;

  const edgeWidth = localStorage.getItem('edgeWidth');
  if (edgeWidth !== null) partial.edgeWidth = parseFloat(edgeWidth);

  const groundGrid = localStorage.getItem('groundGrid');
  if (groundGrid !== null) partial.groundGrid = groundGrid === 'true';

  const weatherEnabled = localStorage.getItem('weatherEnabled');
  if (weatherEnabled !== null) partial.weatherEnabled = weatherEnabled !== 'false';

  const perspective = localStorage.getItem('perspective');
  if (perspective !== null) partial.perspective = perspective !== 'false';

  const cameraControls = localStorage.getItem('cameraControls');
  if (cameraControls) {
    try { partial.cameraControls = JSON.parse(cameraControls); } catch { /* ignore */ }
  }

  if (Object.keys(partial).length > 0) {
    migrateFlatToSectioned(partial);
    ['demoMode', 'haSettings', 'theme', 'edgeMode', 'edgeWidth',
     'groundGrid', 'weatherEnabled', 'perspective', 'cameraControls',
    ].forEach(k => localStorage.removeItem(k));
  }

  // Migrate panelRatio from standalone key
  const panelRatio = localStorage.getItem('panelRatio');
  if (panelRatio !== null) {
    const current = getSettings();
    current.misc.panelRatio = parseFloat(panelRatio);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    localStorage.removeItem('panelRatio');
  }
}

/** Convert a flat settings object to the new sectioned format. */
function migrateFlatToSectioned(flat: Record<string, unknown>): void {
  const sectioned: AppSettings = structuredClone(DEFAULT_SETTINGS);

  // Connection
  if (flat.mode) sectioned.connection.mode = flat.mode as ConnectionSettings['mode'];
  if (flat.haSettings) sectioned.connection.haSettings = flat.haSettings as HASettings;

  // Appearance
  if (flat.theme) sectioned.appearance.theme = flat.theme as AppearanceSettings['theme'];
  if (flat.bgColor !== undefined) sectioned.appearance.bgColor = flat.bgColor as string;
  if (flat.primaryAccent !== undefined) sectioned.appearance.primaryAccent = flat.primaryAccent as string;
  if (flat.statusAccent !== undefined) sectioned.appearance.statusAccent = flat.statusAccent as string;
  if (flat.panelOpacity !== undefined) sectioned.appearance.panelOpacity = flat.panelOpacity as number;
  if (flat.panelDots !== undefined) sectioned.appearance.panelDots = flat.panelDots as boolean;
  if (flat.panelBgColor !== undefined) sectioned.appearance.panelBgColor = flat.panelBgColor as string;
  if (flat.backdropObscure !== undefined) sectioned.appearance.backdropObscure = flat.backdropObscure as boolean;
  if (flat.backdropBlur !== undefined) sectioned.appearance.backdropBlur = flat.backdropBlur as boolean;
  if (flat.hudVisible !== undefined) sectioned.appearance.hudVisible = flat.hudVisible as boolean;
  if (flat.borderStyle !== undefined) sectioned.appearance.borderStyle = flat.borderStyle as AppearanceSettings['borderStyle'];
  if (flat.cornerRadius !== undefined) sectioned.appearance.cornerRadius = flat.cornerRadius as AppearanceSettings['cornerRadius'];

  // Render
  if (flat.edgeMode) sectioned.render.edgeMode = flat.edgeMode as RenderSettings['edgeMode'];
  if (flat.edgeWidth !== undefined) sectioned.render.edgeWidth = flat.edgeWidth as number;
  if (flat.groundGrid !== undefined) sectioned.render.groundGrid = flat.groundGrid as boolean;
  if (flat.perspective !== undefined) sectioned.render.perspective = flat.perspective as boolean;

  // Environment
  if (flat.sunLiveMode !== undefined) sectioned.environment.sunLiveMode = flat.sunLiveMode as boolean;
  if (flat.weatherEnabled !== undefined) sectioned.environment.weatherEnabled = flat.weatherEnabled as boolean;

  // Controls
  if (flat.cameraControls) sectioned.controls.cameraControls = flat.cameraControls as ControlsSettings['cameraControls'];

  localStorage.setItem(STORAGE_KEY, JSON.stringify(sectioned));
}

// Run migration on module load
migrate();

/**
 * In-memory settings override used by simulation mode.
 * When set, getSettings() returns this instead of reading localStorage.
 */
let simulationSettingsOverride: AppSettings | null = null;

/** Set (or clear) the in-memory simulation settings. */
export function setSimulationSettingsOverride(s: AppSettings | null): void {
  simulationSettingsOverride = s ? structuredClone(s) : null;
}

/** Read all settings from localStorage (or from the simulation override). */
export function getSettings(): AppSettings {
  if (simulationSettingsOverride) return structuredClone(simulationSettingsOverride);

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return structuredClone(DEFAULT_SETTINGS);
  try {
    const parsed = JSON.parse(raw);
    return {
      connection: { ...DEFAULT_SETTINGS.connection, ...parsed.connection },
      appearance: { ...DEFAULT_SETTINGS.appearance, ...parsed.appearance },
      render: { ...DEFAULT_SETTINGS.render, ...parsed.render },
      environment: { ...DEFAULT_SETTINGS.environment, ...parsed.environment },
      controls: { ...DEFAULT_SETTINGS.controls, ...parsed.controls },
      misc: { ...DEFAULT_SETTINGS.misc, ...parsed.misc },
      sync: { ...DEFAULT_SETTINGS.sync, ...parsed.sync },
    };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

/** Get a single section's settings. */
export function getSetting<K extends SettingsSection>(section: K): AppSettings[K] {
  return getSettings()[section];
}

/** Update one or more keys within a specific section. */
export function updateSettings<K extends SettingsSection>(
  section: K,
  patch: Partial<AppSettings[K]>,
): void {
  if (isSimulationActive()) {
    // Update the in-memory override so the UI reacts, but never persist
    if (simulationSettingsOverride) {
      simulationSettingsOverride[section] = { ...simulationSettingsOverride[section], ...patch };
    }
    return;
  }
  const current = getSettings();
  current[section] = { ...current[section], ...patch };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
}

/** Replace all settings at once (used by backup import). */
export function setAllSettings(settings: AppSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

/** Clear all settings (used on reset). */
export function clearSettings(): void {
  localStorage.removeItem(STORAGE_KEY);
}
