import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import type { LightConfig, LightType, LightPosition, LightPart, HitboxConfig } from '../types';
import { FormPanel, AccordionSection } from './FormPanel';
import EntityPicker, { type HAEntityOption } from './EntityPicker';

interface PartState {
  shape: 'sphere' | 'cube';
  diameter: number;
  width: number;
  height: number;
  depth: number;
  posX: number;
  posY: number;
  posZ: number;
}

const defaultPart = (pos: LightPosition): PartState => ({
  shape: 'cube',
  diameter: 0.25,
  width: 0.3,
  height: 0.3,
  depth: 0.3,
  posX: pos.x,
  posY: pos.y,
  posZ: pos.z,
});

function partFromConfig(p: LightPart): PartState {
  return {
    shape: p.shape,
    diameter: p.size?.diameter ?? 0.25,
    width: p.size?.width ?? 0.3,
    height: p.size?.height ?? 0.3,
    depth: p.size?.depth ?? 0.3,
    posX: p.position.x,
    posY: p.position.y,
    posZ: p.position.z,
  };
}

function partToConfig(p: PartState): LightPart {
  return {
    shape: p.shape,
    size: p.shape === 'cube'
      ? { width: p.width, height: p.height, depth: p.depth }
      : { diameter: p.diameter },
    position: { x: p.posX, y: p.posY, z: p.posZ },
  };
}

export interface PreviewInfo {
  shape: 'sphere' | 'cube';
  size: Record<string, number>;
  parts?: Array<{ shape: 'sphere' | 'cube'; size: Record<string, number>; position: LightPosition }>;
  hitbox?: {
    shape: 'sphere' | 'cube';
    size: Record<string, number>;
    position: LightPosition;
  };
}

export interface LightFormHandle {
  updatePartPosition: (index: number, pos: LightPosition) => void;
  updateHitboxPosition: (pos: LightPosition) => void;
}

interface Props {
  open: boolean;
  editLight: LightConfig | null;
  position: LightPosition;
  onPositionChange: (pos: LightPosition) => void;
  onSave: (config: LightConfig) => void;
  onClose: () => void;
  onEnterPlacingMode: () => void;
  onExitPlacingMode: () => void;
  onPreviewChange: (info: PreviewInfo) => void;
  placingMode: boolean;
  haEntities?: HAEntityOption[];
}

const LightForm = forwardRef<LightFormHandle, Props>(function LightForm({
  open,
  editLight,
  position,
  onPositionChange,
  onSave,
  onClose,
  onEnterPlacingMode,
  onExitPlacingMode,
  onPreviewChange,
  placingMode,
  haEntities = [],
}, ref) {
  const [entityId, setEntityId] = useState('');
  const [label, setLabel] = useState('');
  const [type, setType] = useState<LightType>('toggle');
  const [shape, setShape] = useState<'sphere' | 'cube'>('sphere');
  const [diameter, setDiameter] = useState(0.25);
  const [width, setWidth] = useState(0.3);
  const [height, setHeight] = useState(0.3);
  const [depth, setDepth] = useState(0.3);
  const [warmth, setWarmth] = useState(3000);
  const [brightness, setBrightness] = useState(1);
  const [doubleTapEntityId, setDoubleTapEntityId] = useState('');
  const [hidden, setHidden] = useState(false);

  // Multi-part state
  const [multiPart, setMultiPart] = useState(false);
  const [parts, setParts] = useState<PartState[]>([]);

  // Hitbox state
  const [useCustomHitbox, setUseCustomHitbox] = useState(false);
  const [hbShape, setHbShape] = useState<'sphere' | 'cube'>('sphere');
  const [hbDiameter, setHbDiameter] = useState(0.5);
  const [hbWidth, setHbWidth] = useState(0.5);
  const [hbHeight, setHbHeight] = useState(0.5);
  const [hbDepth, setHbDepth] = useState(0.5);
  const [hbPosX, setHbPosX] = useState(0);
  const [hbPosY, setHbPosY] = useState(2.5);
  const [hbPosZ, setHbPosZ] = useState(0);

  // Notify tour when required fields are filled (fires on every change so Back navigation works)
  useEffect(() => {
    if (label.trim() && entityId.trim()) {
      document.dispatchEvent(new Event('tour:form-filled'));
    }
  }, [label, entityId]);

  // Expose imperative methods for gizmo-driven position updates
  useImperativeHandle(ref, () => ({
    updatePartPosition: (index: number, pos: LightPosition) => {
      setParts(prev => prev.map((p, i) => i === index ? { ...p, posX: pos.x, posY: pos.y, posZ: pos.z } : p));
    },
    updateHitboxPosition: (pos: LightPosition) => {
      setHbPosX(pos.x);
      setHbPosY(pos.y);
      setHbPosZ(pos.z);
    },
  }));

  // Populate form when editing, or reset when opening for a new light
  useEffect(() => {
    if (!open) return;
    if (editLight) {
      setEntityId(editLight.entityId);
      setLabel(editLight.label || '');
      setType(editLight.type || 'toggle');
      setShape(editLight.shape || 'sphere');
      setDiameter(editLight.size?.diameter ?? 0.25);
      setWidth(editLight.size?.width ?? 0.3);
      setHeight(editLight.size?.height ?? 0.3);
      setDepth(editLight.size?.depth ?? 0.3);
      setWarmth(editLight.warmth ?? 3000);
      setBrightness(editLight.brightness ?? 1);
      setDoubleTapEntityId(editLight.doubleTapEntityId ?? '');
      setHidden(!!editLight.hidden);
      const hasParts = editLight.parts && editLight.parts.length > 0;
      setMultiPart(!!hasParts);
      setParts(hasParts ? editLight.parts!.map(partFromConfig) : []);
      setUseCustomHitbox(!!editLight.hitbox);
      setHbShape(editLight.hitbox?.shape ?? 'sphere');
      setHbDiameter(editLight.hitbox?.size?.diameter ?? 0.5);
      setHbWidth(editLight.hitbox?.size?.width ?? 0.5);
      setHbHeight(editLight.hitbox?.size?.height ?? 0.5);
      setHbDepth(editLight.hitbox?.size?.depth ?? 0.5);
      setHbPosX(editLight.hitbox?.position?.x ?? editLight.position.x);
      setHbPosY(editLight.hitbox?.position?.y ?? editLight.position.y);
      setHbPosZ(editLight.hitbox?.position?.z ?? editLight.position.z);
    } else {
      setEntityId('');
      setLabel('');
      setType('toggle');
      setShape('sphere');
      setDiameter(0.25);
      setWidth(0.3);
      setHeight(0.3);
      setDepth(0.3);
      setWarmth(3000);
      setBrightness(1);
      setDoubleTapEntityId('');
      setHidden(false);
      setMultiPart(false);
      setParts([]);
      setUseCustomHitbox(false);
      setHbShape('sphere');
      setHbDiameter(0.5);
      setHbWidth(0.5);
      setHbHeight(0.5);
      setHbDepth(0.5);
      setHbPosX(0);
      setHbPosY(2.5);
      setHbPosZ(0);
    }
  }, [editLight, open]);

  // Notify parent of shape/size changes for preview mesh
  useEffect(() => {
    if (!open) return;
    const size: Record<string, number> = shape === 'cube'
      ? { width, height, depth }
      : { diameter };
    const hitbox = (useCustomHitbox || multiPart)
      ? {
          shape: hbShape,
          size: hbShape === 'cube' ? { width: hbWidth, height: hbHeight, depth: hbDepth } as Record<string, number> : { diameter: hbDiameter } as Record<string, number>,
          position: { x: hbPosX, y: hbPosY, z: hbPosZ },
        }
      : undefined;
    const partsPreview = multiPart && parts.length > 0
      ? parts.map(p => ({
          shape: p.shape,
          size: p.shape === 'cube'
            ? { width: p.width, height: p.height, depth: p.depth } as Record<string, number>
            : { diameter: p.diameter } as Record<string, number>,
          position: { x: p.posX, y: p.posY, z: p.posZ },
        }))
      : undefined;
    onPreviewChange({ shape, size, parts: partsPreview, hitbox });
  }, [shape, diameter, width, height, depth, open, useCustomHitbox, multiPart, parts, hbShape, hbDiameter, hbWidth, hbHeight, hbDepth, hbPosX, hbPosY, hbPosZ]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = useCallback(() => {
    const id = entityId.trim();
    if (!id) {
      alert('Entity ID is required');
      return;
    }

    const size = shape === 'cube'
      ? { width, height, depth }
      : { diameter };

    const hitbox: HitboxConfig | undefined = (useCustomHitbox || multiPart)
      ? {
          shape: hbShape,
          size: hbShape === 'cube' ? { width: hbWidth, height: hbHeight, depth: hbDepth } : { diameter: hbDiameter },
          position: { x: hbPosX, y: hbPosY, z: hbPosZ },
        }
      : undefined;

    const cfg: LightConfig = {
      entityId: id,
      label: label.trim() || id.split('.')[1] || id,
      type,
      shape,
      size,
      position,
      warmth: (type === 'toggle' || type === 'dimmeable' || type === 'remote') ? warmth : undefined,
      brightness,
      hitbox,
      doubleTapEntityId: doubleTapEntityId.trim() || undefined,
      hidden: hidden || undefined,
    };

    if (multiPart && parts.length > 0) {
      cfg.parts = parts.map(partToConfig);
    }

    // Preserve fields from the original config when editing
    if (editLight) {
      if (editLight.group) cfg.group = editLight.group;
      if (type === 'remote') {
        if (editLight.remoteButtons) cfg.remoteButtons = editLight.remoteButtons;
        if (editLight.modeEntityId) cfg.modeEntityId = editLight.modeEntityId;
      }
    }

    onSave(cfg);
  }, [entityId, label, type, shape, diameter, width, height, depth, position, warmth, brightness, doubleTapEntityId, hidden, onSave, useCustomHitbox, multiPart, parts, hbShape, hbDiameter, hbWidth, hbHeight, hbDepth, hbPosX, hbPosY, hbPosZ]);

  const handlePosChange = useCallback(
    (axis: 'x' | 'y' | 'z', value: number) => {
      onPositionChange({ ...position, [axis]: value });
    },
    [position, onPositionChange],
  );

  const updatePart = useCallback((idx: number, update: Partial<PartState>) => {
    setParts(prev => prev.map((p, i) => i === idx ? { ...p, ...update } : p));
  }, []);

  const addPart = useCallback(() => {
    setParts(prev => [...prev, defaultPart(position)]);
  }, [position]);

  const removePart = useCallback((idx: number) => {
    setParts(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const footer = (
    <>
      <button
        className="btn btn-primary"
        onClick={placingMode ? onExitPlacingMode : onEnterPlacingMode}
      >
        {placingMode ? '\u2715 Cancel Placement' : '\u{1F4CD} Click Model to Place'}
      </button>
      <button className="btn btn-success" onClick={handleSave}>
        &#10003; Save Light
      </button>
      <button className="btn btn-ghost" onClick={onClose}>
        Cancel
      </button>
    </>
  );

  return (
    <FormPanel
      open={open}
      title={editLight ? 'Edit Light' : 'Add Light'}
      onClose={onClose}
      footer={footer}
    >
      <AccordionSection title="Identity" defaultOpen>
        <div className="field-group">
          <label className="field-label">Entity ID</label>
          <EntityPicker
            value={entityId}
            onChange={setEntityId}
            onSelect={(e) => { if (!label.trim() && e.friendly_name) setLabel(e.friendly_name); }}
            placeholder="light.salon"
            entities={haEntities}
            className="field-input"
          />
        </div>
        <div className="field-group">
          <label className="field-label">Label (display name)</label>
          <input
            type="text"
            className="field-input"
            placeholder="Salon"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Light Type</label>
          <select
            className="field-select"
            value={type}
            onChange={(e) => setType(e.target.value as LightType)}
          >
            <option value="toggle">Toggle (on/off only)</option>
            <option value="dimmeable">Dimmeable</option>
            <option value="warmCold">Warm/Cold</option>
            <option value="rgb">RGB</option>
            <option value="rgbw">RGBW</option>
            <option value="remote">Remote (IR)</option>
          </select>
        </div>

        {(type === 'toggle' || type === 'dimmeable' || type === 'remote') && (
          <div className="field-group">
            <label className="field-label">Base Warmth ({warmth}K)</label>
            <input
              type="range"
              className="pos-slider"
              min={2000}
              max={6500}
              step={100}
              value={warmth}
              onChange={(e) => setWarmth(parseInt(e.target.value))}
            />
          </div>
        )}

        <div className="field-group">
          <label className="field-label">Brightness Multiplier ({'\u00D7'}{brightness})</label>
          <input
            type="number"
            className="field-input"
            min={0.1}
            max={1000}
            step={0.1}
            value={brightness}
            onChange={(e) => setBrightness(Math.max(0.1, parseFloat(e.target.value) || 1))}
          />
        </div>

        <div className="field-group">
          <label className="field-label">Double-tap Entity ID</label>
          <EntityPicker
            value={doubleTapEntityId}
            onChange={setDoubleTapEntityId}
            placeholder="fan.ceiling_fan (optional)"
            entities={haEntities}
            className="field-input"
          />
          <span className="field-label" style={{ opacity: 0.5, fontSize: 11, marginTop: 2 }}>
            Toggle a secondary entity on double-tap
          </span>
        </div>
      </AccordionSection>

      <AccordionSection title="Shape">
        <div className="field-group">
          <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={hidden}
              onChange={(e) => setHidden(e.target.checked)}
            />
            Invisible (no bulb mesh — still clickable, still lights the room)
          </label>
        </div>
        <div className="field-group">
          <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={multiPart}
              onChange={(e) => {
                const on = e.target.checked;
                setMultiPart(on);
                if (on && parts.length === 0) {
                  setParts([{
                    shape,
                    diameter,
                    width,
                    height,
                    depth,
                    posX: position.x,
                    posY: position.y,
                    posZ: position.z,
                  }]);
                  if (!useCustomHitbox) {
                    setUseCustomHitbox(true);
                    setHbPosX(position.x);
                    setHbPosY(position.y);
                    setHbPosZ(position.z);
                  }
                }
              }}
            />
            Multi-part
          </label>
        </div>

        {multiPart ? (
          <>
            {parts.map((part, idx) => (
              <div key={idx} style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 8, marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span className="field-label" style={{ fontWeight: 'bold' }}>Part {idx + 1}</span>
                  {parts.length > 1 && (
                    <button
                      className="btn btn-ghost"
                      style={{ padding: '2px 6px', fontSize: 11 }}
                      onClick={() => removePart(idx)}
                    >
                      &#10005;
                    </button>
                  )}
                </div>
                <div className="field-group">
                  <label className="field-label">Shape</label>
                  <select
                    className="field-select"
                    value={part.shape}
                    onChange={(e) => updatePart(idx, { shape: e.target.value as 'sphere' | 'cube' })}
                  >
                    <option value="sphere">Sphere</option>
                    <option value="cube">Cube</option>
                  </select>
                </div>

                {part.shape === 'sphere' ? (
                  <div className="field-group">
                    <label className="field-label">Diameter</label>
                    <input
                      type="number"
                      className="field-input"
                      value={part.diameter}
                      step={0.05}
                      min={0.05}
                      max={2}
                      onChange={(e) => updatePart(idx, { diameter: parseFloat(e.target.value) || 0.25 })}
                    />
                  </div>
                ) : (
                  <div className="row3">
                    <div className="field-group">
                      <label className="field-label">W</label>
                      <input type="number" className="field-input" value={part.width} step={0.05} min={0.05}
                        onChange={(e) => updatePart(idx, { width: parseFloat(e.target.value) || 0.3 })} />
                    </div>
                    <div className="field-group">
                      <label className="field-label">H</label>
                      <input type="number" className="field-input" value={part.height} step={0.05} min={0.05}
                        onChange={(e) => updatePart(idx, { height: parseFloat(e.target.value) || 0.3 })} />
                    </div>
                    <div className="field-group">
                      <label className="field-label">D</label>
                      <input type="number" className="field-input" value={part.depth} step={0.05} min={0.05}
                        onChange={(e) => updatePart(idx, { depth: parseFloat(e.target.value) || 0.3 })} />
                    </div>
                  </div>
                )}

                <div className="field-label" style={{ marginTop: 4, marginBottom: 2 }}>Position</div>
                {([
                  { label: 'X', color: '#f87171', key: 'posX' as const, range: [-30, 30] as [number, number] },
                  { label: 'Z', color: '#4ade80', key: 'posY' as const, range: [-2, 10] as [number, number] },
                  { label: 'Y', color: '#38bdf8', key: 'posZ' as const, range: [-30, 30] as [number, number] },
                ]).map(({ label: axLabel, color, key, range }) => (
                  <div key={`part-${idx}-${key}`} className="pos-grid">
                    <span className="pos-axis" style={{ color }}>{axLabel}</span>
                    <input
                      type="range"
                      className="pos-slider"
                      min={range[0]}
                      max={range[1]}
                      step={0.05}
                      value={part[key]}
                      onChange={(e) => updatePart(idx, { [key]: parseFloat(e.target.value) })}
                    />
                    <input
                      type="number"
                      className="pos-num"
                      step={0.05}
                      value={part[key]}
                      onChange={(e) => updatePart(idx, { [key]: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                ))}
              </div>
            ))}
            <button
              className="btn btn-ghost"
              style={{ width: '100%', marginBottom: 8 }}
              onClick={addPart}
            >
              + Add Part
            </button>
          </>
        ) : (
          <>
            <div className="field-group">
              <label className="field-label">Shape</label>
              <select
                className="field-select"
                value={shape}
                onChange={(e) => setShape(e.target.value as 'sphere' | 'cube')}
              >
                <option value="sphere">Sphere</option>
                <option value="cube">Cube</option>
              </select>
            </div>

            {shape === 'sphere' ? (
              <div className="field-group">
                <label className="field-label">Diameter</label>
                <input
                  type="number"
                  className="field-input"
                  value={diameter}
                  step={0.05}
                  min={0.05}
                  max={2}
                  onChange={(e) => setDiameter(parseFloat(e.target.value) || 0.25)}
                />
              </div>
            ) : (
              <div className="row3">
                <div className="field-group">
                  <label className="field-label">Width</label>
                  <input
                    type="number"
                    className="field-input"
                    value={width}
                    step={0.05}
                    min={0.05}
                    onChange={(e) => setWidth(parseFloat(e.target.value) || 0.3)}
                  />
                </div>
                <div className="field-group">
                  <label className="field-label">Height</label>
                  <input
                    type="number"
                    className="field-input"
                    value={height}
                    step={0.05}
                    min={0.05}
                    onChange={(e) => setHeight(parseFloat(e.target.value) || 0.3)}
                  />
                </div>
                <div className="field-group">
                  <label className="field-label">Depth</label>
                  <input
                    type="number"
                    className="field-input"
                    value={depth}
                    step={0.05}
                    min={0.05}
                    onChange={(e) => setDepth(parseFloat(e.target.value) || 0.3)}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </AccordionSection>

      <AccordionSection title="Hitbox">
        {!multiPart && (
          <div className="field-group">
            <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={useCustomHitbox}
                onChange={(e) => setUseCustomHitbox(e.target.checked)}
              />
              Custom hitbox
            </label>
          </div>
        )}
        {multiPart && (
          <div className="field-group">
            <span className="field-label" style={{ opacity: 0.6, fontSize: 11 }}>
              Hitbox is required for multi-part lights
            </span>
          </div>
        )}

        {(useCustomHitbox || multiPart) && (
          <>
            <div className="field-group">
              <label className="field-label">Hitbox Shape</label>
              <select
                className="field-select"
                value={hbShape}
                onChange={(e) => setHbShape(e.target.value as 'sphere' | 'cube')}
              >
                <option value="sphere">Sphere</option>
                <option value="cube">Cube</option>
              </select>
            </div>

            {hbShape === 'sphere' ? (
              <div className="field-group">
                <label className="field-label">Hitbox Diameter</label>
                <input
                  type="number"
                  className="field-input"
                  value={hbDiameter}
                  step={0.05}
                  min={0.05}
                  onChange={(e) => setHbDiameter(parseFloat(e.target.value) || 0.5)}
                />
              </div>
            ) : (
              <div className="row3">
                <div className="field-group">
                  <label className="field-label">Width</label>
                  <input
                    type="number"
                    className="field-input"
                    value={hbWidth}
                    step={0.05}
                    min={0.05}
                    onChange={(e) => setHbWidth(parseFloat(e.target.value) || 0.5)}
                  />
                </div>
                <div className="field-group">
                  <label className="field-label">Height</label>
                  <input
                    type="number"
                    className="field-input"
                    value={hbHeight}
                    step={0.05}
                    min={0.05}
                    onChange={(e) => setHbHeight(parseFloat(e.target.value) || 0.5)}
                  />
                </div>
                <div className="field-group">
                  <label className="field-label">Depth</label>
                  <input
                    type="number"
                    className="field-input"
                    value={hbDepth}
                    step={0.05}
                    min={0.05}
                    onChange={(e) => setHbDepth(parseFloat(e.target.value) || 0.5)}
                  />
                </div>
              </div>
            )}

            <span className="field-label" style={{ marginTop: 4 }}>Hitbox Position</span>
            {([
              { label: 'X', color: '#f87171', axis: 'x' as const, value: hbPosX, setter: setHbPosX, range: [-30, 30] as [number, number] },
              { label: 'Z', color: '#4ade80', axis: 'y' as const, value: hbPosY, setter: setHbPosY, range: [-2, 10] as [number, number] },
              { label: 'Y', color: '#38bdf8', axis: 'z' as const, value: hbPosZ, setter: setHbPosZ, range: [-30, 30] as [number, number] },
            ]).map(({ label: axLabel, color, axis, value, setter, range }) => (
              <div key={`hb-${axis}`} className="pos-grid">
                <span className="pos-axis" style={{ color }}>{axLabel}</span>
                <input
                  type="range"
                  className="pos-slider"
                  min={range[0]}
                  max={range[1]}
                  step={0.05}
                  value={value}
                  onChange={(e) => setter(parseFloat(e.target.value))}
                />
                <input
                  type="number"
                  className="pos-num"
                  step={0.05}
                  value={value}
                  onChange={(e) => setter(parseFloat(e.target.value) || 0)}
                />
              </div>
            ))}
          </>
        )}
      </AccordionSection>

      <AccordionSection title="Position" defaultOpen>
        <div className={`placement-hint${open ? ' visible' : ''}`}>
          Click anywhere on the model to place,<br />then fine-tune below.
        </div>

        {([
          { label: 'X', color: '#f87171', babylonAxis: 'x' as const, range: [-30, 30] as [number, number] },
          { label: 'Z', color: '#4ade80', babylonAxis: 'y' as const, range: [-2, 10] as [number, number] },
          { label: 'Y', color: '#38bdf8', babylonAxis: 'z' as const, range: [-30, 30] as [number, number] },
        ]).map(({ label, color, babylonAxis, range }) => (
          <div key={babylonAxis} className="pos-grid">
            <span className="pos-axis" style={{ color }}>
              {label}
            </span>
            <input
              type="range"
              className="pos-slider"
              min={range[0]}
              max={range[1]}
              step={0.05}
              value={position[babylonAxis]}
              onChange={(e) => handlePosChange(babylonAxis, parseFloat(e.target.value))}
            />
            <input
              type="number"
              className="pos-num"
              step={0.05}
              value={position[babylonAxis]}
              onChange={(e) => handlePosChange(babylonAxis, parseFloat(e.target.value) || 0)}
            />
          </div>
        ))}
      </AccordionSection>
    </FormPanel>
  );
});

export default LightForm;
