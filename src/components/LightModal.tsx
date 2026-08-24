import { useState, useEffect, useCallback } from 'react';
import ColorWheel, { hslToRgb } from './ColorWheel';
import { kelvinToRGB, miredToKelvin } from '../utils/color';
import type { LightType, HAState } from '../types';
import './LightModal.css';

interface Props {
  visible: boolean;
  entityId: string | null;
  label: string;
  lightType: LightType;
  state: HAState | null;
  onClose: () => void;
  onToggle: (entityId: string) => void;
  onBrightness: (entityId: string, brightness: number) => void;
  onColorTemp: (entityId: string, colorTemp: number) => void;
  onColor: (entityId: string, color: { r: number; g: number; b: number }, brightness: number) => void;
  onWhiteChannel: (entityId: string, white: number) => void;
  /** Sets speed on a fan-domain entity. Used for the double-tap entity when it
   *  is a fan, e.g. a ceiling fan attached to a ceiling light. */
  onFanSpeed?: (entityId: string, percentage: number) => void;
  doubleTapEntityId?: string;
  doubleTapState?: HAState | null;
}

export default function LightModal({
  visible,
  entityId,
  label,
  lightType,
  state,
  onClose,
  onToggle,
  onBrightness,
  onColorTemp,
  onColor,
  onWhiteChannel,
  onFanSpeed,
  doubleTapEntityId,
  doubleTapState,
}: Props) {
  const [brightness, setBrightness] = useState(255);
  const [colorTemp, setColorTemp] = useState(300);
  const [whiteValue, setWhiteValue] = useState(0);
  const [hue, setHue] = useState(0);
  const [whiteKelvin, setWhiteKelvin] = useState(4000);
  const [isOn, setIsOn] = useState(false);
  const [dtIsOn, setDtIsOn] = useState(false);
  const [fanPercent, setFanPercent] = useState(0);

  // Sync state when modal opens or state changes
  useEffect(() => {
    if (!state) return;
    setIsOn(state.state === 'on');
    const a = state.attributes;
    if (a.brightness !== undefined) setBrightness(a.brightness);
    if (a.color_temp !== undefined) setColorTemp(a.color_temp);
    if (a.rgb_color) {
      // Derive hue from current RGB
      const [r, g, b] = a.rgb_color;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const d = max - min;
      let h = 0;
      if (d > 0) {
        if (max === r) h = ((g - b) / d + 6) % 6;
        else if (max === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h *= 60;
      }
      setHue(Math.round(h));
    }
  }, [state, entityId]);

  useEffect(() => {
    setDtIsOn(doubleTapState?.state === 'on');
    const pct = doubleTapState?.attributes?.percentage;
    if (typeof pct === 'number') setFanPercent(pct);
  }, [doubleTapState]);

  const handleDoubleTapToggle = useCallback(() => {
    if (!doubleTapEntityId) return;
    onToggle(doubleTapEntityId);
    setDtIsOn((prev) => !prev);
  }, [doubleTapEntityId, onToggle]);

  const handleFanSpeedChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      // parseFloat, not parseInt: the step is 100 / speed_count and is usually
      // fractional, so truncating would drift a little further off with every
      // notch. Home Assistant wants a whole percentage, so round only on the
      // way out and keep the exact value for the slider position.
      const val = parseFloat(e.target.value);
      setFanPercent(val);
      if (doubleTapEntityId && onFanSpeed) onFanSpeed(doubleTapEntityId, Math.round(val));
    },
    [doubleTapEntityId, onFanSpeed],
  );

  const handleToggle = useCallback(() => {
    if (!entityId) return;
    onToggle(entityId);
    setIsOn((prev) => !prev);
  }, [entityId, onToggle]);

  const handleBrightness = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseInt(e.target.value);
      setBrightness(val);
      if (entityId) onBrightness(entityId, val);
    },
    [entityId, onBrightness],
  );

  const handleTemp = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseInt(e.target.value);
      setColorTemp(val);
      if (entityId) onColorTemp(entityId, val);
    },
    [entityId, onColorTemp],
  );

  const handleWhite = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseInt(e.target.value);
      setWhiteValue(val);
      if (entityId) onWhiteChannel(entityId, val);
    },
    [entityId, onWhiteChannel],
  );

  const handleHueChange = useCallback(
    (h: number) => {
      setHue(h);
      if (!entityId) return;
      const rgb = hslToRgb(h);
      onColor(entityId, rgb, brightness);
    },
    [entityId, brightness, onColor],
  );

  const handleWhiteKelvin = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const k = parseInt(e.target.value);
      setWhiteKelvin(k);
      if (!entityId) return;
      const { r, g, b } = kelvinToRGB(k);
      onColor(entityId, {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255),
      }, brightness);
    },
    [entityId, brightness, onColor],
  );

  const showBrightness = ['dimmeable', 'warmCold', 'rgb', 'rgbw'].includes(lightType);
  const showTemp = lightType === 'warmCold';
  const showColor = lightType === 'rgb' || lightType === 'rgbw';
  const showWhite = lightType === 'rgbw';

  // A fan attached via double-tap gets its own speed slider. Keyed off the
  // entity domain rather than the light type, so any fan works without needing
  // a separate light type.
  const showFanSpeed = !!doubleTapEntityId && doubleTapEntityId.startsWith('fan.') && !!onFanSpeed;
  // Home Assistant reports 100 / speed_count as percentage_step. Snapping the
  // slider to it means every drag lands on a real speed instead of a value the
  // fan has to round, which would make the slider jump back under your finger.
  const rawStep = doubleTapState?.attributes?.percentage_step;
  const fanStep = typeof rawStep === 'number' && rawStep > 0 ? rawStep : 1;
  const fanSpeedCount = Math.max(1, Math.round(100 / fanStep));
  const fanSpeedIndex = Math.round(fanPercent / fanStep);

  return (
    <div
      className={`modal-backdrop${visible ? ' visible' : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="light-modal">
        <div className="modal-header">
          <div className="modal-title">
            <div
              className="modal-bulb-icon"
              style={{
                background: isOn ? 'rgba(251,191,36,0.15)' : 'transparent',
                borderColor: isOn ? '#fbbf24' : '#334155',
              }}
            >
              &#128161;
            </div>
            <div>
              <div className="modal-entity-name">{label}</div>
              <div className="modal-entity-id">{entityId}</div>
            </div>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            &#10005;
          </button>
        </div>

        <div className="modal-body">
          {/* Toggle */}
          <div className="modal-row">
            <span className="modal-label">Power</span>
            <label className="toggle-switch">
              <input type="checkbox" checked={isOn} onChange={handleToggle} />
              <div className="toggle-track" />
              <div className="toggle-thumb" />
            </label>
          </div>

          {/* Double-tap entity toggle */}
          {doubleTapEntityId && (
            <div className="modal-row">
              <span className="modal-label">{doubleTapEntityId.split('.')[1]?.replace(/_/g, ' ') || doubleTapEntityId}</span>
              <label className="toggle-switch">
                <input type="checkbox" checked={dtIsOn} onChange={handleDoubleTapToggle} />
                <div className="toggle-track" />
                <div className="toggle-thumb" />
              </label>
            </div>
          )}

          {/* Fan speed, for a fan attached via double-tap */}
          {showFanSpeed && (
            <div className="modal-slider-wrap">
              <div className="slider-header">
                <span className="modal-label">Speed</span>
                <span className="slider-value">
                  {fanSpeedIndex === 0 ? 'Off' : `${fanSpeedIndex} / ${fanSpeedCount}`}
                </span>
              </div>
              <input
                type="range"
                className="modal-slider fan-speed"
                min={0}
                max={100}
                step={fanStep}
                value={fanPercent}
                onChange={handleFanSpeedChange}
              />
            </div>
          )}

          {/* Brightness */}
          {showBrightness && (
            <div className="modal-slider-wrap">
              <div className="slider-header">
                <span className="modal-label">Brightness</span>
                <span className="slider-value">
                  {Math.round((brightness / 255) * 100)}%
                </span>
              </div>
              <input
                type="range"
                className="modal-slider brightness"
                min={1}
                max={255}
                value={brightness}
                onChange={handleBrightness}
              />
            </div>
          )}

          {/* Color temp */}
          {showTemp && (
            <div className="modal-slider-wrap">
              <div className="slider-header">
                <span className="modal-label">Temperature</span>
                <span className="slider-value">
                  {miredToKelvin(colorTemp)}K
                </span>
              </div>
              <input
                type="range"
                className="modal-slider warmcold"
                min={153}
                max={500}
                value={colorTemp}
                onChange={handleTemp}
              />
            </div>
          )}

          {/* Hue ring */}
          {showColor && (
            <div className="color-section">
              <span className="modal-label">Color</span>
              <div className="hue-ring-wrap">
                <ColorWheel hue={hue} onChange={handleHueChange} />
              </div>
              <div className="modal-slider-wrap">
                <div className="slider-header">
                  <span className="modal-label">White tone</span>
                  <span className="slider-value">{whiteKelvin}K</span>
                </div>
                <input
                  type="range"
                  className="modal-slider warmcold"
                  min={2000}
                  max={6500}
                  value={whiteKelvin}
                  onChange={handleWhiteKelvin}
                />
              </div>
            </div>
          )}

          {/* White channel */}
          {showWhite && (
            <div className="modal-slider-wrap">
              <span className="modal-label">White channel</span>
              <div className="slider-header">
                <span className="modal-label" style={{ opacity: 0 }}>
                  &zwnj;
                </span>
                <span className="slider-value">
                  {Math.round((whiteValue / 255) * 100)}%
                </span>
              </div>
              <input
                type="range"
                className="modal-slider white"
                min={0}
                max={255}
                value={whiteValue}
                onChange={handleWhite}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
