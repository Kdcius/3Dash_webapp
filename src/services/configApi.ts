import JSZip from 'jszip';
import type { AppConfig, DisplayConfig, LightConfig, LightGroup, ShadowWallConfig, SidePanelConfig, TubeConfig, ZoneConfig } from '../types';
import { saveModel as dbSaveModel, getModel as dbGetModel, deleteAllModels } from './storageApi';
import { getSettings, setAllSettings, type AppSettings } from './settingsStore';
import { isSimulationActive } from '../contexts/SimulationModeContext';

const CONFIG_KEY = 'config';

/**
 * Hook invoked after every persisted config mutation. Wired to
 * haSync.schedulePush by the Dashboard (kept as an injection point
 * to avoid a configApi ↔ haSync import cycle).
 */
let configChangedHook: ((config: AppConfig) => void) | null = null;
export function setConfigChangedHook(fn: ((config: AppConfig) => void) | null): void {
  configChangedHook = fn;
}

const DEFAULT_CONFIG: AppConfig = {
  location: { latitude: 43.6077, longitude: 3.8766 },
  lights: [],
  onboarding: { completed: false },
};

/** Returns true if a config has been saved to localStorage. */
export function hasConfig(): boolean {
  return localStorage.getItem(CONFIG_KEY) !== null;
}

/**
 * In-memory config override used by simulation mode.
 */
let simulationConfigOverride: AppConfig | null = null;

/** Set (or clear) the in-memory simulation config. */
export function setSimulationConfigOverride(c: AppConfig | null): void {
  simulationConfigOverride = c ? structuredClone(c) : null;
}

/** Read config from localStorage (or from the simulation override). */
export function getConfig(): AppConfig {
  if (simulationConfigOverride) return structuredClone(simulationConfigOverride);

  const raw = localStorage.getItem(CONFIG_KEY);
  if (!raw) return { ...DEFAULT_CONFIG };
  try {
    return JSON.parse(raw) as AppConfig;
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/** Merge partial updates into the stored config and persist. */
export function updateConfig(data: {
  lights?: LightConfig[];
  lightGroups?: LightGroup[];
  displays?: DisplayConfig[];
  shadowWalls?: ShadowWallConfig[];
  location?: { latitude: number; longitude: number; northOffset?: number };
  sidePanel?: SidePanelConfig;
  tubes?: TubeConfig[];
  onboarding?: { completed: boolean };
  zones?: ZoneConfig[];
  activeZoneId?: string;
}): void {
  if (isSimulationActive()) {
    // Update in-memory override so the UI reacts, but never persist
    if (simulationConfigOverride) {
      Object.assign(simulationConfigOverride, data);
    }
    return;
  }
  const current = getConfig();
  const merged: AppConfig = { ...current, ...data, updatedAt: Date.now() };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(merged));
  configChangedHook?.(merged);
}

/** Replace the whole config (used when a newer remote config is pulled from HA). */
export function replaceConfig(config: AppConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

/** Store a GLB model file in IndexedDB. */
export async function uploadModel(file: File): Promise<void> {
  await dbSaveModel(file);
}

/** Get the GLB model blob from IndexedDB. */
export async function getModelBlob(): Promise<Blob | null> {
  return dbGetModel();
}

/** Remove config from localStorage and all models from IndexedDB. */
export async function resetConfig(): Promise<void> {
  localStorage.removeItem(CONFIG_KEY);
  await deleteAllModels();
}

/** Export config + settings + model as a downloadable ZIP. */
export async function exportBackup(): Promise<void> {
  const zip = new JSZip();

  // Config
  const config = getConfig();
  zip.file('config.json', JSON.stringify(config, null, 2));

  // Settings (includes HA settings, theme, camera controls, etc.)
  const settings = getSettings();
  zip.file('settings.json', JSON.stringify(settings, null, 2));

  // Model from IndexedDB
  const modelBlob = await dbGetModel();
  if (modelBlob) {
    zip.file('apartment.glb', modelBlob);
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `appart3d-backup-${new Date().toISOString().slice(0, 10)}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Import a ZIP backup. Preserves existing HA token. Returns whether a model was included. */
export async function importBackup(file: File): Promise<{ ok: boolean; hasModel: boolean; hasSettings: boolean }> {
  const zip = await JSZip.loadAsync(file);

  // Config
  const configFile = zip.file('config.json');
  if (!configFile) throw new Error('No config.json found in backup');
  const configJson = await configFile.async('string');
  const importedConfig = JSON.parse(configJson) as AppConfig;

  localStorage.setItem(CONFIG_KEY, JSON.stringify(importedConfig));

  // Settings (if present in backup)
  let hasSettings = false;
  const settingsFile = zip.file('settings.json');
  if (settingsFile) {
    hasSettings = true;
    const settingsJson = await settingsFile.async('string');
    const importedSettings = JSON.parse(settingsJson) as AppSettings;
    // Preserve existing HA token (the export strips it for security)
    const currentSettings = getSettings();
    if (!importedSettings.connection?.haSettings?.token && currentSettings.connection.haSettings.token) {
      importedSettings.connection = {
        ...importedSettings.connection,
        haSettings: {
          ...importedSettings.connection.haSettings,
          token: currentSettings.connection.haSettings.token,
        },
      };
    }
    setAllSettings(importedSettings);
  }

  // Model
  const modelFile = zip.file('apartment.glb');
  let hasModel = false;
  if (modelFile) {
    const modelBlob = await modelFile.async('blob');
    await dbSaveModel(modelBlob);
    hasModel = true;
  }

  return { ok: true, hasModel, hasSettings };
}
