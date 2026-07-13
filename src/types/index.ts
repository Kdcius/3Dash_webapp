export interface LightSize {
  diameter?: number;
  width?: number;
  height?: number;
  depth?: number;
}

export interface LightPosition {
  x: number;
  y: number;
  z: number;
}

export type LightType = 'toggle' | 'dimmeable' | 'warmCold' | 'rgb' | 'rgbw' | 'remote';

export interface RemoteButton {
  entityId: string;
  label: string;
  /** Visual group heading in the remote modal (e.g., "Power", "Scenes"). */
  group?: string;
  /** Hex color to render on the 3D light when this mode is active (e.g., "#ef4444"). */
  color?: string;
}

export interface LightPart {
  shape: 'sphere' | 'cube';
  size: LightSize;
  position: LightPosition;
}

export interface HitboxConfig {
  shape: 'sphere' | 'cube';
  size: LightSize;
  /** Hitbox position. If undefined, defaults to the light's position. */
  position?: LightPosition;
}

export interface LightConfig {
  entityId: string;
  label: string;
  type: LightType;
  shape?: 'sphere' | 'cube';
  size?: LightSize;
  position: LightPosition;
  /** Base color temperature in Kelvin (2000-6500). Used as default color for toggle/dimmeable lights. */
  warmth?: number;
  /** Intensity multiplier for the 3D point light (0.1–1000, default 1). Applies to all light types. */
  brightness?: number;
  /** Multiple sub-shapes for this light. When defined, top-level shape/size are ignored. */
  parts?: LightPart[];
  /** Custom hitbox for click detection. If undefined, the bulb mesh is used as the hitbox. */
  hitbox?: HitboxConfig;
  /** Group ID this light belongs to (references LightGroup.id). Undefined = ungrouped. */
  group?: string;
  /** Buttons for 'remote' type lights (IR remote simulation via ESPHome). */
  remoteButtons?: RemoteButton[];
  /** Entity ID of a HA sensor that reports the current mode (e.g., text_sensor from ESPHome). */
  modeEntityId?: string;
  /** Secondary entity ID to toggle on double-tap (e.g., a fan entity attached to a ceiling light). */
  doubleTapEntityId?: string;
}

export interface LightGroup {
  id: string;
  name: string;
}

// --- Shadow Walls (invisible roof / sun blockers) ---

export interface ShadowWallConfig {
  id: string;
  label: string;
  position: LightPosition;
  size: { width: number; height: number; depth: number };
}

// --- Wall Displays ---

export type DisplayAnimation = 'spin' | 'pulse' | 'glow' | 'bounce' | 'flash';

export interface DisplayCondition {
  /** Value to match (e.g., 'heat', 'idle', 'on', 'off'). */
  state: string;
  /** Attribute name to match against instead of entity .state (e.g., 'hvac_action'). */
  attribute?: string;
  /** Text color when this condition matches. */
  color?: string;
  /** Override display label when this condition matches. */
  label?: string;
  /** Lucide icon name to display instead of text (e.g., 'Flame', 'Snowflake', 'Power'). */
  icon?: string;
  /** Override display background color when this condition matches. */
  backgroundColor?: string;
  /** Animation to apply when this condition matches. */
  animation?: DisplayAnimation;
}

export interface DisplaySource {
  entityId: string;
  label?: string;
  unit?: string;
  precision?: number;
  /** Per-source overrides (fall back to display-level defaults). */
  color?: string;
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  /** Conditional styling rules evaluated against entity state. */
  conditions?: DisplayCondition[];
}

export type TextAlign = 'left' | 'center' | 'right';

export interface DisplayConfig {
  id: string;
  label: string;
  sources: DisplaySource[];
  position: LightPosition;
  /** Wall face normal (unit vector) — display faces outward along this direction. */
  normal: LightPosition;
  width: number;
  height: number;
  /** Default font size for sources that don't override it. */
  fontSize?: number;
  /** Default font weight for sources that don't override it. */
  fontWeight?: 'normal' | 'bold';
  /** Default text color for sources that don't override it. */
  color?: string;
  textAlign?: TextAlign;
  backgroundColor?: string;
  opacity?: number;
  /** Mirror the texture horizontally. */
  mirrorH?: boolean;
  /** Mirror the texture vertically. */
  mirrorV?: boolean;
  /** Allow clicking this display to open a detail modal. */
  clickable?: boolean;
  /** Default animation for this display (can be overridden per-condition). */
  animation?: DisplayAnimation;
}

export interface OnboardingState {
  completed: boolean;
}

// --- Zones / Floors ---

/**
 * Controls which meshes of the loaded model are visible while a zone is active.
 * Matching is done against mesh (node) names exported from the modeling tool,
 * e.g. prefix "GF_" for all ground-floor meshes.
 */
export interface ZoneMeshFilter {
  mode: 'include' | 'exclude';
  /** Mesh-name prefixes (case-insensitive). */
  prefixes: string[];
}

/** Camera pose to fly to when a zone is activated. */
export interface ZoneCameraPose {
  alpha: number;
  beta: number;
  radius: number;
  target: { x: number; y: number; z: number };
}

export interface ZoneConfig {
  id: string;
  name: string;
  /** Lucide icon name shown in the zone switcher (e.g. "Home", "Car", "Trees"). */
  icon?: string;
  /**
   * Separate model for this zone, stored in IndexedDB under this key
   * (and optionally mirrored to HA at /local/3dash/<modelKey>.glb).
   * When undefined, the zone uses the main model with `meshFilter` applied.
   */
  modelKey?: string;
  /** Visibility filter applied to the main model when this zone is active. */
  meshFilter?: ZoneMeshFilter;
  /** Optional camera pose to animate to when switching to this zone. */
  cameraPose?: ZoneCameraPose | null;
}

export interface AppConfig {
  location: {
    latitude: number;
    longitude: number;
    /** Clockwise rotation offset (degrees) from model north to true north. */
    northOffset?: number;
  };
  lights: LightConfig[];
  lightGroups?: LightGroup[];
  displays?: DisplayConfig[];
  shadowWalls?: ShadowWallConfig[];
  sidePanel?: SidePanelConfig;
  tubes?: TubeConfig[];
  onboarding?: OnboardingState;
  /** Multi-floor / area definitions. Empty or undefined = single-zone mode. */
  zones?: ZoneConfig[];
  /** Currently selected zone (persists across sessions/devices). */
  activeZoneId?: string;
  /** Last-modified timestamp (ms epoch) used for cross-device sync conflict resolution. */
  updatedAt?: number;
}

export interface HASettings {
  url: string;
  port: number;
  token: string;
}

export interface FullConfig {
  location: {
    latitude: number;
    longitude: number;
    northOffset?: number;
  };
  lights: LightConfig[];
  lightGroups?: LightGroup[];
  displays?: DisplayConfig[];
  shadowWalls?: ShadowWallConfig[];
  sidePanel?: SidePanelConfig;
  tubes?: TubeConfig[];
  onboarding?: OnboardingState;
}

export interface HAStateAttributes {
  brightness?: number;
  color_temp?: number;
  rgb_color?: [number, number, number];
  white_value?: number;
  [key: string]: unknown;
}

export interface HAState {
  entity_id: string;
  state: string;
  attributes: HAStateAttributes;
}

// --- Network Speed Tubes ---

export type TubeOriginDirection = 'top' | 'bottom' | 'left' | 'right';

/** Unit the HA sensor reports its value in. Lowercase = bits, uppercase = bytes. */
export type TubeInputUnit = 'b' | 'kb' | 'mb' | 'gb' | 'tb' | 'B' | 'kB' | 'mB' | 'gB' | 'tB';

export interface TubeLineConfig {
  /** HA sensor entity ID (e.g. sensor.freebox_download_speed). */
  sensorId: string;
  /** Hex color for this tube line (e.g. "#00aaff"). */
  color: string;
  /** Optional Lucide icon name displayed before the label (e.g. "Wifi", "Droplet"). */
  icon?: string;
  /** Unit the sensor value is reported in (default: "b" = bits). Only used in speed mode. */
  inputUnit?: TubeInputUnit;
  /** Display in bytes instead of bits (default: false = bits). Only used in speed mode. */
  displayBytes?: boolean;
  /** Custom display unit (e.g. "W", "L", "m³", "L/min"). When set, bypasses speed formatting
   *  and uses generic SI auto-scaling instead. */
  displayUnit?: string;
  /** Number of decimal places for the displayed value (default: 1 for generic, auto for speed). */
  precision?: number;
  /** Enable animated particles flowing inside the tube (default: false). */
  particles?: boolean;
  /** Direction particles flow: 'inward' toward building, 'outward' away (default: 'inward'). */
  particleDirection?: 'inward' | 'outward';
  /** Speed multiplier for particles (0.1–5, default: 1). */
  particleSpeed?: number;
  /** Sensor value (in input unit) at which particles reach max speed (default: 1000). */
  particleMaxValue?: number;
}

export interface TubeConfig {
  id: string;
  label: string;
  /** Origin direction relative to home view. */
  originDirection: TubeOriginDirection;
  /** Tube diameter in world units. */
  diameter: number;
  /** Font size for the floating sensor value label. */
  fontSize: number;
  /** Gap between parallel tube lines. */
  gap: number;
  /** X position of the tube endpoint (after the right angle). */
  endX: number;
  /** Z position of the tube endpoint (after the right angle). */
  endZ: number;
  /** Label position along the horizontal tube segment (0 = edge, 1 = corner). */
  labelPosition: number;
  /** Height of the label above the tube (world units). */
  labelHeight: number;
  /** Individual tube lines within this group. */
  lines: TubeLineConfig[];
}

// --- Side Panel ---

export interface CardLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface BaseCard {
  id: string;
  title: string;
  showTitle?: boolean;
  layout: CardLayout;
}

export interface ScriptCard extends BaseCard {
  type: 'script';
  entityId: string;
  icon?: string;
  longPressEntityId?: string;
  doublePressEntityId?: string;
}

export interface IndicatorCard extends BaseCard {
  type: 'indicator';
  entityId: string;
  unit?: string;
  precision?: number;
  icon?: string;
  /** Optional climate entity to show heating controls in the indicator modal. */
  climateEntityId?: string;
}

export interface GraphCard extends BaseCard {
  type: 'graph';
  entityId: string;
  period: string;
  refreshInterval?: number;
}

export type SidePanelCard = ScriptCard | IndicatorCard | GraphCard;

export interface SidePanelConfig {
  columns?: number;
  rowHeight?: number;
  cards: SidePanelCard[];
}

export interface HAHistoryPoint {
  state: string;
  last_changed: string;
}
