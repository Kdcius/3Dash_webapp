import { useState, useEffect, useCallback } from 'react';
import type { TubeConfig, TubeLineConfig, TubeInputUnit, TubeOriginDirection, LightPosition } from '../types';
import { generateUUID } from '../utils/uuid';
import LucideIcon from './SidePanel/cards/LucideIcon';
import { FormPanel, AccordionSection } from './FormPanel';
import EntityPicker, { type HAEntityOption } from './EntityPicker';

export interface TubePreviewInfo {
  config: TubeConfig;
}

interface Props {
  open: boolean;
  editTube: TubeConfig | null;
  position: LightPosition;
  onPositionChange: (pos: LightPosition) => void;
  onSave: (cfg: TubeConfig) => void;
  onClose: () => void;
  onPreviewChange: (info: TubePreviewInfo) => void;
  haEntities?: HAEntityOption[];
}

const DIRECTION_OPTIONS: { value: TubeOriginDirection; label: string }[] = [
  { value: 'left', label: '\u2190 Left' },
  { value: 'right', label: '\u2192 Right' },
  { value: 'top', label: '\u2191 Top' },
  { value: 'bottom', label: '\u2193 Bottom' },
];

const UNIT_OPTIONS: TubeInputUnit[] = ['b', 'kb', 'mb', 'gb', 'tb', 'B', 'kB', 'mB', 'gB', 'tB'];

const PRESET_UNITS = [
  { value: '', label: 'Network speed (bits/bytes)' },
  { value: 'W', label: 'Watts (W)' },
  { value: 'L', label: 'Liters (L)' },
  { value: 'L/min', label: 'Liters/min (L/min)' },
  { value: 'm³', label: 'Cubic meters (m³)' },
  { value: 'm³/h', label: 'Cubic meters/h (m³/h)' },
  { value: '°C', label: 'Celsius (°C)' },
  { value: '%', label: 'Percent (%)' },
  { value: 'A', label: 'Amps (A)' },
  { value: 'V', label: 'Volts (V)' },
  { value: 'Wh', label: 'Watt-hours (Wh)' },
  { value: 'Pa', label: 'Pascals (Pa)' },
  { value: 'custom', label: 'Custom...' },
];

function defaultLine(): TubeLineConfig {
  return { sensorId: '', color: '#00aaff' };
}

export default function TubeForm({
  open,
  editTube,
  position,
  onPositionChange,
  onSave,
  onClose,
  onPreviewChange,
  haEntities = [],
}: Props) {
  const [label, setLabel] = useState('');
  const [originDirection, setOriginDirection] = useState<TubeOriginDirection>('left');
  const [diameter, setDiameter] = useState(0.08);
  const [fontSize, setFontSize] = useState(48);
  const [gap, setGap] = useState(0.25);
  const [labelPosition, setLabelPosition] = useState(0.95);
  const [labelHeight, setLabelHeight] = useState(0.3);
  const [lines, setLines] = useState<TubeLineConfig[]>([defaultLine()]);

  // Init form from editTube
  useEffect(() => {
    if (!open) return;
    if (editTube) {
      setLabel(editTube.label);
      setOriginDirection(editTube.originDirection);
      setDiameter(editTube.diameter);
      setFontSize(editTube.fontSize);
      setGap(editTube.gap);
      setLabelPosition(editTube.labelPosition ?? 0.95);
      setLabelHeight(editTube.labelHeight ?? 0.3);
      setLines(editTube.lines.length > 0 ? editTube.lines.map(l => ({ ...l })) : [defaultLine()]);
    } else {
      setLabel('');
      setOriginDirection('left');
      setDiameter(0.08);
      setFontSize(48);
      setGap(0.25);
      setLabelPosition(0.95);
      setLabelHeight(0.3);
      setLines([defaultLine()]);
    }
  }, [open, editTube]);

  // Build a config snapshot for preview
  const buildConfig = useCallback((): TubeConfig => ({
    id: editTube?.id || '__preview__',
    label,
    originDirection,
    diameter,
    fontSize,
    gap,
    endX: position.x,
    endZ: position.z,
    labelPosition,
    labelHeight,
    lines,
  }), [editTube, label, originDirection, diameter, fontSize, gap, position, labelPosition, labelHeight, lines]);

  // Notify parent of preview changes
  useEffect(() => {
    if (!open) return;
    onPreviewChange({ config: buildConfig() });
  }, [open, label, originDirection, diameter, fontSize, gap, labelPosition, labelHeight, lines, position]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePosChange = useCallback(
    (axis: 'x' | 'z', value: number) => {
      onPositionChange({ ...position, [axis]: parseFloat(value.toFixed(3)) });
    },
    [position, onPositionChange],
  );

  const handleLineChange = useCallback((idx: number, field: keyof TubeLineConfig, value: string | boolean) => {
    setLines(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      if (field === 'icon') return { ...l, icon: (value as string) || undefined };
      if (field === 'displayUnit') return { ...l, displayUnit: (value as string) || undefined };
      if (field === 'precision')
        return { ...l, precision: parseInt(value as string, 10) };
      if (field === 'particleSpeed' || field === 'particleMaxValue')
        return { ...l, [field]: parseFloat(value as string) || undefined };
      return { ...l, [field]: value };
    }));
  }, []);

  const addLine = useCallback(() => {
    setLines(prev => [...prev, { sensorId: '', color: prev.length % 2 === 0 ? '#00aaff' : '#22c55e' }]);
  }, []);

  const removeLine = useCallback((idx: number) => {
    setLines(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);
  }, []);

  const handleSave = useCallback(() => {
    const cfg: TubeConfig = {
      id: editTube?.id || generateUUID(),
      label: label || 'Tube',
      originDirection,
      diameter,
      fontSize,
      gap,
      endX: position.x,
      endZ: position.z,
      labelPosition,
      labelHeight,
      lines,
    };
    onSave(cfg);
  }, [editTube, label, originDirection, diameter, fontSize, gap, position, labelPosition, labelHeight, lines, onSave]);

  const footer = (
    <>
      <button className="btn btn-success" onClick={handleSave}>
        &#10003; Save Tube
      </button>
      <button className="btn btn-ghost" onClick={onClose}>
        Cancel
      </button>
    </>
  );

  return (
    <FormPanel
      open={open}
      title={editTube ? 'Edit Tube' : 'Add Tube'}
      onClose={onClose}
      footer={footer}
    >
      <AccordionSection title="Label" defaultOpen>
        <div className="field-group">
          <input
            type="text"
            className="field-input"
            placeholder="e.g. Network Speed"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
      </AccordionSection>

      <AccordionSection title="Origin Direction" defaultOpen>
        <div className="field-group">
          <select
            className="field-input"
            value={originDirection}
            onChange={(e) => setOriginDirection(e.target.value as TubeOriginDirection)}
          >
            {DIRECTION_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </AccordionSection>

      <AccordionSection title="Tube Settings">
        {([
          { label: 'Diameter', value: diameter, set: setDiameter, min: 0.01, max: 0.5, step: 0.01 },
          { label: 'Gap', value: gap, set: setGap, min: 0.05, max: 2, step: 0.05 },
          { label: 'Font Size', value: fontSize, set: setFontSize, min: 12, max: 120, step: 2 },
        ] as const).map(({ label: lbl, value, set, min, max, step }) => (
          <div key={lbl} className="tube-slider-group">
            <span className="tube-slider-label">{lbl}</span>
            <div className="tube-slider-row">
              <input
                type="range"
                className="pos-slider"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => set(parseFloat(e.target.value))}
              />
              <input
                type="number"
                className="pos-num"
                step={step}
                min={min}
                value={value}
                onChange={(e) => set(parseFloat(e.target.value) || min)}
              />
            </div>
          </div>
        ))}
      </AccordionSection>

      <AccordionSection title="Label Positioning">
        {([
          { label: 'Position', value: labelPosition, set: setLabelPosition, min: 0, max: 1, step: 0.01 },
          { label: 'Height', value: labelHeight, set: setLabelHeight, min: 0, max: 3, step: 0.05 },
        ] as const).map(({ label: lbl, value, set, min, max, step }) => (
          <div key={lbl} className="tube-slider-group">
            <span className="tube-slider-label">{lbl}</span>
            <div className="tube-slider-row">
              <input
                type="range"
                className="pos-slider"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => set(parseFloat(e.target.value))}
              />
              <input
                type="number"
                className="pos-num"
                step={step}
                min={min}
                value={value}
                onChange={(e) => set(parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>
        ))}
      </AccordionSection>

      <AccordionSection title="Endpoint Position" defaultOpen>
        <div className="placement-hint visible">
          Drag the gizmo or adjust below.
        </div>
        {([
          { label: 'X', color: '#f87171', axis: 'x' as const },
          { label: 'Y', color: '#38bdf8', axis: 'z' as const },
        ]).map(({ label: lbl, color, axis }) => (
          <div key={axis} className="pos-grid">
            <span className="pos-axis" style={{ color }}>{lbl}</span>
            <input
              type="range"
              className="pos-slider"
              min={-15}
              max={15}
              step={0.05}
              value={position[axis]}
              onChange={(e) => handlePosChange(axis, parseFloat(e.target.value))}
            />
            <input
              type="number"
              className="pos-num"
              step={0.05}
              value={position[axis]}
              onChange={(e) => handlePosChange(axis, parseFloat(e.target.value) || 0)}
            />
          </div>
        ))}
      </AccordionSection>

      <AccordionSection title="Sensor Lines" defaultOpen>
        <button className="btn-inline" onClick={addLine} style={{ fontSize: '0.85em', alignSelf: 'flex-start' }}>
          + Add Line
        </button>
        {lines.map((line, i) => (
          <div key={i} className="tube-line-row" style={{ flexWrap: 'wrap' }}>
            <input
              type="color"
              className="tube-line-color"
              value={line.color}
              onChange={(e) => handleLineChange(i, 'color', e.target.value)}
              title="Line color"
            />
            <div className="tube-line-sensor" style={{ flex: 1 }}>
              <EntityPicker
                value={line.sensorId}
                onChange={(v) => handleLineChange(i, 'sensorId', v)}
                onSelect={(ent) => { if (i === 0 && !label.trim() && ent.friendly_name) setLabel(ent.friendly_name); }}
                placeholder="sensor.entity_id"
                entities={haEntities}
                className="field-input"
              />
            </div>
            {lines.length > 1 && (
              <button
                className="tube-line-remove"
                onClick={() => removeLine(i)}
                title="Remove line"
              >
                &times;
              </button>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', marginTop: 4 }}>
              <input
                type="text"
                className="field-input"
                style={{ flex: 1 }}
                placeholder="icon (e.g. Wifi)"
                value={line.icon ?? ''}
                onChange={(e) => handleLineChange(i, 'icon', e.target.value || '')}
              />
              {line.icon && (
                <LucideIcon
                  name={line.icon}
                  size={16}
                  color={line.color}
                  style={{ flexShrink: 0 }}
                />
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', marginTop: 4 }}>
              <span style={{ fontSize: '0.75em', opacity: 0.6, whiteSpace: 'nowrap' }}>Unit</span>
              <select
                className="field-input"
                style={{ flex: 1 }}
                value={
                  !line.displayUnit ? ''
                    : PRESET_UNITS.some(p => p.value === line.displayUnit) ? line.displayUnit
                    : 'custom'
                }
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === 'custom') {
                    handleLineChange(i, 'displayUnit', 'unit');
                  } else {
                    handleLineChange(i, 'displayUnit', v);
                  }
                }}
                title="Display unit"
              >
                {PRESET_UNITS.map(p => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            {line.displayUnit && !PRESET_UNITS.some(p => p.value === line.displayUnit && p.value !== 'custom') && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', marginTop: 4 }}>
                <span style={{ fontSize: '0.75em', opacity: 0.6, whiteSpace: 'nowrap' }}>Custom unit</span>
                <input
                  type="text"
                  className="field-input"
                  style={{ flex: 1 }}
                  placeholder="e.g. dB, lux, ppm"
                  value={line.displayUnit ?? ''}
                  onChange={(e) => handleLineChange(i, 'displayUnit', e.target.value || '')}
                />
              </div>
            )}
            {!line.displayUnit && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', marginTop: 4 }}>
                <span style={{ fontSize: '0.75em', opacity: 0.6, whiteSpace: 'nowrap' }}>Input</span>
                <select
                  className="field-input"
                  style={{ flex: 1 }}
                  value={line.inputUnit ?? 'b'}
                  onChange={(e) => handleLineChange(i, 'inputUnit', e.target.value)}
                  title="Unit the sensor reports"
                >
                  {UNIT_OPTIONS.map(u => (
                    <option key={u} value={u}>{u}/s</option>
                  ))}
                </select>
                <span style={{ fontSize: '0.75em', opacity: 0.6, whiteSpace: 'nowrap' }}>Display</span>
                <select
                  className="field-input"
                  style={{ flex: 1 }}
                  value={line.displayBytes ? 'bytes' : 'bits'}
                  onChange={(e) => handleLineChange(i, 'displayBytes', e.target.value === 'bytes')}
                  title="Unit shown on the 3D label"
                >
                  <option value="bits">bits</option>
                  <option value="bytes">bytes</option>
                </select>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', marginTop: 4 }}>
              <span style={{ fontSize: '0.75em', opacity: 0.6, whiteSpace: 'nowrap' }}>Decimals</span>
              <input
                type="range"
                className="pos-slider"
                style={{ flex: 1 }}
                min={0}
                max={4}
                step={1}
                value={line.precision ?? 1}
                onChange={(e) => handleLineChange(i, 'precision', e.target.value)}
              />
              <input
                type="number"
                className="pos-num"
                style={{ width: 45 }}
                min={0}
                max={4}
                step={1}
                value={line.precision ?? 1}
                onChange={(e) => handleLineChange(i, 'precision', e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', marginTop: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75em', opacity: 0.6, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={!!line.particles}
                  onChange={(e) => handleLineChange(i, 'particles', e.target.checked)}
                />
                Particles
              </label>
              {line.particles && (
                <>
                  <span style={{ fontSize: '0.75em', opacity: 0.6, whiteSpace: 'nowrap' }}>Direction</span>
                  <select
                    className="field-input"
                    style={{ flex: 1 }}
                    value={line.particleDirection ?? 'inward'}
                    onChange={(e) => handleLineChange(i, 'particleDirection', e.target.value)}
                    title="Particle flow direction"
                  >
                    <option value="inward">Inward</option>
                    <option value="outward">Outward</option>
                  </select>
                </>
              )}
            </div>
            {line.particles && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', marginTop: 4 }}>
                <span style={{ fontSize: '0.75em', opacity: 0.6, whiteSpace: 'nowrap' }}>Speed</span>
                <input
                  type="range"
                  className="pos-slider"
                  style={{ flex: 1 }}
                  min={0.1}
                  max={5}
                  step={0.1}
                  value={line.particleSpeed ?? 1}
                  onChange={(e) => handleLineChange(i, 'particleSpeed', e.target.value)}
                />
                <input
                  type="number"
                  className="pos-num"
                  style={{ width: 50 }}
                  min={0.1}
                  max={5}
                  step={0.1}
                  value={line.particleSpeed ?? 1}
                  onChange={(e) => handleLineChange(i, 'particleSpeed', e.target.value)}
                />
                <span style={{ fontSize: '0.75em', opacity: 0.6, whiteSpace: 'nowrap' }}>Max value</span>
                <input
                  type="number"
                  className="pos-num"
                  style={{ width: 70 }}
                  min={1}
                  step={1}
                  value={line.particleMaxValue ?? 1000}
                  onChange={(e) => handleLineChange(i, 'particleMaxValue', e.target.value)}
                  title="Sensor value at which particles reach max speed"
                />
              </div>
            )}
          </div>
        ))}
      </AccordionSection>
    </FormPanel>
  );
}
