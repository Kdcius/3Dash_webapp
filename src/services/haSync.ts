/**
 * Cross-device sync of the 3Dash config and 3D model, using only
 * HA-native storage (Issue #8) — no external backend, no GitHub tokens.
 *
 * Config  → HA frontend user-data store (WebSocket `frontend/set_user_data`
 *           / `frontend/get_user_data`, key "3dash_config"). Persisted by HA
 *           in .storage, included in HA backups, scoped per HA user, and works
 *           on every install type (OS, Supervised, Container, Core).
 *
 * Model   → served from HA's `config/www` directory as
 *           `http(s)://<ha>:<port>/local/3dash/<name>.glb` (unauthenticated,
 *           correct `model/gltf-binary` MIME, ETag support — verified live).
 *           The file is cached in IndexedDB and only re-downloaded when the
 *           ETag changes, so startup stays instant and works offline.
 *
 * Conflict resolution: last-writer-wins on AppConfig.updatedAt.
 */

import type { AppConfig } from '../types';
import { getActiveHAConnection } from './haWebSocket';
import { getSetting } from './settingsStore';
import { saveModel, getModel, saveMeta, getMeta } from './storageApi';

const USER_DATA_KEY = '3dash_config';
const PUSH_DEBOUNCE_MS = 2500;

export type SyncStatus = 'idle' | 'pushing' | 'pulling' | 'synced' | 'error' | 'offline';

let statusListener: ((s: SyncStatus, detail?: string) => void) | null = null;
export function setSyncStatusListener(fn: ((s: SyncStatus, detail?: string) => void) | null): void {
  statusListener = fn;
}
function report(s: SyncStatus, detail?: string): void {
  statusListener?.(s, detail);
}

/* ── Config sync via frontend user_data ── */

interface RemoteEnvelope {
  config: AppConfig;
  updatedAt: number;
  device: string;
}

function isSyncEnabled(): boolean {
  return getSetting('sync').autoSync;
}

/** Read the remote config envelope from HA. Returns null when none stored. */
export async function pullRemoteConfig(): Promise<RemoteEnvelope | null> {
  const ha = getActiveHAConnection();
  if (!ha?.isConnected) return null;
  const res = await ha.request({ type: 'frontend/get_user_data', key: USER_DATA_KEY }) as
    { value?: RemoteEnvelope | null } | null;
  const env = res?.value ?? null;
  return env && typeof env.updatedAt === 'number' && env.config ? env : null;
}

/** Write the given config to HA user data. */
export async function pushConfigToHA(config: AppConfig): Promise<void> {
  const ha = getActiveHAConnection();
  if (!ha?.isConnected) {
    report('offline');
    return;
  }
  report('pushing');
  const envelope: RemoteEnvelope = {
    config,
    updatedAt: config.updatedAt ?? Date.now(),
    device: navigator.userAgent.slice(0, 80),
  };
  await ha.request({ type: 'frontend/set_user_data', key: USER_DATA_KEY, value: envelope });
  report('synced');
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Debounced push — call after every local config mutation. Rapid edits
 * (e.g. dragging a light) collapse into a single WS write.
 */
export function schedulePush(getLatest: () => AppConfig): void {
  if (!isSyncEnabled()) return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    pushConfigToHA(getLatest()).catch((e) => {
      console.warn('[haSync] push failed:', e);
      report('error', String(e));
    });
  }, PUSH_DEBOUNCE_MS);
}

export interface SyncResult {
  action: 'pulled' | 'pushed' | 'in-sync' | 'disabled' | 'offline';
  remoteConfig?: AppConfig;
}

/**
 * Reconcile local and remote config after the HA connection comes up.
 * Newer `updatedAt` wins. Returns the remote config when it superseded
 * the local one so the caller can apply it and rebuild the scene.
 */
export async function syncOnConnect(local: AppConfig): Promise<SyncResult> {
  if (!isSyncEnabled()) return { action: 'disabled' };
  const ha = getActiveHAConnection();
  if (!ha?.isConnected) return { action: 'offline' };

  report('pulling');
  const remote = await pullRemoteConfig();
  const localTs = local.updatedAt ?? 0;

  // Safety net: a device with no content (fresh /connect or new sign-in)
  // must never overwrite a configured remote, whatever the timestamps say.
  const localEmpty = !local.lights?.length && !local.displays?.length
    && !local.tubes?.length && !local.zones?.length;
  const remoteHasContent = !!(remote && (remote.config.lights?.length
    || remote.config.displays?.length || remote.config.tubes?.length
    || remote.config.zones?.length));
  if (localEmpty && remoteHasContent) {
    report('synced');
    return { action: 'pulled', remoteConfig: remote!.config };
  }

  if (!remote || remote.updatedAt < localTs) {
    // Local is newer (or remote empty) → publish local
    await pushConfigToHA(local);
    return { action: 'pushed' };
  }
  if (remote.updatedAt === localTs) {
    report('synced');
    return { action: 'in-sync' };
  }
  // Remote is newer → hand it to the caller
  report('synced');
  return { action: 'pulled', remoteConfig: remote.config };
}

/* ── Model sync via /local/ (config/www) ── */

/** Base URL of the HA instance derived from connection settings. */
function haHttpBase(): string {
  const { url, port } = getSetting('connection').haSettings;
  const proto = window.location.protocol === 'https:' ? 'https' : 'http';
  return `${url.startsWith('http') ? url : `${proto}://${url}`}:${port}`;
}

/** Public URL of a model hosted in HA's config/www/3dash directory. */
export function haModelUrl(name = 'model'): string {
  return `${haHttpBase()}/local/3dash/${name}.glb`;
}

/**
 * Fetch a model from HA's www directory, using the IndexedDB copy as a cache.
 * HA serves /local/ with a 31-day Cache-Control but honours ETag revalidation,
 * so we bypass the HTTP cache and do our own conditional fetch.
 *
 * Returns the blob, or the cached copy when HA is unreachable (offline-first),
 * or null when neither exists.
 */
export async function fetchModelFromHA(name = 'model'): Promise<Blob | null> {
  const url = haModelUrl(name);
  const cacheKey = `ha:${name}`;
  const cached = await getModel(cacheKey);
  const cachedEtag = cached ? await getMeta(cacheKey) : null;

  try {
    const headers: Record<string, string> = {};
    if (cachedEtag) headers['If-None-Match'] = cachedEtag;
    const resp = await fetch(url, { headers, cache: 'no-cache' });

    if (resp.status === 304 && cached) return cached;
    if (!resp.ok) {
      console.warn(`[haSync] model fetch ${resp.status} for ${url}`);
      return cached; // fall back to cache (e.g. 404 after file removed)
    }
    const blob = await resp.blob();
    await saveModel(blob, cacheKey);
    const etag = resp.headers.get('ETag');
    if (etag) await saveMeta(cacheKey, etag);
    return blob;
  } catch (e) {
    // Network / CORS failure → offline-first fallback
    console.warn('[haSync] model fetch failed, using cache:', e);
    return cached;
  }
}
