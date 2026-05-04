import { useState, useEffect, useCallback } from 'react';
import type { DisplayAnimation, DisplayCondition, DisplayConfig, DisplaySource, LightPosition, TextAlign } from '../types';
import { generateUUID } from '../utils/uuid';
import LucideIcon from './SidePanel/cards/LucideIcon';
import { FormPanel, AccordionSection } from './FormPanel';
import EntityPicker, { type HAEntityOption } from './EntityPicker';

const ANIMATION_OPTIONS: DisplayAnimation[] = ['spin', 'pulse', 'glow', 'bounce', 'flash'];

function AnimationPicker({
  value,
  onChange,
}: {
  value?: DisplayAnimation;
  onChange: (v: DisplayAnimation | undefined) => void;
}) {
  const enabled = !!value;
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text)', cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked ? 'pulse' : undefined)}
        />
        Animate
      </label>
      {enabled && (
        <select
          className="field-select"
          style={{ fontSize: 11, padding: '2px 4px', width: 'auto' }}
          value={value}
          onChange={(e) => onChange(e.target.value as DisplayAnimation)}
        >
          {ANIMATION_OPTIONS.map((a) => (
            <option key={a} value={a}>{a.charAt(0).toUpperCase() + a.slice(1)}</option>
          ))}
        </select>
      )}
    </div>
  );
}

export interface DisplayPreviewInfo {
  sources: DisplaySource[];
  textAlign: TextAlign;
  opacity: number;
  mirrorH: boolean;
  mirrorV: boolean;
  backgroundColor: string;
}

interface Props {
  open: boolean;
  editDisplay: DisplayConfig | null;
  position: LightPosition;
  normal: LightPosition;
  onPositionChange: (pos: LightPosition) => void;
  onSave: (config: DisplayConfig) => void;
  onClose: () => void;
  onEnterPlacingMode: () => void;
  onExitPlacingMode: () => void;
  onPreviewChange: (info: DisplayPreviewInfo) => void;
  placingMode: boolean;
  haEntities?: HAEntityOption[];
}

const DEFAULT_SOURCE: DisplaySource = {
  entityId: '',
  unit: '',
  precision: 1,
  color: '#38bdf8',
  fontSize: 64,
  fontWeight: 'bold',
};

export default function DisplayForm({
  open,
  editDisplay,
  position,
  normal,
  onPositionChange,
  onSave,
  onClose,
  onEnterPlacingMode,
  onExitPlacingMode,
  onPreviewChange,
  placingMode,
  haEntities = [],
}: Props) {
  const [label, setLabel] = useState('');
  const [sources, setSources] = useState<DisplaySource[]>([{ ...DEFAULT_SOURCE }]);
  const [textAlign, setTextAlign] = useState<TextAlign>('center');
  const [opacity, setOpacity] = useState(0.95);
  const [mirrorH, setMirrorH] = useState(false);
  const [mirrorV, setMirrorV] = useState(false);
  const [backgroundColor, setBackgroundColor] = useState('transparent');
  const [bgEnabled, setBgEnabled] = useState(false);
  const [clickable, setClickable] = useState(false);
  const [animation, setAnimation] = useState<DisplayAnimation | undefined>();

  useEffect(() => {
    if (editDisplay) {
      setLabel(editDisplay.label || '');
      const srcs = editDisplay.sources.length > 0
        ? editDisplay.sources.map((s) => ({
            ...s,
            color: s.color ?? editDisplay.color ?? '#38bdf8',
            fontSize: s.fontSize ?? editDisplay.fontSize ?? 64,
            fontWeight: s.fontWeight ?? editDisplay.fontWeight ?? 'bold' as const,
          }))
        : [{ ...DEFAULT_SOURCE }];
      setSources(srcs);
      setTextAlign(editDisplay.textAlign ?? 'center');
      setOpacity(editDisplay.opacity ?? 0.95);
      setMirrorH(editDisplay.mirrorH ?? false);
      setMirrorV(editDisplay.mirrorV ?? false);
      const bg = editDisplay.backgroundColor ?? 'transparent';
      setBackgroundColor(bg === 'transparent' ? '#1a1a2e' : bg);
      setBgEnabled(bg !== 'transparent');
      setClickable(editDisplay.clickable ?? false);
      setAnimation(editDisplay.animation);
    } else {
      setLabel('');
      setSources([{ ...DEFAULT_SOURCE }]);
      setTextAlign('center');
      setOpacity(0.95);
      setMirrorH(false);
      setMirrorV(false);
      setBackgroundColor('#1a1a2e');
      setBgEnabled(false);
      setClickable(false);
      setAnimation(undefined);
    }
  }, [editDisplay]);

  // Fire preview on every change
  useEffect(() => {
    if (!open) return;
    onPreviewChange({ sources, textAlign, opacity, mirrorH, mirrorV, backgroundColor: bgEnabled ? backgroundColor : 'transparent' });
  }, [sources, textAlign, opacity, mirrorH, mirrorV, bgEnabled, backgroundColor, open]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateSource = useCallback((idx: number, patch: Partial<DisplaySource>) => {
    setSources((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }, []);

  const removeSource = useCallback((idx: number) => {
    setSources((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const addSource = useCallback(() => {
    setSources((prev) => [...prev, { ...DEFAULT_SOURCE }]);
  }, []);

  const handleSave = useCallback(() => {
    const validSources = sources
      .filter((s) => s.entityId.trim())
      .map((s) => {
        const validConds = s.conditions?.filter((c) => c.state.trim());
        return { ...s, conditions: validConds?.length ? validConds : undefined };
      });
    if (validSources.length === 0) {
      alert('At least one data source is required');
      return;
    }

    onSave({
      id: editDisplay?.id || generateUUID(),
      label: label.trim() || validSources[0].entityId.split('.').pop() || 'Display',
      sources: validSources,
      position,
      normal,
      width: 0,
      height: 0,
      textAlign: textAlign !== 'center' ? textAlign : undefined,
      opacity,
      backgroundColor: bgEnabled ? backgroundColor : undefined,
      mirrorH: mirrorH || undefined,
      mirrorV: mirrorV || undefined,
      clickable: clickable || undefined,
      animation,
    });
  }, [label, sources, position, normal, textAlign, opacity, mirrorH, mirrorV, bgEnabled, backgroundColor, clickable, animation, editDisplay, onSave]);

  const handlePosChange = useCallback(
    (axis: 'x' | 'y' | 'z', value: number) => {
      onPositionChange({ ...position, [axis]: value });
    },
    [position, onPositionChange],
  );

  const footer = (
    <>
      <button
        className="btn btn-primary"
        onClick={placingMode ? onExitPlacingMode : onEnterPlacingMode}
      >
        {placingMode ? '\u2715 Cancel Placement' : '\u{1F4CD} Click Wall to Place'}
      </button>
      <button className="btn btn-success" onClick={handleSave}>
        &#10003; Save Display
      </button>
      <button className="btn btn-ghost" onClick={onClose}>
        Cancel
      </button>
    </>
  );

  return (
    <FormPanel
      open={open}
      title={editDisplay ? 'Edit Display' : 'Add Display'}
      onClose={onClose}
      footer={footer}
    >
      <AccordionSection title="Identity" defaultOpen>
        <div className="field-group">
          <label className="field-label">Label</label>
          <input
            type="text"
            className="field-input"
            placeholder="Living Room Temp"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
      </AccordionSection>

      <AccordionSection title="Data Sources" defaultOpen>
        {sources.map((src, i) => (
          <div key={i} style={{ marginBottom: 12, padding: '8px 0', borderBottom: i < sources.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <div className="field-group">
              <label className="field-label">Entity ID</label>
              <div style={{ display: 'flex', gap: 4 }}>
                <div style={{ flex: 1 }}>
                  <EntityPicker
                    value={src.entityId}
                    onChange={(v) => updateSource(i, { entityId: v })}
                    onSelect={(e) => { if (i === 0 && !label.trim() && e.friendly_name) setLabel(e.friendly_name); }}
                    placeholder="sensor.temperature"
                    entities={haEntities}
                    className="field-input"
                  />
                </div>
                {sources.length > 1 && (
                  <button
                    className="light-item-del"
                    style={{ flexShrink: 0, width: 28, height: 28 }}
                    onClick={() => removeSource(i)}
                  >&times;</button>
                )}
              </div>
            </div>
            <div className="row3">
              <div className="field-group">
                <label className="field-label">Label</label>
                <input
                  type="text"
                  className="field-input"
                  placeholder="Temp"
                  value={src.label || ''}
                  onChange={(e) => updateSource(i, { label: e.target.value || undefined })}
                />
              </div>
              <div className="field-group">
                <label className="field-label">Unit</label>
                <input
                  type="text"
                  className="field-input"
                  placeholder="°C"
                  value={src.unit || ''}
                  onChange={(e) => updateSource(i, { unit: e.target.value || undefined })}
                />
              </div>
              <div className="field-group">
                <label className="field-label">Decimals</label>
                <input
                  type="number"
                  className="field-input"
                  min={0}
                  max={4}
                  value={src.precision ?? 1}
                  onChange={(e) => updateSource(i, { precision: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>

            {/* Per-source style */}
            <div className="row3" style={{ marginTop: 8 }}>
              <div className="field-group">
                <label className="field-label">Color</label>
                <input
                  type="color"
                  className="field-input"
                  value={src.color ?? '#38bdf8'}
                  onChange={(e) => updateSource(i, { color: e.target.value })}
                  style={{ height: 28, padding: 2 }}
                />
              </div>
              <div className="field-group">
                <label className="field-label">Size</label>
                <input
                  type="number"
                  className="field-input"
                  min={16}
                  max={200}
                  value={src.fontSize ?? 64}
                  onChange={(e) => updateSource(i, { fontSize: parseInt(e.target.value) || 64 })}
                />
              </div>
              <div className="field-group">
                <label className="field-label">Weight</label>
                <select
                  className="field-select"
                  value={src.fontWeight ?? 'bold'}
                  onChange={(e) => updateSource(i, { fontWeight: e.target.value as 'normal' | 'bold' })}
                >
                  <option value="normal">Normal</option>
                  <option value="bold">Bold</option>
                </select>
              </div>
            </div>

            {/* Conditional styling rules */}
            <div style={{ marginTop: 8 }}>
              <label className="field-label" style={{ marginBottom: 4, display: 'block' }}>
                Conditions
                <span style={{ opacity: 0.5, fontWeight: 'normal' }}> — change color by state</span>
              </label>
              {(src.conditions ?? []).map((cond, ci) => (
                <div key={ci} style={{ marginBottom: 6, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 4 }}>
                    <input
                      type="text"
                      className="field-input"
                      style={{ width: 90 }}
                      placeholder="attribute"
                      title="Attribute (empty = entity state)"
                      value={cond.attribute ?? ''}
                      onChange={(e) => {
                        const updated = [...(src.conditions ?? [])];
                        updated[ci] = { ...updated[ci], attribute: e.target.value || undefined };
                        updateSource(i, { conditions: updated });
                      }}
                    />
                    <span style={{ opacity: 0.4, fontSize: 11 }}>=</span>
                    <input
                      type="text"
                      className="field-input"
                      style={{ width: 70 }}
                      placeholder="value"
                      value={cond.state}
                      onChange={(e) => {
                        const updated = [...(src.conditions ?? [])];
                        updated[ci] = { ...updated[ci], state: e.target.value };
                        updateSource(i, { conditions: updated });
                      }}
                    />
                    <button
                      className="light-item-del"
                      style={{ flexShrink: 0, width: 22, height: 22, fontSize: 12, marginLeft: 'auto' }}
                      onClick={() => {
                        const updated = (src.conditions ?? []).filter((_, j) => j !== ci);
                        updateSource(i, { conditions: updated.length ? updated : undefined });
                      }}
                    >&times;</button>
                  </div>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <input
                      type="color"
                      className="field-input"
                      style={{ width: 32, height: 28, padding: 2 }}
                      title="Text color"
                      value={cond.color ?? src.color ?? '#38bdf8'}
                      onChange={(e) => {
                        const updated = [...(src.conditions ?? [])];
                        updated[ci] = { ...updated[ci], color: e.target.value };
                        updateSource(i, { conditions: updated });
                      }}
                    />
                    <div style={{ flex: 1, display: 'flex', gap: 4, alignItems: 'center' }}>
                      <input
                        type="text"
                        className="field-input"
                        style={{ flex: 1 }}
                        placeholder="icon (e.g. Flame)"
                        value={cond.icon ?? ''}
                        onChange={(e) => {
                          const updated = [...(src.conditions ?? [])];
                          updated[ci] = { ...updated[ci], icon: e.target.value || undefined };
                          updateSource(i, { conditions: updated });
                        }}
                      />
                      {cond.icon && (
                        <LucideIcon
                          name={cond.icon}
                          size={16}
                          color={cond.color ?? src.color ?? '#38bdf8'}
                          style={{ flexShrink: 0 }}
                        />
                      )}
                    </div>
                    <span style={{ opacity: 0.3, fontSize: 9 }}>or</span>
                    <input
                      type="text"
                      className="field-input"
                      style={{ flex: 1 }}
                      placeholder="label"
                      value={cond.label ?? ''}
                      onChange={(e) => {
                        const updated = [...(src.conditions ?? [])];
                        updated[ci] = { ...updated[ci], label: e.target.value || undefined };
                        updateSource(i, { conditions: updated });
                      }}
                    />
                    <input
                      type="color"
                      className="field-input"
                      style={{ width: 32, height: 28, padding: 2 }}
                      title="Background color (optional)"
                      value={cond.backgroundColor ?? '#1a1a2e'}
                      onChange={(e) => {
                        const updated = [...(src.conditions ?? [])];
                        updated[ci] = { ...updated[ci], backgroundColor: e.target.value };
                        updateSource(i, { conditions: updated });
                      }}
                    />
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <AnimationPicker
                      value={cond.animation}
                      onChange={(v) => {
                        const updated = [...(src.conditions ?? [])];
                        updated[ci] = { ...updated[ci], animation: v };
                        updateSource(i, { conditions: updated });
                      }}
                    />
                  </div>
                </div>
              ))}
              <button
                className="btn btn-ghost"
                style={{ width: '100%', fontSize: 11, padding: '4px 0' }}
                onClick={() => {
                  const updated: DisplayCondition[] = [...(src.conditions ?? []), { state: '', color: '#38bdf8' }];
                  updateSource(i, { conditions: updated });
                }}
              >
                + Add Condition
              </button>
            </div>
          </div>
        ))}
        <button className="btn btn-ghost" style={{ width: '100%', marginBottom: 8 }} onClick={addSource}>
          + Add Source
        </button>
      </AccordionSection>

      <AccordionSection title="Display Settings">
        <div className="field-group">
          <label className="field-label">Text Align</label>
          <div style={{ display: 'flex', gap: 4 }}>
            {(['left', 'center', 'right'] as TextAlign[]).map((a) => (
              <button
                key={a}
                className="btn btn-ghost"
                style={{
                  flex: 1,
                  padding: '6px 0',
                  fontSize: 10,
                  borderColor: textAlign === a ? 'var(--accent)' : undefined,
                  color: textAlign === a ? 'var(--accent)' : undefined,
                }}
                onClick={() => setTextAlign(a)}
              >
                {a.charAt(0).toUpperCase() + a.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="field-group">
          <label className="field-label">Opacity ({Math.round(opacity * 100)}%)</label>
          <input
            type="range"
            className="pos-slider"
            min={0.1}
            max={1}
            step={0.05}
            value={opacity}
            onChange={(e) => setOpacity(parseFloat(e.target.value))}
          />
        </div>
        <div className="field-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text)', cursor: 'pointer' }}>
            <input type="checkbox" checked={bgEnabled} onChange={(e) => setBgEnabled(e.target.checked)} />
            Background Panel
          </label>
          {bgEnabled && (
            <input
              type="color"
              className="field-input"
              value={backgroundColor}
              onChange={(e) => setBackgroundColor(e.target.value)}
              style={{ height: 28, padding: 2, marginTop: 4 }}
            />
          )}
        </div>
        <div className="field-group">
          <label className="field-label">Mirror</label>
          <div style={{ display: 'flex', gap: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text)', cursor: 'pointer' }}>
              <input type="checkbox" checked={mirrorH} onChange={(e) => setMirrorH(e.target.checked)} />
              Horizontal
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text)', cursor: 'pointer' }}>
              <input type="checkbox" checked={mirrorV} onChange={(e) => setMirrorV(e.target.checked)} />
              Vertical
            </label>
          </div>
        </div>
        <div className="field-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text)', cursor: 'pointer' }}>
            <input type="checkbox" checked={clickable} onChange={(e) => setClickable(e.target.checked)} />
            Clickable (open detail modal on tap)
          </label>
        </div>
        <div className="field-group">
          <label className="field-label">Animation</label>
          <AnimationPicker value={animation} onChange={setAnimation} />
        </div>
      </AccordionSection>

      <AccordionSection title="Position" defaultOpen>
        <div className={`placement-hint${open ? ' visible' : ''}`}>
          Click a wall surface to place,<br />then fine-tune below.
        </div>

        {([
          { label: 'X', color: '#f87171', babylonAxis: 'x' as const, range: [-30, 30] as [number, number] },
          { label: 'Z', color: '#4ade80', babylonAxis: 'y' as const, range: [-2, 10] as [number, number] },
          { label: 'Y', color: '#38bdf8', babylonAxis: 'z' as const, range: [-30, 30] as [number, number] },
        ]).map(({ label: axLabel, color: axColor, babylonAxis, range }) => (
          <div key={babylonAxis} className="pos-grid">
            <span className="pos-axis" style={{ color: axColor }}>{axLabel}</span>
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

        <div style={{ marginTop: 8 }}>
          <span className="field-label">Surface Normal</span>
          <div style={{ fontSize: 11, opacity: 0.6, fontFamily: 'var(--font-mono, monospace)', marginTop: 4 }}>
            nx: {normal.x.toFixed(3)} &nbsp; ny: {normal.y.toFixed(3)} &nbsp; nz: {normal.z.toFixed(3)}
          </div>
        </div>
      </AccordionSection>
    </FormPanel>
  );
}
