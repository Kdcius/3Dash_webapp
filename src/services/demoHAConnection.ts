import type { HAState, LightConfig, LightType } from '../types';
import type { HACallbacks } from './haWebSocket';
import { isSimulationActive } from '../contexts/SimulationModeContext';

const STORAGE_KEY = 'demoLightStates';

function loadPersistedStates(): Record<string, HAState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persistStates(states: Map<string, HAState>): void {
  const obj: Record<string, HAState> = {};
  for (const [id, s] of states) {
    // Only persist light/switch entities, not sensors
    if (id.startsWith('light.') || id.startsWith('switch.')) {
      obj[id] = s;
    }
  }
  if (!isSimulationActive()) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  }
}

/** Random RGB in the blue-to-red range, with even visual distribution. */
function randomBlueToRed(): [number, number, number] {
  // Equal-probability zones so blue and red aren't drowned out by pink/purple
  const zone = Math.random();
  let hue: number;
  if (zone < 0.33)      hue = 240 + Math.random() * 30;  // 240-270: blues
  else if (zone < 0.66) hue = 280 + Math.random() * 40;  // 280-320: purples
  else                  hue = 330 + Math.random() * 30;  // 330-360: reds

  const s = 0.8 + Math.random() * 0.2; // 80-100% saturation
  // HSL to RGB (lightness fixed at 50%)
  const c = s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = 0.5 - c / 2;
  let r = 0, g = 0, b = 0;
  if (hue < 300)      { r = x; g = 0; b = c; }
  else                { r = c; g = 0; b = x; }
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

/** Fluctuation config: base value ± range, with optional decimal places. */
const SENSOR_FLUCTUATION: Record<string, { base: number; range: number; decimals?: number }> = {
  'sensor.temp_hum_sensor_temperature': { base: 21.3, range: 0.4, decimals: 1 },
  'sensor.temp_hum_sensor_humidity': { base: 54, range: 3 },
  'sensor.indoor_temperature': { base: 21.3, range: 0.4, decimals: 1 },
  'sensor.indoor_humidity': { base: 54, range: 3 },
  'sensor.home_power': { base: 1842, range: 200 },
  'sensor.indoor_co2': { base: 623, range: 40 },
  'sensor.download_speed': { base: 45, range: 30, decimals: 1 },
  'sensor.upload_speed': { base: 13, range: 8, decimals: 1 },
  'sensor.water_flow': { base: 3.4, range: 2, decimals: 1 },
};

/**
 * Fake HA connection for demo mode.
 * Maintains light states in localStorage so they survive page reloads.
 */
export class DemoHAConnection {
  private callbacks: HACallbacks;
  private states = new Map<string, HAState>();
  private lightTypes = new Map<string, LightType>();
  private disposed = false;
  private sensorInterval: number | null = null;

  constructor(callbacks: HACallbacks) {
    this.callbacks = callbacks;
  }

  /** Bootstrap demo states from the loaded config entity IDs. */
  start(lightConfigs: LightConfig[], sensorEntityIds: string[]): void {
    if (this.disposed) return;

    const persisted = loadPersistedStates();

    // Store light types and restore persisted states or default to "off"
    for (const lc of lightConfigs) {
      this.lightTypes.set(lc.entityId, lc.type);
      this.states.set(lc.entityId, persisted[lc.entityId] ?? {
        entity_id: lc.entityId,
        state: 'off',
        attributes: { brightness: 0 },
      });
    }

    // Demo sensor values — realistic defaults for common entity IDs
    const sensorDefaults: Record<string, { state: string; attributes: Record<string, unknown> }> = {
      'sensor.temp_hum_sensor_temperature': { state: '21.3', attributes: {} },
      'sensor.temp_hum_sensor_humidity': { state: '54', attributes: {} },
      'sensor.indoor_temperature': { state: '21.3', attributes: {} },
      'sensor.indoor_humidity': { state: '54', attributes: {} },
      'sensor.home_power': { state: '1842', attributes: {} },
      'sensor.indoor_co2': { state: '623', attributes: {} },
      'sensor.download_speed': { state: '45.2', attributes: {} },
      'sensor.upload_speed': { state: '12.8', attributes: {} },
      'sensor.water_flow': { state: '3.4', attributes: {} },
      'climate.thermostat': {
        state: 'heat',
        attributes: {
          temperature: 20,
          current_temperature: 21.3,
          hvac_mode: 'heat',
          min_temp: 7,
          max_temp: 30,
        },
      },
    };
    for (const id of sensorEntityIds) {
      const defaults = sensorDefaults[id];
      this.states.set(id, {
        entity_id: id,
        state: defaults?.state ?? '0',
        attributes: defaults?.attributes ?? {},
      });
    }

    // Periodically fluctuate sensor values so the demo feels alive
    this.sensorInterval = window.setInterval(() => {
      if (this.disposed) return;
      for (const id of sensorEntityIds) {
        const current = this.states.get(id);
        if (!current || id.startsWith('climate.')) continue;
        const cfg = SENSOR_FLUCTUATION[id];
        if (!cfg) continue;
        const base = cfg.base;
        const jitter = (Math.random() - 0.5) * 2 * cfg.range;
        const value = Math.max(0, base + jitter);
        const formatted = cfg.decimals != null
          ? value.toFixed(cfg.decimals)
          : String(Math.round(value));
        this.updateState(id, formatted, current.attributes);
      }
    }, 3000);

    this.callbacks.onStatusChanged?.('connected');
    this.callbacks.onInitialStates?.([...this.states.values()]);
  }

  async callService(
    domain: string,
    service: string,
    entityId: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    if (this.disposed) return;

    // Script calls: simulate 1.5s delay
    if (domain === 'script') {
      await new Promise((r) => setTimeout(r, 1500));
      return;
    }

    // Climate service calls
    if (domain === 'climate') {
      const current = this.states.get(entityId);
      const attrs = { ...(current?.attributes ?? {}) };
      if (service === 'set_temperature' && data?.temperature !== undefined) {
        attrs.temperature = data.temperature;
        this.updateState(entityId, current?.state ?? 'heat', attrs);
      } else if (service === 'set_hvac_mode' && data?.hvac_mode !== undefined) {
        attrs.hvac_mode = data.hvac_mode;
        this.updateState(entityId, data.hvac_mode as string, attrs);
      }
      return;
    }

    const current = this.states.get(entityId);
    const attrs = { ...(current?.attributes ?? {}) };

    if (service === 'toggle') {
      const wasOn = current?.state === 'on';
      if (wasOn) {
        this.updateState(entityId, 'off', { ...attrs, brightness: 0 });
      } else {
        const onAttrs = { ...attrs, brightness: attrs.brightness || 255 };
        const lt = this.lightTypes.get(entityId);
        if (lt === 'rgb' || lt === 'rgbw') {
          onAttrs.rgb_color = randomBlueToRed();
        }
        this.updateState(entityId, 'on', onAttrs);
      }
      return;
    }

    if (service === 'turn_on') {
      if (data?.brightness !== undefined) attrs.brightness = data.brightness as number;
      if (!attrs.brightness) attrs.brightness = 255;
      if (data?.rgb_color !== undefined) attrs.rgb_color = data.rgb_color as [number, number, number];
      if (data?.color_temp !== undefined) attrs.color_temp = data.color_temp as number;
      if (data?.white_value !== undefined) attrs.white_value = data.white_value as number;
      this.updateState(entityId, 'on', attrs);
      return;
    }

    if (service === 'turn_off') {
      this.updateState(entityId, 'off', { ...attrs, brightness: 0 });
      return;
    }
  }

  private updateState(entityId: string, state: string, attributes: Record<string, unknown>): void {
    const newState: HAState = { entity_id: entityId, state, attributes };
    this.states.set(entityId, newState);
    persistStates(this.states);
    this.callbacks.onStateChanged?.(entityId, newState);
  }

  async request(_msg: Record<string, unknown>): Promise<unknown> {
    // Demo mode doesn't support arbitrary WS requests (e.g. history)
    return {};
  }

  get isConnected(): boolean {
    return !this.disposed;
  }

  /** No-op: the demo adapter has no real socket to reconnect. */
  forceReconnect(): void {}

  dispose(): void {
    this.disposed = true;
    if (this.sensorInterval != null) {
      clearInterval(this.sensorInterval);
      this.sensorInterval = null;
    }
    this.states.clear();
  }
}
