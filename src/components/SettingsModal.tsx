import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Server, Palette, Box, MonitorCloud, Hand, Cog, Info,
  Lightbulb, LayoutTemplate, ChevronLeft, X,
  Monitor, Smartphone, Search, RotateCw, Move,
  Github, HeartHandshake, Scale,
} from 'lucide-react';
import { buildWsUrl, type HAConnectionStatus } from '../services/haWebSocket';
import type { HASettings } from '../types';
import { getConfig, resetConfig, updateConfig, exportBackup, importBackup } from '../services/configApi';
import { clearSettings, getSetting, getSettings, updateSettings } from '../services/settingsStore';
import { useDemoMode } from '../contexts/DemoModeContext';
import { useCameraControls, type CameraControlsFlags } from '../contexts/CameraControlsContext';
import {
  useTheme,
  BG_DARK, BG_LIGHT,
  PRIMARY_ACCENTS, STATUS_ACCENTS,
  PANEL_BG_DARK, PANEL_BG_LIGHT,
} from '../contexts/ThemeContext';
import './SettingsModal.css';

type Section = 'main' | 'connection' | 'appearance' | 'render' | 'environment' | 'controls' | 'system' | 'infos';

interface Props {
  open: boolean;
  onClose: () => void;

  /* Sun scrubber */
  sliderValue: number;
  scrubberTime: string;
  sunLiveMode: boolean;
  onSliderChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onLiveClick: () => void;

  /* North offset */
  northOffset: number;
  onNorthOffsetChange: (degrees: number) => void;

  /* Edge scrubber */
  edgeWidth: number;
  onEdgeWidthChange: (width: number) => void;
  edgeMode: 'classic' | 'enhanced';
  onEdgeModeChange: (mode: 'classic' | 'enhanced') => void;

  /* Ground grid */
  groundGrid: boolean;
  onGroundGridChange: (enabled: boolean) => void;

  /* Weather effects */
  weatherEnabled: boolean;
  onWeatherEnabledChange: (enabled: boolean) => void;

  /* Perspective */
  perspective: boolean;
  onPerspectiveChange: (enabled: boolean) => void;

  /* Shadow resolution */
  sunShadowRes: number;
  onSunShadowResChange: (res: number) => void;
  pointShadowRes: number;
  onPointShadowResChange: (res: number) => void;

  /* Textures */
  showTextures: boolean;
  onShowTexturesChange: (enabled: boolean) => void;

  /* Sketch material */
  sketchColor: string;
  onSketchColorChange: (color: string) => void;
  sketchSpecular: number;
  onSketchSpecularChange: (value: number) => void;

  /* Debug */
  onDebugToggle: () => void;

  /* Grid edit */
  onEditGrid: () => void;

  /* Home view */
  onChangeHomeView: () => void;

  /* HA settings */
  haSettings: HASettings;
  onHASettingsSave: (settings: HASettings) => void;

  /* Status */
  lightsOnCount: number;
  haStatus: HAConnectionStatus;
  modelStatus: string;
  modelStatusColor?: string;
}

const SECTIONS: { key: Section; label: string; icon: typeof Server }[] = [
  { key: 'connection', label: 'Connection', icon: Server },
  { key: 'appearance', label: 'Appearance', icon: Palette },
  { key: 'render', label: 'Render', icon: Box },
  { key: 'environment', label: 'Environment', icon: MonitorCloud },
  { key: 'controls', label: 'Controls', icon: Hand },
  { key: 'system', label: 'System', icon: Cog },
  { key: 'infos', label: 'Infos', icon: Info },
];

export default function SettingsModal({
  open,
  onClose,
  sliderValue,
  scrubberTime,
  sunLiveMode,
  onSliderChange,
  onLiveClick,
  northOffset,
  onNorthOffsetChange,
  edgeWidth,
  onEdgeWidthChange,
  edgeMode,
  onEdgeModeChange,
  groundGrid,
  onGroundGridChange,
  weatherEnabled,
  onWeatherEnabledChange,
  perspective,
  onPerspectiveChange,
  sunShadowRes,
  onSunShadowResChange,
  pointShadowRes,
  onPointShadowResChange,
  showTextures,
  onShowTexturesChange,
  sketchColor,
  onSketchColorChange,
  sketchSpecular,
  onSketchSpecularChange,
  onDebugToggle,
  onEditGrid,
  onChangeHomeView,
  haSettings,
  onHASettingsSave,
  lightsOnCount,
  haStatus,
  modelStatus,
  modelStatusColor,
}: Props) {
  const navigate = useNavigate();
  const { demoMode, setDemoMode } = useDemoMode();
  const { desktop, mobile, toggleDesktop, toggleMobile } = useCameraControls();
  const { theme, resolved, setTheme, refreshAppearance } = useTheme();

  const [section, setSection] = useState<Section>('main');
  const [prevSection, setPrevSection] = useState<Section>('main');
  const [animating, setAnimating] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const mainRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState<number | undefined>(undefined);
  const [haUrl, setHaUrl] = useState(haSettings.url);
  const [haPort, setHaPort] = useState(haSettings.port);
  const [haToken, setHaToken] = useState(haSettings.token);
  const [haSaveStatus, setHaSaveStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [homeViewReset, setHomeViewReset] = useState<'idle' | 'done'>('idle');

  // Appearance state
  const [bgColor, setBgColor] = useState(() => getSettings().appearance.bgColor);
  const [primaryAccent, setPrimaryAccent] = useState(() => getSettings().appearance.primaryAccent);
  const [statusAccent, setStatusAccent] = useState(() => getSettings().appearance.statusAccent);
  const [panelOpacity, setPanelOpacity] = useState(() => getSettings().appearance.panelOpacity);
  const [panelDots, setPanelDots] = useState(() => getSettings().appearance.panelDots);
  const [panelBgColor, setPanelBgColor] = useState(() => getSettings().appearance.panelBgColor);
  const [backdropObscure, setBackdropObscure] = useState(() => getSettings().appearance.backdropObscure);
  const [backdropBlur, setBackdropBlur] = useState(() => getSettings().appearance.backdropBlur);
  const [hudVisible, setHudVisible] = useState(() => getSettings().appearance.hudVisible);
  const [borderStyle, setBorderStyle] = useState(() => getSettings().appearance.borderStyle);
  const [cornerRadius, setCornerRadius] = useState(() => getSettings().appearance.cornerRadius);

  const updateAppearance = useCallback((patch: Record<string, unknown>) => {
    updateSettings('appearance', patch as any);
    refreshAppearance();
  }, [refreshAppearance]);

  // When theme (dark/light) changes, map colors by index to the new palette
  useEffect(() => {
    const fromBg = resolved === 'dark' ? BG_LIGHT : BG_DARK;
    const toBg = resolved === 'dark' ? BG_DARK : BG_LIGHT;
    const fromPanel = resolved === 'dark' ? PANEL_BG_LIGHT : PANEL_BG_DARK;
    const toPanel = resolved === 'dark' ? PANEL_BG_DARK : PANEL_BG_LIGHT;

    const bgIdx = Math.max(0, fromBg.findIndex(c => c.hex === bgColor));
    const panelIdx = Math.max(0, fromPanel.findIndex(c => c.hex === panelBgColor));
    const newBg = toBg[bgIdx]?.hex ?? toBg[0].hex;
    const newPanel = toPanel[panelIdx]?.hex ?? toPanel[0].hex;

    setBgColor(newBg);
    setPanelBgColor(newPanel);
    updateSettings('appearance', { bgColor: newBg, panelBgColor: newPanel });
  }, [resolved]);

  // Reset to main page when modal opens
  useEffect(() => {
    if (open) {
      setSection('main');
      setPrevSection('main');
      setAnimating(false);
      setConfirmReset(false);
      setBodyHeight(undefined);
      const cfg = getConfig();
      setLatitude(String(cfg.location?.latitude ?? 43.6077));
      setLongitude(String(cfg.location?.longitude ?? 3.8766));
    }
  }, [open]);

  // Capture main page height once rendered
  useEffect(() => {
    if (open && section === 'main' && mainRef.current && bodyHeight === undefined) {
      setBodyHeight(mainRef.current.offsetHeight);
    }
  }, [open, section, bodyHeight]);

  const navigateTo = useCallback((target: Section) => {
    setPrevSection(section);
    setSection(target);
    setAnimating(true);
  }, [section]);

  const handleTransitionEnd = useCallback(() => {
    setAnimating(false);
    setPrevSection(section);
  }, [section]);

  useEffect(() => {
    setHaUrl(haSettings.url);
    setHaPort(haSettings.port);
    setHaToken(haSettings.token);
  }, [haSettings.url, haSettings.port, haSettings.token]);

  const handleHASave = useCallback(() => {
    if (!haUrl || !haToken) return;
    setHaSaveStatus('testing');

    const ws = new WebSocket(buildWsUrl(haUrl, haPort));
    const resetError = () => setTimeout(() => setHaSaveStatus('idle'), 3000);
    const timeout = setTimeout(() => {
      ws.close();
      setHaSaveStatus('error');
      resetError();
    }, 5000);

    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'auth_required') {
        ws.send(JSON.stringify({ type: 'auth', access_token: haToken }));
      } else if (msg.type === 'auth_ok') {
        clearTimeout(timeout);
        ws.close();
        setHaSaveStatus('success');
        onHASettingsSave({ url: haUrl, port: haPort, token: haToken });
        setTimeout(() => setHaSaveStatus('idle'), 2000);
      } else if (msg.type === 'auth_invalid') {
        clearTimeout(timeout);
        ws.close();
        setHaSaveStatus('error');
        resetError();
      }
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      setHaSaveStatus('error');
      resetError();
    };
  }, [haUrl, haPort, haToken, onHASettingsSave]);

  const compassRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef(false);

  const angleFromEvent = useCallback((e: { clientX: number; clientY: number }) => {
    const svg = compassRef.current;
    if (!svg) return northOffset;
    const rect = svg.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    let deg = Math.atan2(dx, -dy) * (180 / Math.PI);
    if (deg < 0) deg += 360;
    return Math.round(deg);
  }, [northOffset]);

  const handleCompassPointerDown = useCallback((e: React.PointerEvent) => {
    draggingRef.current = true;
    (e.target as Element).setPointerCapture(e.pointerId);
    onNorthOffsetChange(angleFromEvent(e));
  }, [angleFromEvent, onNorthOffsetChange]);

  const handleCompassPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    onNorthOffsetChange(angleFromEvent(e));
  }, [angleFromEvent, onNorthOffsetChange]);

  const handleCompassPointerUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  const controlItems: { key: keyof CameraControlsFlags; icon: typeof Search; label: string }[] = [
    { key: 'zoom', icon: Search, label: 'Zoom' },
    { key: 'rotate', icon: RotateCw, label: 'Rotate' },
    { key: 'pan', icon: Move, label: 'Pan' },
  ];

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  const haStatusColor =
    haStatus === 'connected' ? 'var(--green)' :
    haStatus === 'error' || haStatus === 'auth_error' ? 'var(--red)' :
    haStatus === 'connecting' || haStatus === 'disconnected' ? 'var(--yellow)' :
    undefined;

  const haStatusText =
    haStatus === 'auth_error' ? 'auth error' :
    haStatus === 'disconnected' ? 'reconnecting...' :
    haStatus;

  if (!open) return null;

  const sectionTitle = SECTIONS.find(s => s.key === section)?.label ?? 'Settings';

  return (
    <div className="settings-backdrop" onClick={handleBackdropClick}>
      <div className="settings-modal">
        {/* Header */}
        <div className="settings-header">
          {section !== 'main' ? (
            <button className="settings-back-btn" onClick={() => navigateTo('main')}>
              <ChevronLeft size={16} />
            </button>
          ) : null}
          <span className="settings-title">
            {section === 'main' ? 'Settings' : sectionTitle}
          </span>
          <button className="settings-close-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Sliding body */}
        <div
          className="settings-body"
          style={bodyHeight ? { height: bodyHeight } : undefined}
          onTransitionEnd={handleTransitionEnd}
        >
          {/* Main panel */}
          <div
            className={`settings-panel settings-panel-main${
              section === 'main' ? ' active' : ''
            }${section !== 'main' ? ' exit-left' : ''}`}
            ref={mainRef}
          >
            <div className="settings-main">
              <div className="settings-list">
                {SECTIONS.map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    className="settings-list-item"
                    onClick={() => navigateTo(key)}
                  >
                    <Icon size={18} strokeWidth={1.5} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>

              <div className="settings-bottom-actions">
                <Link
                  to="/editor"
                  className="settings-big-btn"
                  onClick={onClose}
                >
                  <Lightbulb size={20} strokeWidth={1.5} />
                  <span>Edit Lights</span>
                </Link>
                <button
                  className="settings-big-btn"
                  onClick={() => { onEditGrid(); onClose(); }}
                >
                  <LayoutTemplate size={20} strokeWidth={1.5} />
                  <span>Edit Grid</span>
                </button>
              </div>
            </div>
          </div>

          {/* Section panel */}
          <div
            className={`settings-panel settings-panel-section${
              section !== 'main' ? ' active' : ''
            }${section === 'main' ? ' exit-right' : ''}`}
          >
            {/* Connection */}
            {(section === 'connection' || (animating && prevSection === 'connection')) && (
              <div className="settings-page">
                <div className="settings-section">
                  <div className="settings-section-label">Mode</div>
                  <div className="settings-mode-toggle">
                    <button
                      className={`settings-mode-btn${!demoMode ? ' active live' : ''}`}
                      onClick={() => setDemoMode(false)}
                    >
                      Live
                    </button>
                    <button
                      className={`settings-mode-btn${demoMode ? ' active demo' : ''}`}
                      onClick={() => setDemoMode(true)}
                    >
                      Demo
                    </button>
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-label">Home Assistant</div>
                  <div className="settings-ha-fields">
                    <div className="settings-ha-row">
                      <div className="settings-ha-field" style={{ flex: 3 }}>
                        <label className="settings-ha-label">URL</label>
                        <input
                          className="settings-ha-input"
                          type="text"
                          placeholder="192.168.1.xxx"
                          value={haUrl}
                          onChange={(e) => setHaUrl(e.target.value)}
                        />
                      </div>
                      <div className="settings-ha-field" style={{ flex: 1 }}>
                        <label className="settings-ha-label">Port</label>
                        <input
                          className="settings-ha-input"
                          type="number"
                          value={haPort}
                          onChange={(e) => setHaPort(parseInt(e.target.value) || 8123)}
                        />
                      </div>
                    </div>
                    <div className="settings-ha-field">
                      <label className="settings-ha-label">Token</label>
                      <input
                        className="settings-ha-input"
                        type="password"
                        placeholder="eyJhbGci..."
                        value={haToken}
                        onChange={(e) => setHaToken(e.target.value)}
                      />
                    </div>
                    <button
                      className={`settings-action-btn${haSaveStatus === 'success' ? ' ha-ok' : haSaveStatus === 'error' ? ' ha-err' : ''}`}
                      disabled={!haUrl || !haToken || haSaveStatus === 'testing'}
                      onClick={handleHASave}
                    >
                      {haSaveStatus === 'testing' ? 'Testing...'
                        : haSaveStatus === 'success' ? '\u2713 Connected'
                        : haSaveStatus === 'error' ? '\u2717 Failed'
                        : 'Save'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Appearance */}
            {(section === 'appearance' || (animating && prevSection === 'appearance')) && (
              <div className="settings-page">
                {/* Theme */}
                <div className="settings-section">
                  <div className="settings-section-label">Theme</div>
                  <div className="settings-mode-toggle">
                    <button className={`settings-mode-btn${theme === 'dark' ? ' active' : ''}`} onClick={() => setTheme('dark')}>Dark</button>
                    <button className={`settings-mode-btn${theme === 'light' ? ' active' : ''}`} onClick={() => setTheme('light')}>Light</button>
                    <button className={`settings-mode-btn${theme === 'auto' ? ' active' : ''}`} onClick={() => setTheme('auto')}>Day/Night</button>
                    <button className={`settings-mode-btn${theme === 'system' ? ' active' : ''}`} onClick={() => setTheme('system')}>System</button>
                  </div>
                </div>

                {/* Background */}
                <div className="settings-section">
                  <div className="settings-section-label">Background</div>
                  <div className="settings-swatch-row">
                    {(resolved === 'dark' ? BG_DARK : BG_LIGHT).map(({ hex, label }) => (
                      <button
                        key={hex}
                        className={`settings-swatch${(bgColor || (resolved === 'dark' ? BG_DARK : BG_LIGHT)[0].hex) === hex ? ' active' : ''}`}
                        style={{ background: hex }}
                        title={label}
                        onClick={() => { setBgColor(hex); updateAppearance({ bgColor: hex }); }}
                      />
                    ))}
                  </div>
                </div>

                {/* Primary Accent */}
                <div className="settings-section">
                  <div className="settings-section-label">Primary Accent</div>
                  <div className="settings-swatch-row">
                    {PRIMARY_ACCENTS.map(({ hex, label }) => (
                      <button
                        key={hex}
                        className={`settings-swatch${(primaryAccent || PRIMARY_ACCENTS[0].hex) === hex ? ' active' : ''}`}
                        style={{ background: hex }}
                        title={label}
                        onClick={() => { setPrimaryAccent(hex); updateAppearance({ primaryAccent: hex }); }}
                      />
                    ))}
                  </div>
                </div>

                {/* Status Accent */}
                <div className="settings-section">
                  <div className="settings-section-label">Status Accent</div>
                  <div className="settings-swatch-row">
                    {STATUS_ACCENTS.map(({ hex, label }) => (
                      <button
                        key={hex}
                        className={`settings-swatch${(statusAccent || STATUS_ACCENTS[0].hex) === hex ? ' active' : ''}`}
                        style={{ background: hex }}
                        title={label}
                        onClick={() => { setStatusAccent(hex); updateAppearance({ statusAccent: hex }); }}
                      />
                    ))}
                  </div>
                </div>

                {/* Panel Background */}
                <div className="settings-section">
                  <div className="settings-section-label">Panel Background</div>
                  <div className="settings-swatch-row">
                    {(resolved === 'dark' ? PANEL_BG_DARK : PANEL_BG_LIGHT).map(({ hex, label }) => (
                      <button
                        key={hex}
                        className={`settings-swatch${(panelBgColor || (resolved === 'dark' ? PANEL_BG_DARK : PANEL_BG_LIGHT)[0].hex) === hex ? ' active' : ''}`}
                        style={{ background: hex }}
                        title={label}
                        onClick={() => { setPanelBgColor(hex); updateAppearance({ panelBgColor: hex }); }}
                      />
                    ))}
                  </div>
                </div>

                {/* Side Panel Opacity */}
                <div className="settings-section">
                  <div className="settings-section-label">Side Panel Opacity</div>
                  <div className="settings-scrubber">
                    <input
                      type="range"
                      min={20}
                      max={100}
                      step={5}
                      value={panelOpacity}
                      onChange={(e) => {
                        const v = parseInt(e.target.value);
                        setPanelOpacity(v);
                        updateAppearance({ panelOpacity: v });
                      }}
                    />
                    <span className="settings-scrubber-time">{panelOpacity}%</span>
                  </div>
                </div>

                {/* Panel Dots */}
                <div className="settings-section">
                  <div className="settings-section-label">Panel Dots</div>
                  <div className="settings-mode-toggle">
                    <button className={`settings-mode-btn${panelDots ? ' active' : ''}`} onClick={() => { setPanelDots(true); updateAppearance({ panelDots: true }); }}>On</button>
                    <button className={`settings-mode-btn${!panelDots ? ' active' : ''}`} onClick={() => { setPanelDots(false); updateAppearance({ panelDots: false }); }}>Off</button>
                  </div>
                </div>

                {/* Border Style */}
                <div className="settings-section">
                  <div className="settings-section-label">Borders</div>
                  <div className="settings-mode-toggle">
                    <button className={`settings-mode-btn${borderStyle === 'subtle' ? ' active' : ''}`} onClick={() => { setBorderStyle('subtle'); updateAppearance({ borderStyle: 'subtle' }); }}>Subtle</button>
                    <button className={`settings-mode-btn${borderStyle === 'large' ? ' active' : ''}`} onClick={() => { setBorderStyle('large'); updateAppearance({ borderStyle: 'large' }); }}>Large</button>
                    <button className={`settings-mode-btn${borderStyle === 'none' ? ' active' : ''}`} onClick={() => { setBorderStyle('none'); updateAppearance({ borderStyle: 'none' }); }}>None</button>
                  </div>
                </div>

                {/* Corner Radius */}
                <div className="settings-section">
                  <div className="settings-section-label">Corner Radius</div>
                  <div className="settings-mode-toggle">
                    <button className={`settings-mode-btn${cornerRadius === 'sharp' ? ' active' : ''}`} onClick={() => { setCornerRadius('sharp'); updateAppearance({ cornerRadius: 'sharp' }); }}>Sharp</button>
                    <button className={`settings-mode-btn${cornerRadius === 'soft' ? ' active' : ''}`} onClick={() => { setCornerRadius('soft'); updateAppearance({ cornerRadius: 'soft' }); }}>Soft</button>
                    <button className={`settings-mode-btn${cornerRadius === 'round' ? ' active' : ''}`} onClick={() => { setCornerRadius('round'); updateAppearance({ cornerRadius: 'round' }); }}>Round</button>
                  </div>
                </div>

                {/* Backdrop */}
                <div className="settings-section">
                  <div className="settings-section-label">Backdrop</div>
                  <div className="settings-checkbox-group">
                    <label className="settings-checkbox">
                      <input type="checkbox" checked={backdropObscure} onChange={(e) => { setBackdropObscure(e.target.checked); updateAppearance({ backdropObscure: e.target.checked }); }} />
                      <span>Obscure</span>
                    </label>
                    <label className="settings-checkbox">
                      <input type="checkbox" checked={backdropBlur} onChange={(e) => { setBackdropBlur(e.target.checked); updateAppearance({ backdropBlur: e.target.checked }); }} />
                      <span>Blur</span>
                    </label>
                  </div>
                </div>

                {/* HUD */}
                <div className="settings-section">
                  <div className="settings-section-label">HUD</div>
                  <div className="settings-mode-toggle">
                    <button className={`settings-mode-btn${hudVisible ? ' active' : ''}`} onClick={() => { setHudVisible(true); updateAppearance({ hudVisible: true }); }}>Visible</button>
                    <button className={`settings-mode-btn${!hudVisible ? ' active' : ''}`} onClick={() => { setHudVisible(false); updateAppearance({ hudVisible: false }); }}>Hidden</button>
                  </div>
                </div>

              </div>
            )}

            {/* Render */}
            {(section === 'render' || (animating && prevSection === 'render')) && (
              <div className="settings-page">
                <div className="settings-section">
                  <div className="settings-section-label">Textures</div>
                  <div className="settings-mode-toggle">
                    <button
                      className={`settings-mode-btn${showTextures ? ' active' : ''}`}
                      onClick={() => onShowTexturesChange(true)}
                    >
                      On
                    </button>
                    <button
                      className={`settings-mode-btn${!showTextures ? ' active' : ''}`}
                      onClick={() => onShowTexturesChange(false)}
                    >
                      Off
                    </button>
                  </div>
                </div>

                {!showTextures && (
                  <>
                    <div className="settings-section">
                      <div className="settings-section-label">Sketch Color</div>
                      <input
                        type="color"
                        className="settings-color-input"
                        value={sketchColor}
                        onChange={(e) => onSketchColorChange(e.target.value)}
                      />
                    </div>

                    <div className="settings-section">
                      <div className="settings-section-label">Sheen</div>
                      <div className="settings-scrubber">
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={sketchSpecular}
                          onChange={(e) => onSketchSpecularChange(parseFloat(e.target.value))}
                        />
                        <span className="settings-scrubber-time">{sketchSpecular.toFixed(2)}</span>
                      </div>
                    </div>
                  </>
                )}

                <div className="settings-section">
                  <div className="settings-section-label">Edge Mode</div>
                  <div className="settings-mode-toggle">
                    <button
                      className={`settings-mode-btn${edgeMode === 'classic' ? ' active' : ''}`}
                      onClick={() => onEdgeModeChange('classic')}
                    >
                      Classic
                    </button>
                    <button
                      className={`settings-mode-btn${edgeMode === 'enhanced' ? ' active' : ''}`}
                      onClick={() => onEdgeModeChange('enhanced')}
                    >
                      Enhanced
                    </button>
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-label">Edge Width</div>
                  <div className="settings-scrubber">
                    <input
                      type="range"
                      min={0}
                      max={5}
                      step={0.1}
                      value={edgeWidth}
                      onChange={(e) => onEdgeWidthChange(parseFloat(e.target.value))}
                    />
                    <span className="settings-scrubber-time">{edgeWidth.toFixed(1)}</span>
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-label">Ground Grid</div>
                  <div className="settings-mode-toggle">
                    <button
                      className={`settings-mode-btn${groundGrid ? ' active' : ''}`}
                      onClick={() => onGroundGridChange(true)}
                    >
                      On
                    </button>
                    <button
                      className={`settings-mode-btn${!groundGrid ? ' active' : ''}`}
                      onClick={() => onGroundGridChange(false)}
                    >
                      Off
                    </button>
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-label">Perspective</div>
                  <div className="settings-mode-toggle">
                    <button
                      className={`settings-mode-btn${perspective ? ' active' : ''}`}
                      onClick={() => onPerspectiveChange(true)}
                    >
                      On
                    </button>
                    <button
                      className={`settings-mode-btn${!perspective ? ' active' : ''}`}
                      onClick={() => onPerspectiveChange(false)}
                    >
                      Off
                    </button>
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-label">Sun Shadow</div>
                  <div className="settings-mode-toggle">
                    {[0, 512, 1024, 2048, 4096].map((res) => (
                      <button
                        key={res}
                        className={`settings-mode-btn${sunShadowRes === res ? ' active' : ''}`}
                        onClick={() => onSunShadowResChange(res)}
                      >
                        {res === 0 ? 'Off' : res}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-label">Point Shadow</div>
                  <div className="settings-mode-toggle">
                    {[0, 256, 512, 1024, 2048].map((res) => (
                      <button
                        key={res}
                        className={`settings-mode-btn${pointShadowRes === res ? ' active' : ''}`}
                        onClick={() => onPointShadowResChange(res)}
                      >
                        {res === 0 ? 'Off' : res}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Environment */}
            {(section === 'environment' || (animating && prevSection === 'environment')) && (
              <div className="settings-page">
                <div className="settings-section">
                  <div className="settings-section-label">Location</div>
                  <div className="settings-ha-row">
                    <div className="settings-ha-field" style={{ flex: 1 }}>
                      <label className="settings-ha-label">Latitude</label>
                      <input
                        className="settings-ha-input"
                        type="number"
                        step="0.0001"
                        value={latitude}
                        onChange={(e) => {
                          setLatitude(e.target.value);
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val) && val >= -90 && val <= 90) {
                            updateConfig({ location: { latitude: val, longitude: parseFloat(longitude) || 0 } });
                          }
                        }}
                      />
                    </div>
                    <div className="settings-ha-field" style={{ flex: 1 }}>
                      <label className="settings-ha-label">Longitude</label>
                      <input
                        className="settings-ha-input"
                        type="number"
                        step="0.0001"
                        value={longitude}
                        onChange={(e) => {
                          setLongitude(e.target.value);
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val) && val >= -180 && val <= 180) {
                            updateConfig({ location: { latitude: parseFloat(latitude) || 0, longitude: val } });
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-label">Sun Position</div>
                  <div className="settings-scrubber">
                    <input
                      type="range"
                      min={0}
                      max={1439}
                      step={1}
                      value={sliderValue}
                      onChange={onSliderChange}
                    />
                    <span className="settings-scrubber-time">{scrubberTime}</span>
                    <button
                      className={`settings-live-btn${sunLiveMode ? ' active' : ''}`}
                      onClick={onLiveClick}
                    >
                      Live
                    </button>
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-label">Model Orientation</div>
                  <div className="settings-compass-row">
                    <svg
                      ref={compassRef}
                      className="settings-compass"
                      viewBox="0 0 100 100"
                      width="100"
                      height="100"
                      onPointerDown={handleCompassPointerDown}
                      onPointerMove={handleCompassPointerMove}
                      onPointerUp={handleCompassPointerUp}
                      style={{ touchAction: 'none' }}
                    >
                      <circle cx="50" cy="50" r="46" className="compass-ring" />
                      <text x="50" y="12" className="compass-label compass-n">N</text>
                      <text x="50" y="95" className="compass-label">S</text>
                      <text x="7" y="54" className="compass-label">W</text>
                      <text x="93" y="54" className="compass-label">E</text>
                      <g transform={`rotate(${northOffset}, 50, 50)`}>
                        <line x1="50" y1="50" x2="50" y2="14" className="compass-needle" />
                        <polygon points="50,14 46,24 54,24" className="compass-arrow" />
                        <circle cx="50" cy="50" r="3" className="compass-center" />
                      </g>
                    </svg>
                    <span className="settings-scrubber-time">{northOffset}&deg;</span>
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-label">Weather Effects</div>
                  <div className="settings-mode-toggle">
                    <button
                      className={`settings-mode-btn${weatherEnabled ? ' active' : ''}`}
                      onClick={() => onWeatherEnabledChange(true)}
                    >
                      On
                    </button>
                    <button
                      className={`settings-mode-btn${!weatherEnabled ? ' active' : ''}`}
                      onClick={() => onWeatherEnabledChange(false)}
                    >
                      Off
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Controls */}
            {(section === 'controls' || (animating && prevSection === 'controls')) && (
              <div className="settings-page">
                <div className="settings-section">
                  <div className="settings-section-label">Camera Controls</div>
                  <div className="settings-cam-grid">
                    <div className="settings-cam-row">
                      <Monitor size={16} strokeWidth={1.5} className="settings-cam-device-icon" />
                      {controlItems.map(({ key, icon: Icon }) => (
                        <button
                          key={`d-${key}`}
                          className={`settings-cam-btn${desktop[key] ? ' active' : ''}`}
                          onClick={() => toggleDesktop(key)}
                          title={`${key} (desktop)`}
                        >
                          <Icon size={16} strokeWidth={1.5} />
                        </button>
                      ))}
                    </div>
                    <div className="settings-cam-row">
                      <Smartphone size={16} strokeWidth={1.5} className="settings-cam-device-icon" />
                      {controlItems.map(({ key, icon: Icon }) => (
                        <button
                          key={`m-${key}`}
                          className={`settings-cam-btn${mobile[key] ? ' active' : ''}`}
                          onClick={() => toggleMobile(key)}
                          title={`${key} (mobile)`}
                        >
                          <Icon size={16} strokeWidth={1.5} />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-label">Home View</div>
                  <div className="settings-actions">
                    <button
                      className="settings-action-btn"
                      onClick={() => { onChangeHomeView(); onClose(); }}
                    >
                      Change Home View
                    </button>
                    {(getSetting('controls').homeView || homeViewReset === 'done') && (
                      <button
                        className={`settings-action-btn${homeViewReset === 'done' ? ' ha-ok' : ''}`}
                        style={homeViewReset === 'done' ? undefined : { borderColor: 'var(--red)', color: 'var(--red)' }}
                        disabled={homeViewReset === 'done'}
                        onClick={() => {
                          updateSettings('controls', { homeView: null });
                          setHomeViewReset('done');
                          setTimeout(() => setHomeViewReset('idle'), 1500);
                        }}
                      >
                        {homeViewReset === 'done' ? '\u2713 Reset' : 'Reset'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* System */}
            {(section === 'infos' || (animating && prevSection === 'infos')) && (
              <div className="settings-page">
                <div className="settings-section">
                  <div className="settings-section-label">Repository</div>
                  <a
                    className="settings-action-btn settings-repo-link"
                    href="https://github.com/Kdcius/3Dash_webapp"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Github size={16} strokeWidth={1.5} />
                    <span>3Dash_webapp</span>
                  </a>
                </div>

                <div className="settings-section">
                  <div className="settings-section-label">License</div>
                  <div className="settings-infos-license">
                    <Scale size={16} strokeWidth={1.5} />
                    <span>Apache-2.0</span>
                  </div>
                </div>

                <div className="settings-divider" />

                <div className="settings-infos-footer">
                  <HeartHandshake size={16} strokeWidth={1.5} />
                  <span>Built with love in Montpellier</span>
                </div>
              </div>
            )}

            {(section === 'system' || (animating && prevSection === 'system')) && (
              <div className="settings-page">
                <div className="settings-section">
                  <div className="settings-section-label">Backup</div>
                  <div className="settings-actions">
                    <button className="settings-action-btn" onClick={exportBackup}>
                      Export
                    </button>
                    <button
                      className={`settings-action-btn${importStatus === 'success' ? ' ha-ok' : importStatus === 'error' ? ' ha-err' : ''}`}
                      onClick={() => importInputRef.current?.click()}
                    >
                      {importStatus === 'success' ? '\u2713 Imported' : importStatus === 'error' ? '\u2717 Failed' : 'Import'}
                    </button>
                    <input
                      ref={importInputRef}
                      type="file"
                      accept=".zip"
                      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0 }}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          await importBackup(file);
                          setImportStatus('success');
                          setTimeout(() => window.location.reload(), 800);
                        } catch {
                          setImportStatus('error');
                          setTimeout(() => setImportStatus('idle'), 3000);
                        }
                        e.target.value = '';
                      }}
                    />
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-label">DEBUG</div>
                  <div className="settings-actions">
                    <button className="settings-action-btn" onClick={() => { onDebugToggle(); onClose(); }}>
                      Render
                    </button>
                  </div>
                </div>

                <div className="settings-section">
                  <div className="settings-section-label">Reset</div>
                  <div className="settings-actions">
                    {confirmReset ? (
                      <>
                        <span style={{ fontSize: 10, color: 'var(--red)', alignSelf: 'center' }}>Erase all config?</span>
                        <button
                          className="settings-action-btn"
                          style={{ borderColor: 'var(--red)', color: 'var(--red)' }}
                          onClick={async () => {
                            await resetConfig();
                            clearSettings();
                            onClose();
                            navigate('/onboarding');
                          }}
                        >
                          Confirm
                        </button>
                        <button className="settings-action-btn" onClick={() => setConfirmReset(false)}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        className="settings-action-btn"
                        style={{ borderColor: 'var(--red)', color: 'var(--red)' }}
                        onClick={() => setConfirmReset(true)}
                      >
                        Reset &amp; Restart Onboarding
                      </button>
                    )}
                  </div>
                </div>

                <div className="settings-divider" />

                <div className="settings-status">
                  <div className="settings-status-chip">
                    Lights on <span>{lightsOnCount}</span>
                  </div>
                  <div className="settings-status-chip">
                    HA <span style={{ color: demoMode ? 'var(--orange)' : haStatusColor }}>
                      {demoMode ? 'demo' : haStatusText}
                    </span>
                  </div>
                  <div className="settings-status-chip">
                    Model <span style={{ color: modelStatusColor }}>{modelStatus}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
