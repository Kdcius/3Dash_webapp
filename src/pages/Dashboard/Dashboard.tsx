import { useRef, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Animation, Camera, Color3, Color4, CubicEase, EasingFunction, ShadowGenerator, Tools, Vector3, type AbstractMesh, type Mesh, type Observer, type Scene } from '@babylonjs/core';
import { createScene, setupSunShadows, type SceneContext } from '../../babylon/SceneManager';
import { loadModel, createShadowWalls, setTexturesEnabled, setSketchAppearance } from '../../babylon/ModelLoader';
import { createEdgeOutline, type EdgeOutlineControls } from '../../babylon/EdgeOutline';
import {
  createLightMesh,
  removeLightMesh,
  freezePointLightShadows,
  type MeshMap,
  type StripConfig,
} from '../../babylon/LightMeshFactory';
import {
  createDisplayMesh,
  removeDisplayMesh,
  updateDisplayTexture,
  resolveDisplayAnimation,
  setDisplayAnimation,
  type DisplayMeshMap,
} from '../../babylon/DisplayMeshFactory';
import { getConfig, updateConfig, getModelBlob } from '../../services/configApi';
import { getSetting, updateSettings, type HomeViewPose } from '../../services/settingsStore';
import { HAConnection, type HAConnectionStatus, type HALike, setActiveHAConnection } from '../../services/haWebSocket';
import { DemoHAConnection } from '../../services/demoHAConnection';
import { useDemoMode } from '../../contexts/DemoModeContext';
import { useSimulationMode } from '../../contexts/SimulationModeContext';
import { useCameraControls } from '../../contexts/CameraControlsContext';
import { useTheme } from '../../contexts/ThemeContext';
import { miredToKelvin, kelvinToRGB } from '../../utils/color';
import { updateSunPosition, minutesToLabel } from '../../babylon/SunController';
import { createWeatherEffects, type WeatherEffectsContext } from '../../babylon/WeatherEffects';
import { fetchWeather, type WeatherData } from '../../services/weatherApi';
import { showGroundGrid, hideGroundGrid, syncGridColors, disposeGroundGrid, createModelShadow } from '../../babylon/GroundGrid';
import { createTubeMeshes, updateTubeValue, disposeAllTubes, setTubeTheme, type TubeMap } from '../../babylon/TubeMeshFactory';
import HUD from '../../components/HUD';
import LightModal from '../../components/LightModal';
import RemoteModal from '../../components/RemoteModal';
import DisplayModal from '../../components/DisplayModal';
import DebugPanel from '../../components/DebugPanel';
import SidePanel from '../../components/SidePanel/SidePanel';
import SettingsModal from '../../components/SettingsModal';
import GuidedTour from '../../components/GuidedTour/GuidedTour';
import { dashboardTourSteps } from '../../components/GuidedTour/tourSteps';
import CardPropertiesPanel from '../../components/SidePanel/CardPropertiesPanel';
import { SIMULATION_CONFIG, SIMULATION_MODEL_URL } from '../../data/simulationData';
import type { AppConfig, DisplayConfig, LightConfig, RemoteButton, HAState, CardLayout, SidePanelCard } from '../../types';
import './Dashboard.css';

const LONG_PRESS_MS = 500;

export default function Dashboard() {
  const { demoMode } = useDemoMode();
  const { simulationMode, setSimulationMode } = useSimulationMode();
  const camControls = useCameraControls();
  const { resolved: theme, updateAutoTheme } = useTheme();
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneCtxRef = useRef<SceneContext | null>(null);
  const meshMapRef = useRef<MeshMap>({});
  const displayMeshMapRef = useRef<DisplayMeshMap>({});
  const tubeMapRef = useRef<TubeMap>({});
  const haRef = useRef<HALike | null>(null);
  const configRef = useRef<AppConfig | null>(null);
  const lastStatesRef = useRef<Record<string, HAState>>({});
  const pendingRef = useRef<Map<string, {
    observer: Observer<Scene>;
    meshes: Mesh[];
    state: { error: boolean };
    timer?: ReturnType<typeof setTimeout>;
  }>>(new Map());
  const [sceneReady, setSceneReady] = useState(false);

  const [lightsOnCount, setLightsOnCount] = useState(0);
  const [haStatus, setHaStatus] = useState<HAConnectionStatus>('disconnected');
  const [haSettingsVersion, setHaSettingsVersion] = useState(0);
  const [modelStatus, setModelStatus] = useState('loading');
  const [modelStatusColor, setModelStatusColor] = useState<string | undefined>(undefined);

  const [modalVisible, setModalVisible] = useState(false);
  const [modalEntityId, setModalEntityId] = useState<string | null>(null);
  const [modalLabel, setModalLabel] = useState('');
  const [modalLightType, setModalLightType] = useState<LightConfig['type']>('toggle');
  const [modalState, setModalState] = useState<HAState | null>(null);
  const [modalDoubleTapEntityId, setModalDoubleTapEntityId] = useState<string | undefined>();
  const [modalDoubleTapState, setModalDoubleTapState] = useState<HAState | null>(null);

  const [remoteModalVisible, setRemoteModalVisible] = useState(false);
  const [remoteModalEntityId, setRemoteModalEntityId] = useState<string | null>(null);
  const [remoteModalLabel, setRemoteModalLabel] = useState('');
  const [remoteModalButtons, setRemoteModalButtons] = useState<RemoteButton[]>([]);
  const [remoteModalState, setRemoteModalState] = useState<HAState | null>(null);

  const [displayModalVisible, setDisplayModalVisible] = useState(false);
  const [displayModalConfig, setDisplayModalConfig] = useState<DisplayConfig | null>(null);
  const [displayModalStates, setDisplayModalStates] = useState<Record<string, HAState>>({});

  const [defaultTarget, setDefaultTarget] = useState<{ x: number; y: number; z: number } | null>(null);
  const modelSizeRef = useRef<{ x: number; z: number } | null>(null);
  const modelDiagonalRef = useRef(1);
  const [debugOpen, setDebugOpen] = useState(false);
  const [homeViewSetting, setHomeViewSetting] = useState(false);
  const [panelSize, setPanelSize] = useState(() => {
    const mobile = window.matchMedia('(max-width: 768px)').matches;
    const saved = getSetting('misc').panelRatio;
    if (saved !== null) {
      return mobile ? window.innerHeight * saved : window.innerWidth * saved;
    }
    return mobile ? 280 : 350;
  });

  const handlePanelResize = useCallback((size: number) => {
    setPanelSize(size);
    const mobile = window.matchMedia('(max-width: 768px)').matches;
    const ratio = mobile ? size / window.innerHeight : size / window.innerWidth;
    updateSettings('misc', { panelRatio: ratio });
  }, []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cardStates, setCardStates] = useState<Record<string, HAState>>({});
  const [gridEditMode, setGridEditMode] = useState(false);
  const [cardPanelOpen, setCardPanelOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<SidePanelCard | null>(null);
  const [sidePanelConfig, setSidePanelConfig] = useState<import('../../types').SidePanelConfig | undefined>(undefined);
  const [showTour, setShowTour] = useState(
    () => localStorage.getItem('showTour') === 'true',
  );

  useEffect(() => {
    if (showTour) localStorage.removeItem('showTour');
  }, [showTour]);
  const modelMeshesRef = useRef<AbstractMesh[]>([]);
  const shadowCastersRef = useRef<AbstractMesh[]>([]);
  const edgeOutlineRef = useRef<EdgeOutlineControls | null>(null);
  const weatherRef = useRef<WeatherEffectsContext | null>(null);
  const pollWeatherRef = useRef<() => void>(() => {});
  const cloudCoverFactorRef = useRef(1);
  const [cloudCoverFactor, setCloudCoverFactor] = useState(1);
  const [currentWeather, setCurrentWeather] = useState<WeatherData | null>(null);

  // Sun / edge state (lifted here so both HUD and SettingsModal can use it)
  const [sunLiveMode, setSunLiveMode] = useState(true);
  const [sliderValue, setSliderValue] = useState(720);
  const [scrubberTime, setScrubberTime] = useState('12:00');
  const [edgeWidth, setEdgeWidth] = useState(() => getSetting('render').edgeWidth);
  const [edgeMode, setEdgeMode] = useState<'classic' | 'enhanced'>(() => getSetting('render').edgeMode);
  const [northOffset, setNorthOffset] = useState(0);
  const [groundGrid, setGroundGrid] = useState(() => getSetting('render').groundGrid);
  const [weatherEnabled, setWeatherEnabled] = useState(() => getSetting('environment').weatherEnabled);
  const weatherEnabledRef = useRef(weatherEnabled);
  weatherEnabledRef.current = weatherEnabled;
  const [perspective, setPerspective] = useState(() => getSetting('render').perspective);
  const [sunShadowRes, setSunShadowRes] = useState(() => getSetting('render').sunShadowRes);
  const [pointShadowRes, setPointShadowRes] = useState(() => getSetting('render').pointShadowRes);
  const [showTextures, setShowTextures] = useState(() => getSetting('render').showTextures);
  const [sketchColor, setSketchColor] = useState(() => getSetting('render').sketchColor);
  const [sketchSpecular, setSketchSpecular] = useState(() => getSetting('render').sketchSpecular);

  // Sync 3D background with theme (respects custom bgColor)
  const syncSceneBg = useCallback(() => {
    const scene = sceneCtxRef.current?.scene;
    if (!scene) return;
    const customBg = getSetting('appearance').bgColor;
    if (customBg) {
      const n = parseInt(customBg.replace('#', ''), 16);
      scene.clearColor = new Color4(
        ((n >> 16) & 255) / 255,
        ((n >> 8) & 255) / 255,
        (n & 255) / 255,
        1,
      );
    } else {
      scene.clearColor = theme === 'light'
        ? new Color4(0.94, 0.95, 0.96, 1)
        : new Color4(0.04, 0.055, 0.1, 1);
    }
  }, [theme]);

  useEffect(() => {
    syncSceneBg();
    setTubeTheme(tubeMapRef.current, theme);
  }, [theme, sceneReady, syncSceneBg]);

  // Listen for real-time appearance changes (e.g. bgColor picker)
  useEffect(() => {
    const handler = () => syncSceneBg();
    window.addEventListener('appearance-changed', handler);
    return () => window.removeEventListener('appearance-changed', handler);
  }, [syncSceneBg]);

  // Sync ground grid colors when theme changes
  useEffect(() => {
    const scene = sceneCtxRef.current?.scene;
    if (!scene || !groundGrid) return;
    syncGridColors(scene);
  }, [theme, sceneReady, groundGrid]);

  // Show/hide ground grid
  const handleGroundGridChange = useCallback((enabled: boolean) => {
    setGroundGrid(enabled);
    updateSettings('render', { groundGrid: enabled });
    const scene = sceneCtxRef.current?.scene;
    if (!scene) return;
    if (enabled) showGroundGrid(scene);
    else hideGroundGrid();
  }, []);

  const handleWeatherEnabledChange = useCallback((enabled: boolean) => {
    setWeatherEnabled(enabled);
    weatherEnabledRef.current = enabled;
    updateSettings('environment', { weatherEnabled: enabled });
    if (enabled) {
      // Immediately fetch and apply weather
      pollWeatherRef.current();
    } else {
      // Stop particles and reset cloud cover
      weatherRef.current?.updateWeather(
        { weather_code: 0, cloud_cover: 0, rain: 0, snowfall: 0 },
      );
      cloudCoverFactorRef.current = 1;
      setCloudCoverFactor(1);
      // Re-apply sun without cloud dimming
      const ctx = sceneCtxRef.current;
      if (ctx?.sunLight && ctx?.hemiLight) {
        const lat = configRef.current?.location.latitude ?? 43.6077;
        const lng = configRef.current?.location.longitude ?? 3.8766;
        const mins = sunLiveMode ? undefined : sliderValue;
        updateSunPosition(ctx.sunLight, ctx.hemiLight, lat, lng, mins, northOffsetRef.current, 1);
      }
    }
  }, [sunLiveMode, sliderValue]);

  // Toggle perspective / orthographic camera mode
  const handlePerspectiveChange = useCallback((enabled: boolean) => {
    setPerspective(enabled);
    updateSettings('render', { perspective: enabled });
  }, []);

  const handleSunShadowResChange = useCallback((res: number) => {
    setSunShadowRes(res);
    updateSettings('render', { sunShadowRes: res });
    const ctx = sceneCtxRef.current;
    const casters = shadowCastersRef.current;
    if (!ctx || !casters) return;
    const oldSg = ctx.sunLight.getShadowGenerator();
    if (oldSg) oldSg.dispose();
    if (res === 0) return;
    const sg = new ShadowGenerator(res, ctx.sunLight);
    sg.usePercentageCloserFiltering = true;
    sg.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
    sg.bias = 0.001;
    sg.normalBias = 0.02;
    for (const mesh of casters) sg.addShadowCaster(mesh, false);
  }, []);

  const handlePointShadowResChange = useCallback((res: number) => {
    setPointShadowRes(res);
    updateSettings('render', { pointShadowRes: res });
    const map = meshMapRef.current;
    const casters = shadowCastersRef.current;
    if (!casters) return;
    for (const key of Object.keys(map)) {
      const entry = map[key];
      if (!entry.shadowGen) continue;
      const light = entry.shadowGen.getLight();
      entry.shadowGen.dispose();
      if (res === 0) { entry.shadowGen = undefined; continue; }
      const sg = new ShadowGenerator(res, light);
      sg.usePercentageCloserFiltering = true;
      sg.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
      sg.bias = 0;
      sg.normalBias = 0.05;
      for (const mesh of casters) sg.addShadowCaster(mesh, false);
      entry.shadowGen = sg;
    }
    // Re-freeze shadow maps
    freezePointLightShadows(meshMapRef.current);
  }, []);

  // Apply perspective mode to the camera
  useEffect(() => {
    const camera = sceneCtxRef.current?.camera;
    const engine = sceneCtxRef.current?.engine;
    const scene = sceneCtxRef.current?.scene;
    if (!camera || !engine || !scene) return;

    if (perspective) {
      camera.mode = Camera.PERSPECTIVE_CAMERA;
    } else {
      camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
      const updateOrtho = () => {
        const aspect = engine.getAspectRatio(camera);
        const halfHeight = camera.radius * Math.tan(camera.fov / 2);
        camera.orthoTop = halfHeight;
        camera.orthoBottom = -halfHeight;
        camera.orthoLeft = -halfHeight * aspect;
        camera.orthoRight = halfHeight * aspect;
      };
      updateOrtho();
      const obs = scene.onBeforeRenderObservable.add(updateOrtho);
      return () => { scene.onBeforeRenderObservable.remove(obs); };
    }
  }, [perspective, sceneReady]);

  // Compute camera radius so the model fills 90% of the smallest canvas dimension.
  // At alpha=270° top-down: model Z → screen height, model X → screen width.
  const computeIdealRadius = useCallback(() => {
    const canvas = canvasRef.current;
    const ms = modelSizeRef.current;
    const camera = sceneCtxRef.current?.camera;
    if (!canvas || !ms || !camera) return modelDiagonalRef.current * 1.6;

    const fov = camera.fov; // vertical FOV in radians
    const aspect = canvas.clientWidth / canvas.clientHeight;

    // Visible extents at target plane:
    //   visibleHeight = 2 * radius * tan(fov/2)
    //   visibleWidth  = visibleHeight * aspect
    const radiusForHeight = (ms.z / 2) / (Math.tan(fov / 2) * 0.75);
    const radiusForWidth = (ms.x / 2) / (Math.tan(fov / 2) * aspect * 0.75);

    return Math.max(radiusForHeight, radiusForWidth);
  }, []);

  const northOffsetRef = useRef(northOffset);
  northOffsetRef.current = northOffset;

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const mins = parseInt(e.target.value);
      setSunLiveMode(false);
      setSliderValue(mins);
      setScrubberTime(minutesToLabel(mins));
      const ctx = sceneCtxRef.current;
      if (ctx?.sunLight && ctx?.hemiLight) {
        const lat = configRef.current?.location.latitude ?? 43.6077;
        const lng = configRef.current?.location.longitude ?? 3.8766;
        updateSunPosition(ctx.sunLight, ctx.hemiLight, lat, lng, mins, northOffsetRef.current, cloudCoverFactorRef.current);
      }
      updateAutoTheme(mins);
    },
    [updateAutoTheme],
  );

  const handleLiveClick = useCallback(() => {
    setSunLiveMode(true);
    const ctx = sceneCtxRef.current;
    if (ctx?.sunLight && ctx?.hemiLight) {
      const now = new Date();
      const liveMin = now.getHours() * 60 + now.getMinutes();
      setSliderValue(liveMin);
      setScrubberTime(minutesToLabel(liveMin));
      const lat = configRef.current?.location.latitude ?? 43.6077;
      const lng = configRef.current?.location.longitude ?? 3.8766;
      updateSunPosition(ctx.sunLight, ctx.hemiLight, lat, lng, undefined, northOffsetRef.current, cloudCoverFactorRef.current);
    }
  }, []);

  const northSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleNorthOffsetChange = useCallback((degrees: number) => {
    setNorthOffset(degrees);
    northOffsetRef.current = degrees;
    // Immediately update sun
    const ctx = sceneCtxRef.current;
    if (ctx?.sunLight && ctx?.hemiLight) {
      const lat = configRef.current?.location.latitude ?? 43.6077;
      const lng = configRef.current?.location.longitude ?? 3.8766;
      const mins = sunLiveMode ? undefined : sliderValue;
      updateSunPosition(ctx.sunLight, ctx.hemiLight, lat, lng, mins, degrees, cloudCoverFactorRef.current);
    }
    // Debounced save to config
    if (northSaveTimerRef.current) clearTimeout(northSaveTimerRef.current);
    northSaveTimerRef.current = setTimeout(() => {
      const loc = configRef.current?.location;
      if (loc) {
        const updatedLocation = { ...loc, northOffset: degrees };
        if (configRef.current) configRef.current.location = updatedLocation;
        try { updateConfig({ location: updatedLocation }); } catch (err) {
          console.warn('[Config] Failed to save north offset:', err);
        }
      }
    }, 400);
  }, [sunLiveMode, sliderValue]);

  const handleEdgeModeChange = useCallback((mode: 'classic' | 'enhanced') => {
    setEdgeMode(mode);
    updateSettings('render', { edgeMode: mode });
    edgeOutlineRef.current?.setEnabled(mode === 'enhanced' && !showTextures);
  }, [showTextures]);

  const handleEdgeWidthChange = useCallback((width: number) => {
    setEdgeWidth(width);
    updateSettings('render', { edgeWidth: width });
    for (const mesh of modelMeshesRef.current) {
      mesh.edgesWidth = width;
    }
  }, []);

  const handleShowTexturesChange = useCallback((enabled: boolean) => {
    setShowTextures(enabled);
    updateSettings('render', { showTextures: enabled });
    const scene = sceneCtxRef.current?.scene;
    if (!scene) return;
    setTexturesEnabled(scene, modelMeshesRef.current, enabled, edgeWidth);
    edgeOutlineRef.current?.setEnabled(!enabled && edgeMode === 'enhanced');
  }, [edgeWidth, edgeMode]);

  const handleSketchColorChange = useCallback((color: string) => {
    setSketchColor(color);
    updateSettings('render', { sketchColor: color });
    const scene = sceneCtxRef.current?.scene;
    if (!scene) return;
    setSketchAppearance(scene, color, getSetting('render').sketchSpecular);
  }, []);

  const handleSketchSpecularChange = useCallback((value: number) => {
    setSketchSpecular(value);
    updateSettings('render', { sketchSpecular: value });
    const scene = sceneCtxRef.current?.scene;
    if (!scene) return;
    setSketchAppearance(scene, getSetting('render').sketchColor, value);
  }, []);

  // Count lights that are on
  const updateLightsOnCount = useCallback(() => {
    const meshMap = meshMapRef.current;
    let count = 0;
    for (const key of Object.keys(meshMap)) {
      if (meshMap[key].light && meshMap[key].light!.intensity > 0) count++;
    }
    setLightsOnCount(count);
  }, []);

  // Parse hex color string to Color3
  const hexToColor3 = useCallback((hex: string) => {
    const h = hex.replace('#', '');
    const r = parseInt(h.substring(0, 2), 16) / 255;
    const g = parseInt(h.substring(2, 4), 16) / 255;
    const b = parseInt(h.substring(4, 6), 16) / 255;
    return new Color3(r, g, b);
  }, []);

  // Apply a remote mode color to a light mesh (called when mode sensor changes)
  const applyRemoteMode = useCallback(
    (lightEntityId: string, mode: string) => {
      const entry = meshMapRef.current[lightEntityId];
      if (!entry || !entry.light) return;

      const cfg = configRef.current?.lights.find((l) => l.entityId === lightEntityId);
      if (!cfg?.remoteButtons) return;

      // Find the button whose entityId ends with _<mode>
      const modeLower = mode.toLowerCase();
      const btn = cfg.remoteButtons.find((b) =>
        b.entityId.endsWith('_' + modeLower),
      );
      if (!btn?.color) return;

      // Only apply color if the light is currently on
      const switchState = lastStatesRef.current[lightEntityId];
      if (!switchState || switchState.state !== 'on') return;

      const col = hexToColor3(btn.color);
      const multiplier = cfg.brightness ?? 1;
      const { stripLights } = entry;
      const allLights = stripLights.length > 0 ? stripLights : (entry.light ? [entry.light] : []);

      for (const pl of allLights) {
        pl.diffuse = col;
      }
      entry.mat.emissiveColor = new Color3(
        col.r * multiplier,
        col.g * multiplier,
        col.b * multiplier,
      ).clampToRef(0, 1, entry.mat.emissiveColor);
    },
    [hexToColor3],
  );

  // Apply HA state to a light mesh (handles single lights and strip sub-lights)
  const applyLightState = useCallback(
    (entityId: string, state: HAState) => {
      lastStatesRef.current[entityId] = state;
      const entry = meshMapRef.current[entityId];
      if (!entry || !entry.light) return;

      const { mat, stripLights } = entry;
      const isOn = state.state === 'on';
      const attrs = state.attributes || {};

      // Collect all point lights for this entry (primary + strip sub-lights)
      const allLights = stripLights.length > 0 ? stripLights : (entry.light ? [entry.light] : []);
      const isStrip = stripLights.length > 0;

      if (!isOn) {
        for (const pl of allLights) {
          pl.intensity = 0;
          pl.setEnabled(false);
        }
        mat.emissiveColor = new Color3(0, 0, 0);
        updateLightsOnCount();
        return;
      }

      for (const pl of allLights) pl.setEnabled(true);

      const cfg = configRef.current?.lights.find((l) => l.entityId === entityId);
      const haBrightness = (attrs.brightness ?? 255) / 255;
      const multiplier = cfg?.brightness ?? 1;
      // Strip sub-lights share the total intensity; single lights get full intensity
      const perLightIntensity = isStrip
        ? (haBrightness * 0.8 * multiplier) / allLights.length
        : haBrightness * 0.8 * multiplier;

      // Determine color: remote mode > HA rgb_color > HA color_temp > config warmth > default warm white
      let col = new Color3(1, 0.9, 0.7);

      // For remote lights, check the mode sensor for current color
      let usedRemoteColor = false;
      if (cfg?.type === 'remote' && cfg.modeEntityId) {
        const modeState = lastStatesRef.current[cfg.modeEntityId];
        if (modeState?.state && modeState.state !== 'unknown' && modeState.state !== 'unavailable') {
          const modeLower = modeState.state.toLowerCase();
          const btn = cfg.remoteButtons?.find((b) =>
            b.entityId.endsWith('_' + modeLower),
          );
          if (btn?.color) {
            col = hexToColor3(btn.color);
            usedRemoteColor = true;
          }
        }
      }

      if (!usedRemoteColor) {
        if (attrs.rgb_color) {
          const [r, g, b] = attrs.rgb_color;
          col = new Color3(r / 255, g / 255, b / 255);
        } else if (attrs.color_temp) {
          const rgb = kelvinToRGB(miredToKelvin(attrs.color_temp));
          col = new Color3(rgb.r, rgb.g, rgb.b);
        } else if (cfg?.warmth) {
          const rgb = kelvinToRGB(cfg.warmth);
          col = new Color3(rgb.r, rgb.g, rgb.b);
        }
      }

      for (const pl of allLights) {
        pl.intensity = perLightIntensity;
        pl.diffuse = col;
      }

      mat.emissiveColor = new Color3(
        col.r * haBrightness,
        col.g * haBrightness,
        col.b * haBrightness,
      );

      updateLightsOnCount();
    },
    [updateLightsOnCount],
  );

  // ── Pending-command highlight feedback ──────────────────────────
  const PENDING_COLOR = new Color3(0, 0.8, 1);   // cyan
  const ERROR_COLOR = new Color3(1, 0.15, 0.1);  // red
  const PULSE_SPEED = 0.06;
  const ERROR_BLINK_SPEED = 0.15;
  const ERROR_DISPLAY_MS = 1500;
  const PENDING_TIMEOUT_MS = 5000; // safety: auto-error if no state change

  const stopPendingFeedback = useCallback((entityId: string) => {
    const ctx = sceneCtxRef.current;
    const hl = ctx?.highlightLayer;
    const pending = pendingRef.current.get(entityId);
    if (!hl || !pending) return;

    if (pending.timer) clearTimeout(pending.timer);
    for (const m of pending.meshes) hl.removeMesh(m);
    ctx.scene.onBeforeRenderObservable.remove(pending.observer);
    pendingRef.current.delete(entityId);

    // Reset blur if no more pending
    if (pendingRef.current.size === 0) {
      hl.blurHorizontalSize = 1;
      hl.blurVerticalSize = 1;
    }
  }, []);

  const showErrorFeedback = useCallback((entityId: string) => {
    const ctx = sceneCtxRef.current;
    const hl = ctx?.highlightLayer;
    const pending = pendingRef.current.get(entityId);
    if (!hl || !pending) return;

    // Switch color to red and flag error mode
    if (pending.timer) clearTimeout(pending.timer);
    pending.state.error = true;
    for (const m of pending.meshes) {
      hl.removeMesh(m);
      hl.addMesh(m, ERROR_COLOR);
    }

    // Auto-clear after a short delay
    pending.timer = setTimeout(() => stopPendingFeedback(entityId), ERROR_DISPLAY_MS);
  }, [stopPendingFeedback]);

  const startPendingFeedback = useCallback((entityId: string) => {
    const ctx = sceneCtxRef.current;
    const hl = ctx?.highlightLayer;
    if (!hl) return;
    // Already pending — skip
    if (pendingRef.current.has(entityId)) return;

    const entry = meshMapRef.current[entityId];
    if (!entry) return;

    const meshes = [entry.bulb, ...entry.extraBulbs].filter(Boolean) as Mesh[];
    for (const m of meshes) hl.addMesh(m, PENDING_COLOR);

    let t = 0;
    const state = { error: false };
    const observer = ctx.scene.onBeforeRenderObservable.add(() => {
      t += state.error ? ERROR_BLINK_SPEED : PULSE_SPEED;
      if (state.error) {
        // Hard on/off blink for error
        const on = Math.sin(t) > 0;
        hl.blurHorizontalSize = on ? 1.5 : 0.2;
        hl.blurVerticalSize = on ? 1.5 : 0.2;
      } else {
        const v = 0.4 + 1.0 * Math.abs(Math.sin(t));
        hl.blurHorizontalSize = v;
        hl.blurVerticalSize = v;
      }
    });

    // Safety timeout: if no state change arrives, show error
    const timer = setTimeout(() => showErrorFeedback(entityId), PENDING_TIMEOUT_MS);

    pendingRef.current.set(entityId, { observer: observer!, meshes, state, timer });
  }, [showErrorFeedback]);

  // Initialize everything
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    let weatherIntervalRef: ReturnType<typeof setInterval> | null = null;
    const ctx = createScene(canvas, { enableGlow: true });
    sceneCtxRef.current = ctx;

    let pressTimer: ReturnType<typeof setTimeout> | null = null;
    let pressedEntity: string | null = null;
    let pressStartX = 0;
    let pressStartY = 0;
    const MOVE_THRESHOLD = 10; // px – ignore small finger jitter on touch

    // Double-tap detection
    const DOUBLE_TAP_MS = 300;
    let singleTapTimer: ReturnType<typeof setTimeout> | null = null;
    let lastTapEntity: string | null = null;

    async function init() {
      // Load config
      if (simulationMode) {
        configRef.current = SIMULATION_CONFIG;
        setSidePanelConfig(SIMULATION_CONFIG.sidePanel);
      } else {
        try {
          const config = await getConfig();
          if (disposed) return;
          configRef.current = config;
          setSidePanelConfig(config.sidePanel);
          if (config.location.northOffset !== undefined) setNorthOffset(config.location.northOffset);
        } catch (e) {
          console.warn('[Config] Failed to load:', e);
          configRef.current = { location: { latitude: 43.6077, longitude: 3.8766 }, lights: [] };
        }
      }
      // HA settings now live exclusively in the settings store
      if (disposed) return;

      // Load 3D model
      let modelBlob: Blob | null;
      if (simulationMode) {
        try {
          const resp = await fetch(SIMULATION_MODEL_URL);
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          modelBlob = await resp.blob();
        } catch (e) {
          console.error('[Simulation] Failed to load model:', e);
          setModelStatus('failed');
          setModelStatusColor('var(--red)');
          return;
        }
      } else {
        modelBlob = await getModelBlob();
      }
      if (!modelBlob) {
        navigate('/onboarding');
        return;
      }
      try {
        const renderAtLoad = getSetting('render');
        const showTexturesAtLoad = renderAtLoad.showTextures;
        const result = await loadModel(ctx.scene, modelBlob, undefined, {
          showTextures: showTexturesAtLoad,
          sketchColor: renderAtLoad.sketchColor,
          sketchSpecular: renderAtLoad.sketchSpecular,
        });
        if (disposed) return;

        // Target the horizontal center at floor level for top-down view
        const target = result.center.clone();
        target.y = 0;
        ctx.camera.target = target;
        ctx.camera.alpha = Tools.ToRadians(270);
        ctx.camera.beta = Tools.ToRadians(0.5);
        ctx.camera.lowerRadiusLimit = result.diagonal * 0.27;
        ctx.camera.upperRadiusLimit = result.diagonal * 5;

        modelSizeRef.current = { x: result.size.x, z: result.size.z };
        modelDiagonalRef.current = result.diagonal;
        ctx.camera.radius = computeIdealRadius();

        createModelShadow(ctx.scene, result.center, result.size);

        setDefaultTarget({ x: target.x, y: 0, z: target.z });

        modelMeshesRef.current = result.meshes.filter(
          (m) => m.getTotalVertices?.() > 0,
        );

        // Apply persisted edge width to model meshes (ModelLoader defaults to 3)
        {
          const w = getSetting('render').edgeWidth;
          for (const mesh of modelMeshesRef.current) mesh.edgesWidth = w;
        }

        // Screen-space edge detection for inner corners (only on model meshes, not lights)
        edgeOutlineRef.current = createEdgeOutline(ctx.scene, ctx.camera, {
          meshes: modelMeshesRef.current,
        });

        // Disable post-process if edge mode is classic or textures are shown
        if (getSetting('render').edgeMode === 'classic' || showTexturesAtLoad) {
          edgeOutlineRef.current.setEnabled(false);
        }

        setModelStatus('ready');
        setModelStatusColor('var(--green)');

        // Create invisible shadow wall meshes from config
        const wallMeshes = createShadowWalls(ctx.scene, configRef.current?.shadowWalls || []);
        const allCasters = [...result.shadowCasters, ...wallMeshes];

        shadowCastersRef.current = allCasters;

        // Setup sun shadows with model geometry + shadow walls
        const sunShadowGen = setupSunShadows(ctx, allCasters, result.diagonal, getSetting('render').sunShadowRes);

        // Create light meshes with shadow-casting PointLights
        // Cap point-light shadow generators to avoid VRAM exhaustion
        // (each cube shadow map = 6 × 2048² ≈ 100 MB)
        const MAX_POINT_SHADOWS = 6;
        let shadowCount = 0;
        const config = configRef.current!;
        config.lights.forEach((cfg) => {
          const canShadow = shadowCount < MAX_POINT_SHADOWS;
          const entry = createLightMesh(ctx.scene, cfg, cfg.entityId, {
            withPointLight: true,
            shadowCasters: canShadow ? result.shadowCasters : undefined,
            shadowResolution: getSetting('render').pointShadowRes,
          });
          if (entry.shadowGen) shadowCount++;
          meshMapRef.current[cfg.entityId] = entry;
        });

        // Freeze PointLight shadow maps after first render (static geometry)
        ctx.scene.onAfterRenderObservable.addOnce(() => {
          freezePointLightShadows(meshMapRef.current);
        });

        // Create wall display meshes
        const displayConfigs = config.displays || [];
        for (const dc of displayConfigs) {
          const entry = createDisplayMesh(ctx.scene, dc);
          if (dc.clickable) {
            entry.plane.isPickable = true;
            entry.plane.metadata = { displayId: dc.id };
          } else {
            entry.plane.isPickable = false;
          }
          displayMeshMapRef.current[dc.id] = entry;
        }

        // Create tube meshes
        const tubeConfigs = config.tubes || [];
        for (const tc of tubeConfigs) {
          tubeMapRef.current[tc.id] = createTubeMeshes(ctx.scene, tc, ctx.glowLayer);
        }

        // Weather effects (rain/snow particles + cloud cover)
        weatherRef.current = createWeatherEffects(ctx.scene, sunShadowGen ?? undefined);
        const pollWeather = async () => {
          if (!weatherEnabledRef.current) return;
          try {
            const lat = configRef.current?.location.latitude ?? 43.6077;
            const lng = configRef.current?.location.longitude ?? 3.8766;
            const data = await fetchWeather(lat, lng);
            if (disposed || !weatherRef.current) return;
            setCurrentWeather(data);
            const ccf = weatherRef.current.updateWeather(data);
            cloudCoverFactorRef.current = ccf;
            setCloudCoverFactor(ccf);
          } catch (err) {
            console.warn('[Weather] Poll failed:', err);
          }
        };
        pollWeatherRef.current = pollWeather;
        pollWeather();
        const weatherInterval = setInterval(pollWeather, 600_000);
        weatherIntervalRef = weatherInterval;
      } catch (e) {
        console.error('[Model] Load error:', e);
        setModelStatus('failed');
        setModelStatusColor('var(--red)');
        return;
      }

      // Pointer handlers: short click = toggle, long press = modal
      // Also handles clickable display meshes (displayId metadata) and tube meshes (tubeId metadata).
      let pressedDisplayId: string | null = null;
      let pressedTubeId: string | null = null;

      ctx.scene.onPointerDown = (evt, pickResult) => {
        if (evt.button > 0) return;
        if (!pickResult.hit || !pickResult.pickedMesh) return;
        const meta = pickResult.pickedMesh.metadata as { entityId?: string; displayId?: string; tubeId?: string } | null;

        // Display click — immediate open, no long-press
        if (meta?.displayId) {
          pressedDisplayId = meta.displayId;
          pressStartX = evt.clientX;
          pressStartY = evt.clientY;
          return;
        }

        // Tube click — immediate open, no long-press
        if (meta?.tubeId) {
          pressedTubeId = meta.tubeId;
          pressStartX = evt.clientX;
          pressStartY = evt.clientY;
          return;
        }

        if (!meta?.entityId) return;

        pressedEntity = meta.entityId;
        pressStartX = evt.clientX;
        pressStartY = evt.clientY;
        pressTimer = setTimeout(() => {
          pressTimer = null;
          if (pressedEntity) openModal(pressedEntity);
        }, LONG_PRESS_MS);
      };

      ctx.scene.onPointerUp = (_evt) => {
        // Handle display tap
        if (pressedDisplayId) {
          const dx = _evt.clientX - pressStartX;
          const dy = _evt.clientY - pressStartY;
          if (dx * dx + dy * dy <= MOVE_THRESHOLD * MOVE_THRESHOLD) {
            openDisplayModal(pressedDisplayId);
          }
          pressedDisplayId = null;
          return;
        }

        // Handle tube tap
        if (pressedTubeId) {
          const dx = _evt.clientX - pressStartX;
          const dy = _evt.clientY - pressStartY;
          if (dx * dx + dy * dy <= MOVE_THRESHOLD * MOVE_THRESHOLD) {
            openTubeModal(pressedTubeId);
          }
          pressedTubeId = null;
          return;
        }

        if (pressTimer !== null) {
          clearTimeout(pressTimer);
          pressTimer = null;
          if (pressedEntity && haRef.current) {
            const tappedEntity = pressedEntity;
            const lightCfg = configRef.current?.lights.find((l) => l.entityId === tappedEntity);
            const doubleTapId = lightCfg?.doubleTapEntityId;

            if (doubleTapId && lastTapEntity === tappedEntity && singleTapTimer !== null) {
              // Double-tap detected — toggle the secondary entity
              clearTimeout(singleTapTimer);
              singleTapTimer = null;
              lastTapEntity = null;
              const dtDomain = doubleTapId.split('.')[0];
              startPendingFeedback(doubleTapId);
              haRef.current.callService(dtDomain, 'toggle', doubleTapId)
                .catch(() => showErrorFeedback(doubleTapId));
            } else if (doubleTapId) {
              // Has double-tap configured — wait before firing single toggle
              lastTapEntity = tappedEntity;
              const ha = haRef.current;
              singleTapTimer = setTimeout(() => {
                singleTapTimer = null;
                lastTapEntity = null;
                const domain = tappedEntity.split('.')[0];
                startPendingFeedback(tappedEntity);
                ha.callService(domain, 'toggle', tappedEntity)
                  .catch(() => showErrorFeedback(tappedEntity));
              }, DOUBLE_TAP_MS);
            } else {
              // No double-tap configured — instant toggle as before
              const domain = tappedEntity.split('.')[0];
              startPendingFeedback(tappedEntity);
              haRef.current.callService(domain, 'toggle', tappedEntity)
                .catch(() => showErrorFeedback(tappedEntity));
            }
          }
        }
        pressedEntity = null;
      };

      ctx.scene.onPointerMove = (_evt, pickResult) => {
        if (pressedDisplayId) {
          const dx = _evt.clientX - pressStartX;
          const dy = _evt.clientY - pressStartY;
          if (dx * dx + dy * dy > MOVE_THRESHOLD * MOVE_THRESHOLD) {
            pressedDisplayId = null;
          }
        }
        if (pressedTubeId) {
          const dx = _evt.clientX - pressStartX;
          const dy = _evt.clientY - pressStartY;
          if (dx * dx + dy * dy > MOVE_THRESHOLD * MOVE_THRESHOLD) {
            pressedTubeId = null;
          }
        }
        if (pressTimer !== null) {
          const dx = _evt.clientX - pressStartX;
          const dy = _evt.clientY - pressStartY;
          if (dx * dx + dy * dy > MOVE_THRESHOLD * MOVE_THRESHOLD) {
            clearTimeout(pressTimer);
            pressTimer = null;
            pressedEntity = null;
          }
        }
        const meshMeta = pickResult.pickedMesh?.metadata as { entityId?: string; displayId?: string; tubeId?: string } | null;
        if (pickResult.hit && (meshMeta?.entityId || meshMeta?.displayId || meshMeta?.tubeId)) {
          canvas!.style.cursor = 'pointer';
        } else {
          canvas!.style.cursor = 'default';
        }
      };

      setSceneReady(true);
    }

    init();

    return () => {
      disposed = true;
      if (singleTapTimer !== null) clearTimeout(singleTapTimer);
      // Clear all pending highlights
      for (const entityId of pendingRef.current.keys()) stopPendingFeedback(entityId);
      Object.keys(meshMapRef.current).forEach((id) =>
        removeLightMesh(meshMapRef.current, id),
      );
      Object.keys(displayMeshMapRef.current).forEach((id) =>
        removeDisplayMesh(displayMeshMapRef.current, id),
      );
      disposeAllTubes(tubeMapRef.current);
      if (weatherIntervalRef) clearInterval(weatherIntervalRef);
      weatherRef.current?.dispose();
      weatherRef.current = null;
      disposeGroundGrid();
      ctx.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore ground grid from localStorage once scene is ready
  useEffect(() => {
    if (!sceneReady || !groundGrid) return;
    const scene = sceneCtxRef.current?.scene;
    if (scene) showGroundGrid(scene);
  }, [sceneReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Connect to Home Assistant (or demo adapter) — re-runs when demoMode changes
  useEffect(() => {
    if (!sceneReady) return;

    const config = configRef.current;
    if (!config) return;

    // Build lookup: modeEntityId → light entityId (for remote lights)
    const modeSensorToLight: Record<string, string> = {};
    for (const l of config.lights) {
      if (l.type === 'remote' && l.modeEntityId) {
        modeSensorToLight[l.modeEntityId] = l.entityId;
      }
    }

    const callbacks = {
      onStatusChanged: (status: HAConnectionStatus) => setHaStatus(status),
      onStateChanged: (entityId: string, state: HAState) => {
        stopPendingFeedback(entityId);
        if (meshMapRef.current[entityId]) applyLightState(entityId, state);
        if (entityId === modalEntityIdRef.current) setModalState(state);
        if (entityId === modalDoubleTapEntityIdRef.current) setModalDoubleTapState(state);
        if (entityId === remoteModalEntityIdRef.current) setRemoteModalState(state);

        // Mode sensor changed → re-apply color to the associated remote light
        if (modeSensorToLight[entityId]) {
          lastStatesRef.current[entityId] = state;
          const lightId = modeSensorToLight[entityId];
          applyRemoteMode(lightId, state.state);
        }

        const panelEntities: string[] = [];
        for (const c of config.sidePanel?.cards ?? []) {
          panelEntities.push(c.entityId);
          if (c.type === 'indicator' && c.climateEntityId) panelEntities.push(c.climateEntityId);
        }
        if (panelEntities.includes(entityId)) {
          setCardStates(prev => ({ ...prev, [entityId]: state }));
        }
        // Update tube labels referencing this sensor
        updateTubeValue(tubeMapRef.current, entityId, state.state);
        // Update wall displays referencing this entity
        lastStatesRef.current[entityId] = state;
        for (const entry of Object.values(displayMeshMapRef.current)) {
          if (entry.config.sources.some((s) => s.entityId === entityId)) {
            updateDisplayTexture(entry, lastStatesRef.current);
            setDisplayAnimation(entry, resolveDisplayAnimation(entry.config, lastStatesRef.current));
          }
        }
        // Keep display modal states in sync
        setDisplayModalStates(prev => {
          if (!prev[entityId] && !Object.keys(prev).length) return prev;
          return { ...prev, [entityId]: state };
        });
      },
      onInitialStates: (states: HAState[]) => {
        const panelEntities = new Set<string>();
        for (const c of config.sidePanel?.cards ?? []) {
          panelEntities.add(c.entityId);
          if (c.type === 'indicator' && c.climateEntityId) panelEntities.add(c.climateEntityId);
        }
        const newCardStates: Record<string, HAState> = {};
        states.forEach((state) => {
          lastStatesRef.current[state.entity_id] = state;
          if (meshMapRef.current[state.entity_id]) applyLightState(state.entity_id, state);
          if (panelEntities.has(state.entity_id)) newCardStates[state.entity_id] = state;
        });
        if (Object.keys(newCardStates).length > 0) {
          setCardStates(prev => ({ ...prev, ...newCardStates }));
        }
        // Apply initial remote mode colors (mode sensor states are now in lastStatesRef)
        for (const [modeEntityId, lightId] of Object.entries(modeSensorToLight)) {
          const modeState = lastStatesRef.current[modeEntityId];
          if (modeState?.state && modeState.state !== 'unknown' && modeState.state !== 'unavailable') {
            applyRemoteMode(lightId, modeState.state);
          }
        }
        // Update all tube labels with initial state
        for (const state of states) {
          updateTubeValue(tubeMapRef.current, state.entity_id, state.state);
        }
        // Update all wall display textures with initial state
        for (const entry of Object.values(displayMeshMapRef.current)) {
          updateDisplayTexture(entry, lastStatesRef.current);
          setDisplayAnimation(entry, resolveDisplayAnimation(entry.config, lastStatesRef.current));
        }
      },
    };

    if (demoMode || simulationMode) {
      const demo = new DemoHAConnection(callbacks);
      haRef.current = demo;
      setActiveHAConnection(demo);
      const sensorIds: string[] = [];
      for (const c of config.sidePanel?.cards ?? []) {
        if (c.type !== 'script') sensorIds.push(c.entityId);
        if (c.type === 'indicator' && c.climateEntityId) sensorIds.push(c.climateEntityId);
      }
      // Include display source entity IDs in demo mode
      for (const d of config.displays ?? []) {
        for (const s of d.sources) {
          if (!sensorIds.includes(s.entityId)) sensorIds.push(s.entityId);
        }
      }
      // Include tube sensor entity IDs in demo mode
      for (const t of config.tubes ?? []) {
        for (const line of t.lines) {
          if (!sensorIds.includes(line.sensorId)) sensorIds.push(line.sensorId);
        }
      }
      demo.start(config.lights, sensorIds);
    } else {
      const haSettings = getSetting('connection').haSettings;
      const ha = new HAConnection(
        { url: haSettings.url, port: haSettings.port, token: haSettings.token },
        callbacks,
      );
      haRef.current = ha;
      setActiveHAConnection(ha);
      ha.connect();
    }

    return () => {
      haRef.current?.dispose();
      haRef.current = null;
      setActiveHAConnection(null);
    };
  }, [demoMode, simulationMode, sceneReady, applyLightState, applyRemoteMode, haSettingsVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep refs to modal entity IDs for use in callbacks
  const modalEntityIdRef = useRef<string | null>(null);
  modalEntityIdRef.current = modalEntityId;
  const modalDoubleTapEntityIdRef = useRef<string | undefined>();
  modalDoubleTapEntityIdRef.current = modalDoubleTapEntityId;
  const remoteModalEntityIdRef = useRef<string | null>(null);
  remoteModalEntityIdRef.current = remoteModalEntityId;

  const openModal = useCallback((entityId: string) => {
    const config = configRef.current;
    if (!config) return;
    const cfg = config.lights.find((l) => l.entityId === entityId);
    if (!cfg) return;

    const lbl = cfg.label || entityId.split('.')[1].replace(/_/g, ' ');

    if (cfg.type === 'remote') {
      setRemoteModalEntityId(entityId);
      setRemoteModalLabel(lbl);
      setRemoteModalButtons(cfg.remoteButtons ?? []);
      setRemoteModalState(lastStatesRef.current[entityId] || null);
      setRemoteModalVisible(true);
      return;
    }

    setModalEntityId(entityId);
    setModalLabel(lbl);
    setModalLightType(cfg.type || 'toggle');
    setModalState(lastStatesRef.current[entityId] || null);
    setModalDoubleTapEntityId(cfg.doubleTapEntityId);
    setModalDoubleTapState(cfg.doubleTapEntityId ? lastStatesRef.current[cfg.doubleTapEntityId] || null : null);
    setModalVisible(true);
  }, []);

  const handleModalClose = useCallback(() => {
    setModalVisible(false);
    setModalEntityId(null);
  }, []);

  const openDisplayModal = useCallback((displayId: string) => {
    const config = configRef.current;
    if (!config) return;
    const dc = config.displays?.find((d) => d.id === displayId);
    if (!dc) return;
    setDisplayModalConfig(dc);
    setDisplayModalStates({ ...lastStatesRef.current });
    setDisplayModalVisible(true);
  }, []);

  const openTubeModal = useCallback((tubeId: string) => {
    const config = configRef.current;
    if (!config) return;
    const tc = config.tubes?.find((t) => t.id === tubeId);
    if (!tc) return;
    // Synthesize a DisplayConfig so we can reuse DisplayModal for sensor graphs
    const syntheticDisplay: DisplayConfig = {
      id: tc.id,
      label: tc.label,
      sources: tc.lines.map((line) => ({
        entityId: line.sensorId,
        color: line.color,
      })),
      position: { x: 0, y: 0, z: 0 },
      normal: { x: 0, y: 0, z: 1 },
      width: 1,
      height: 1,
    };
    setDisplayModalConfig(syntheticDisplay);
    setDisplayModalStates({ ...lastStatesRef.current });
    setDisplayModalVisible(true);
  }, []);

  const handleDisplayModalClose = useCallback(() => {
    setDisplayModalVisible(false);
    setDisplayModalConfig(null);
  }, []);

  const handleRemoteModalClose = useCallback(() => {
    setRemoteModalVisible(false);
    setRemoteModalEntityId(null);
  }, []);

  const handleRemoteButtonPress = useCallback((entityId: string) => {
    const ha = haRef.current;
    if (!ha?.isConnected) return;
    const domain = entityId.split('.')[0];
    ha.callService(domain, 'press', entityId);
  }, []);

  const handleToggle = useCallback((entityId: string) => {
    const ha = haRef.current;
    if (!ha?.isConnected) return;
    const domain = entityId.split('.')[0];
    ha.callService(domain, 'toggle', entityId);
  }, []);

  const handleBrightness = useCallback((entityId: string, brightness: number) => {
    const ha = haRef.current;
    if (!ha?.isConnected) return;
    ha.callService('light', 'turn_on', entityId, { brightness });
  }, []);

  const handleColorTemp = useCallback((entityId: string, colorTemp: number) => {
    const ha = haRef.current;
    if (!ha?.isConnected) return;
    ha.callService('light', 'turn_on', entityId, { color_temp: colorTemp });
  }, []);

  const handleColor = useCallback(
    (entityId: string, color: { r: number; g: number; b: number }, brightness: number) => {
      const ha = haRef.current;
      if (!ha?.isConnected) return;
      ha.callService('light', 'turn_on', entityId, {
        rgb_color: [color.r, color.g, color.b],
        brightness,
      });
    },
    [],
  );

  const handleWhiteChannel = useCallback((entityId: string, white: number) => {
    const ha = haRef.current;
    if (!ha?.isConnected) return;
    ha.callService('light', 'turn_on', entityId, { white_value: white });
  }, []);

  const handleRebuildLights = useCallback((stripConfig: StripConfig, singleRange: number) => {
    const ctx = sceneCtxRef.current;
    const config = configRef.current;
    const casters = shadowCastersRef.current;
    if (!ctx || !config || !casters.length) return;

    // Dispose all existing light meshes
    Object.keys(meshMapRef.current).forEach((id) =>
      removeLightMesh(meshMapRef.current, id),
    );

    // Recreate with new strip config (cap shadows like initial creation)
    const MAX_POINT_SHADOWS = 4;
    let shadowCount = 0;
    config.lights.forEach((cfg) => {
      const canShadow = shadowCount < MAX_POINT_SHADOWS;
      const entry = createLightMesh(ctx.scene, cfg, cfg.entityId, {
        withPointLight: true,
        shadowCasters: canShadow ? casters : undefined,
        stripConfig,
        singleRange,
        shadowResolution: getSetting('render').pointShadowRes,
      });
      if (entry.shadowGen) shadowCount++;
      meshMapRef.current[cfg.entityId] = entry;
    });

    // Re-apply current HA states
    for (const entityId of Object.keys(lastStatesRef.current)) {
      if (meshMapRef.current[entityId]) {
        applyLightState(entityId, lastStatesRef.current[entityId]);
      }
    }
  }, [applyLightState]);

  // Save current camera pose as the home view
  const saveHomeView = useCallback(() => {
    const ctx = sceneCtxRef.current;
    if (!ctx) return;
    const { camera } = ctx;
    const pose: HomeViewPose = {
      alpha: camera.alpha,
      beta: camera.beta,
      radius: camera.radius,
      target: { x: camera.target.x, y: camera.target.y, z: camera.target.z },
    };
    updateSettings('controls', { homeView: pose });
    setHomeViewSetting(false);
  }, []);

  // Reset camera to home view with smooth animation
  const homingRef = useRef(false);
  const resetView = useCallback(() => {
    const ctx = sceneCtxRef.current;
    if (!ctx || !defaultTarget || homingRef.current) return;
    const { camera, scene } = ctx;
    const fps = 60;
    const frames = 45; // ~750ms

    // Lock user input during animation
    homingRef.current = true;
    camera.detachControl();

    const ease = new CubicEase();
    ease.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT);

    const makeAnim = (prop: string, from: number, to: number) => {
      const a = new Animation(`home_${prop}`, prop, fps, Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CONSTANT);
      a.setKeys([{ frame: 0, value: from }, { frame: frames, value: to }]);
      a.setEasingFunction(ease);
      return a;
    };

    const saved = getSetting('controls').homeView;
    const targetRadius = saved ? saved.radius : computeIdealRadius();
    const targetAlpha = saved ? saved.alpha : Tools.ToRadians(270);
    const targetBeta = saved ? saved.beta : Tools.ToRadians(0.5);
    const targetPos = saved
      ? new Vector3(saved.target.x, saved.target.y, saved.target.z)
      : new Vector3(defaultTarget.x, defaultTarget.y, defaultTarget.z);

    // Skip if already at home — avoids detach/reattach glitch
    const EPS = 0.002;
    if (
      Math.abs(camera.radius - targetRadius) < EPS &&
      Math.abs(camera.alpha - targetAlpha) < EPS &&
      Math.abs(camera.beta - targetBeta) < EPS &&
      Vector3.Distance(camera.target, targetPos) < EPS
    ) {
      homingRef.current = false;
      camera.attachControl(true);
      return;
    }

    // Animate target (Vector3) separately
    const targetAnim = new Animation('home_target', 'target', fps, Animation.ANIMATIONTYPE_VECTOR3, Animation.ANIMATIONLOOPMODE_CONSTANT);
    targetAnim.setKeys([{ frame: 0, value: camera.target.clone() }, { frame: frames, value: targetPos }]);
    targetAnim.setEasingFunction(ease);

    camera.animations = [
      makeAnim('radius', camera.radius, targetRadius),
      makeAnim('alpha', camera.alpha, targetAlpha),
      makeAnim('beta', camera.beta, targetBeta),
      targetAnim,
    ];

    scene.beginAnimation(camera, 0, frames, false, 1, () => {
      // Re-enable user input
      camera.attachControl(true);
      homingRef.current = false;
    });
  }, [defaultTarget, computeIdealRadius]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip shortcuts when typing in an input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement)?.isContentEditable) return;

      // Skip shortcuts when a modifier key is held (allow native Ctrl+C, etc.)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === 'Escape') {
        if (homeViewSetting) setHomeViewSetting(false);
        else if (settingsOpen) setSettingsOpen(false);
        else if (remoteModalVisible) handleRemoteModalClose();
        else handleModalClose();
      } else if (e.key === ' ' && !settingsOpen && !modalVisible && !remoteModalVisible) {
        e.preventDefault();
        if (homeViewSetting) saveHomeView();
        else resetView();
      } else if (e.key === 'd') {
        setDebugOpen(v => !v);
      } else if (e.key === 's') {
        setSettingsOpen(v => !v);
      } else if (e.key === 'c') {
        navigate('/editor');
      } else if (e.key === 'g') {
        setGridEditMode(v => !v);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [handleModalClose, handleRemoteModalClose, settingsOpen, modalVisible, remoteModalVisible, resetView, navigate, homeViewSetting, saveHomeView]);

  // 3-finger touch to reset view (mobile)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = (e: TouchEvent) => {
      if (e.touches.length === 3) {
        e.preventDefault();
        if (homeViewSetting) saveHomeView();
        else resetView();
      }
    };
    canvas.addEventListener('touchstart', handler, { passive: false });
    return () => canvas.removeEventListener('touchstart', handler);
  }, [resetView, homeViewSetting, saveHomeView]);

  // Grid edit mode: save layout changes to server
  const handleGridLayoutChange = useCallback((layouts: Record<string, CardLayout>) => {
    const config = configRef.current;
    if (!config?.sidePanel) return;
    const updatedCards = config.sidePanel.cards.map(card => {
      const newLayout = layouts[card.id];
      return newLayout ? { ...card, layout: newLayout } : card;
    });
    const updatedPanel = { ...config.sidePanel, cards: updatedCards };
    configRef.current = { ...config, sidePanel: updatedPanel };
    setSidePanelConfig(updatedPanel);
    // Sync editing card layout if properties panel is open
    setEditingCard(prev => {
      if (!prev) return prev;
      const newLayout = layouts[prev.id];
      return newLayout ? { ...prev, layout: newLayout } : prev;
    });
    try { updateConfig({ sidePanel: updatedPanel }); } catch (err) {
      console.warn('[Config] Failed to save grid layout:', err);
    }
  }, []);

  const handleEditGridDone = useCallback(() => {
    setGridEditMode(false);
  }, []);

  const handleCardAdd = useCallback(() => {
    setEditingCard(null);
    setCardPanelOpen(true);
  }, []);

  const handleCardEdit = useCallback((card: SidePanelCard) => {
    // Read the latest version from config (layout may have changed via drag/resize)
    const latest = configRef.current?.sidePanel?.cards.find(c => c.id === card.id);
    setEditingCard(latest ?? card);
    setCardPanelOpen(true);
  }, []);

  const handleCardDelete = useCallback((cardId: string) => {
    const config = configRef.current;
    if (!config?.sidePanel) return;
    const updatedCards = config.sidePanel.cards.filter(c => c.id !== cardId);
    const updatedPanel = { ...config.sidePanel, cards: updatedCards };
    configRef.current = { ...config, sidePanel: updatedPanel };
    updateConfig({ sidePanel: updatedPanel });
    setSidePanelConfig(updatedPanel);
  }, []);

  const handleCardSave = useCallback((card: SidePanelCard) => {
    const config = configRef.current;
    if (!config) return;
    const panel = config.sidePanel ?? { cards: [] };
    const exists = panel.cards.some(c => c.id === card.id);
    const updatedCards = exists
      ? panel.cards.map(c => c.id === card.id ? card : c)
      : [...panel.cards, card];
    const updatedPanel = { ...panel, cards: updatedCards };
    configRef.current = { ...config, sidePanel: updatedPanel };
    updateConfig({ sidePanel: updatedPanel });
    setSidePanelConfig(updatedPanel);
    setCardPanelOpen(false);
    setEditingCard(null);
  }, []);

  // Live preview: update the grid as the user edits fields (no persist)
  const handleCardPreview = useCallback((card: SidePanelCard) => {
    const config = configRef.current;
    if (!config?.sidePanel) return;
    const updatedCards = config.sidePanel.cards.map(c => c.id === card.id ? card : c);
    const updatedPanel = { ...config.sidePanel, cards: updatedCards };
    // Update state for live render, but don't persist yet
    setSidePanelConfig(updatedPanel);
  }, []);

  // Apply camera controls based on device type
  useEffect(() => {
    const camera = sceneCtxRef.current?.camera;
    const scene = sceneCtxRef.current?.scene;
    if (!camera || !scene) return;
    const isMobile = window.matchMedia('(pointer: coarse)').matches;
    const flags = isMobile ? camControls.mobile : camControls.desktop;

    // Zoom: wheelPrecision for mouse, pinchPrecision for touch
    camera.wheelPrecision = flags.zoom ? 5 : 99999;
    camera.pinchPrecision = flags.zoom ? 12 : 99999;

    // Rotate: angular sensibility (higher = less sensitive, huge = disabled)
    const rotVal = flags.rotate ? 800 : 99999;
    camera.angularSensibilityX = rotVal;
    camera.angularSensibilityY = rotVal;

    // Pan: scale sensibility with radius so panning stays consistent at any zoom level
    const BASE_PAN = 75;
    const refRadius = computeIdealRadius();
    if (!flags.pan) {
      camera.panningSensibility = 0;
    } else {
      camera.panningSensibility = BASE_PAN * (refRadius / camera.radius);
    }

    // Keep panning sensibility in sync as the user zooms in/out
    const observer = scene.onBeforeRenderObservable.add(() => {
      if (!flags.pan) return;
      camera.panningSensibility = BASE_PAN * (refRadius / camera.radius);
    });

    return () => {
      scene.onBeforeRenderObservable.remove(observer);
    };
  }, [camControls.desktop, camControls.mobile, sceneReady, computeIdealRadius]);

  // Resize Babylon engine when canvas container changes size (e.g. side panel open/close)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      sceneCtxRef.current?.engine.resize();
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);


  return (
    <div className="dashboard-wrapper" style={{ '--panel-size': `${(sidePanelConfig?.cards?.length || gridEditMode) ? panelSize : 0}px` } as React.CSSProperties}>
      <SidePanel
        config={sidePanelConfig}
        ha={haRef.current}
        cardStates={cardStates}
        onSettingsOpen={() => setSettingsOpen(true)}
        panelSize={panelSize}
        onPanelResize={handlePanelResize}
        editMode={gridEditMode}
        onEditDone={handleEditGridDone}
        onLayoutChange={handleGridLayoutChange}
        onSetTemperature={(entityId, temperature) => {
          haRef.current?.callService('climate', 'set_temperature', entityId, { temperature });
        }}
        onSetHvacMode={(entityId, mode) => {
          haRef.current?.callService('climate', 'set_hvac_mode', entityId, { hvac_mode: mode });
        }}
        onCardAdd={handleCardAdd}
        onCardEdit={handleCardEdit}
        onCardDelete={handleCardDelete}
        onExitSimulation={simulationMode ? () => {
          setSimulationMode(false);
          navigate('/onboarding');
        } : undefined}
      />
      {cardPanelOpen && (
        <CardPropertiesPanel
          card={editingCard}
          onSave={handleCardSave}
          onCancel={() => { setCardPanelOpen(false); setEditingCard(null); }}
          onPreview={handleCardPreview}
        />
      )}
      <div className="dashboard">
        <canvas ref={canvasRef} />

        <HUD
          latitude={configRef.current?.location.latitude ?? 43.6077}
          longitude={configRef.current?.location.longitude ?? 3.8766}
          northOffset={northOffset}
          sunLight={sceneCtxRef.current?.sunLight ?? null}
          hemiLight={sceneCtxRef.current?.hemiLight ?? null}
          sunLiveMode={sunLiveMode}
          sliderValue={sliderValue}
          scrubberTime={scrubberTime}
          onSunLiveModeChange={setSunLiveMode}
          onSliderValueChange={setSliderValue}
          onScrubberTimeChange={setScrubberTime}
          cloudCoverFactor={cloudCoverFactor}
        />

        <DebugPanel
          open={debugOpen}
          onClose={() => setDebugOpen(false)}
          sceneCtxRef={sceneCtxRef}
          meshMapRef={meshMapRef}
          shadowCastersRef={shadowCastersRef}
          onRebuildLights={handleRebuildLights}
          weatherRef={weatherRef}
          onCloudCoverFactorChange={(ccf) => {
            cloudCoverFactorRef.current = ccf;
            setCloudCoverFactor(ccf);
          }}
          currentWeather={currentWeather}
        />

        <LightModal
          visible={modalVisible}
          entityId={modalEntityId}
          label={modalLabel}
          lightType={modalLightType}
          state={modalState}
          onClose={handleModalClose}
          onToggle={handleToggle}
          onBrightness={handleBrightness}
          onColorTemp={handleColorTemp}
          onColor={handleColor}
          onWhiteChannel={handleWhiteChannel}
          doubleTapEntityId={modalDoubleTapEntityId}
          doubleTapState={modalDoubleTapState}
        />

        <RemoteModal
          visible={remoteModalVisible}
          label={remoteModalLabel}
          toggleEntityId={remoteModalEntityId}
          state={remoteModalState}
          buttons={remoteModalButtons}
          onClose={handleRemoteModalClose}
          onToggle={handleToggle}
          onPressButton={handleRemoteButtonPress}
        />

        <DisplayModal
          display={displayModalConfig}
          states={displayModalStates}
          visible={displayModalVisible}
          onClose={handleDisplayModalClose}
          onSetTemperature={(entityId, temperature) => {
            haRef.current?.callService('climate', 'set_temperature', entityId, { temperature });
          }}
          onSetHvacMode={(entityId, mode) => {
            haRef.current?.callService('climate', 'set_hvac_mode', entityId, { hvac_mode: mode });
          }}
        />

        <SettingsModal
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          sliderValue={sliderValue}
          scrubberTime={scrubberTime}
          sunLiveMode={sunLiveMode}
          onSliderChange={handleSliderChange}
          onLiveClick={handleLiveClick}
          northOffset={northOffset}
          onNorthOffsetChange={handleNorthOffsetChange}
          edgeWidth={edgeWidth}
          onEdgeWidthChange={handleEdgeWidthChange}
          edgeMode={edgeMode}
          onEdgeModeChange={handleEdgeModeChange}
          groundGrid={groundGrid}
          onGroundGridChange={handleGroundGridChange}
          weatherEnabled={weatherEnabled}
          onWeatherEnabledChange={handleWeatherEnabledChange}
          perspective={perspective}
          onPerspectiveChange={handlePerspectiveChange}
          sunShadowRes={sunShadowRes}
          onSunShadowResChange={handleSunShadowResChange}
          pointShadowRes={pointShadowRes}
          onPointShadowResChange={handlePointShadowResChange}
          showTextures={showTextures}
          onShowTexturesChange={handleShowTexturesChange}
          sketchColor={sketchColor}
          onSketchColorChange={handleSketchColorChange}
          sketchSpecular={sketchSpecular}
          onSketchSpecularChange={handleSketchSpecularChange}
          onDebugToggle={() => setDebugOpen((v) => !v)}
          onEditGrid={() => setGridEditMode(true)}
          onChangeHomeView={() => setHomeViewSetting(true)}
          haSettings={getSetting('connection').haSettings}
          onHASettingsSave={(settings) => {
            updateSettings('connection', { haSettings: settings });
            setHaSettingsVersion(v => v + 1);
          }}
          lightsOnCount={lightsOnCount}
          haStatus={haStatus}
          modelStatus={modelStatus}
          modelStatusColor={modelStatusColor}
        />

        {homeViewSetting && (
          <div className="home-view-overlay">
            <div className="home-view-overlay-box">
              <p>Position the view as you want it</p>
              <p className="home-view-overlay-hint">
                Press <kbd>Space</kbd> or use <strong>3 fingers</strong> to validate
              </p>
              <button className="home-view-overlay-cancel" onClick={() => setHomeViewSetting(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {showTour && (
          <GuidedTour
            steps={dashboardTourSteps}
            onComplete={() => {
              setShowTour(false);
              navigate('/editor?guided=true');
            }}
          />
        )}

      </div>
    </div>
  );
}
