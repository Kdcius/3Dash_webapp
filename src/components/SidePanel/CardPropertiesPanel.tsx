import { useState, useEffect, useCallback } from 'react';
import type { SidePanelCard } from '../../types';
import EntityPicker, { type HAEntityOption } from '../EntityPicker';
import './CardPropertiesPanel.css';

interface Props {
  card: SidePanelCard | null;   // null = add mode
  onSave: (card: SidePanelCard) => void;
  onCancel: () => void;
  /** Called on every field change in edit mode so the grid updates live. */
  onPreview?: (card: SidePanelCard) => void;
  haEntities?: HAEntityOption[];
}

type CardType = 'script' | 'indicator' | 'graph';

const PERIODS = ['1h', '6h', '12h', '24h', '2d', '7d'];

function buildCard(
  id: string,
  type: CardType,
  title: string,
  showTitle: boolean,
  entityId: string,
  icon: string,
  unit: string,
  precision: string,
  climateEntityId: string,
  period: string,
  refreshInterval: string,
  x: number,
  y: number,
  w: string,
  h: string,
  longPressEntityId: string,
  doublePressEntityId: string,
): SidePanelCard {
  const layout = {
    x,
    y,
    w: Math.max(1, parseInt(w) || 2),
    h: Math.max(1, parseInt(h) || 1),
  };

  switch (type) {
    case 'script':
      return {
        id, type: 'script', title: title.trim(), showTitle, entityId: entityId.trim(), icon: icon || undefined, layout,
        longPressEntityId: longPressEntityId.trim() || undefined,
        doublePressEntityId: doublePressEntityId.trim() || undefined,
      };
    case 'indicator':
      return {
        id, type: 'indicator', title: title.trim(), showTitle, entityId: entityId.trim(),
        icon: icon || undefined,
        unit: unit || undefined,
        precision: precision !== '' ? Number(precision) : undefined,
        climateEntityId: climateEntityId || undefined,
        layout,
      };
    case 'graph':
      return {
        id, type: 'graph', title: title.trim(), showTitle, entityId: entityId.trim(),
        period: period || '24h',
        refreshInterval: refreshInterval !== '' ? Number(refreshInterval) : undefined,
        layout,
      };
  }
}

export default function CardPropertiesPanel({ card, onSave, onCancel, onPreview, haEntities = [] }: Props) {
  const isEdit = !!card;

  const [type, setType] = useState<CardType>(card?.type ?? 'indicator');
  const [title, setTitle] = useState(card?.title ?? '');
  const [showTitle, setShowTitle] = useState(card?.showTitle !== false);
  const [entityId, setEntityId] = useState(card && 'entityId' in card ? card.entityId : '');
  const [icon, setIcon] = useState(
    card && 'icon' in card && card.icon ? card.icon : '',
  );
  const [unit, setUnit] = useState(
    card?.type === 'indicator' ? (card.unit ?? '') : '',
  );
  const [precision, setPrecision] = useState(
    card?.type === 'indicator' ? String(card.precision ?? '') : '',
  );
  const [climateEntityId, setClimateEntityId] = useState(
    card?.type === 'indicator' ? (card.climateEntityId ?? '') : '',
  );
  const [period, setPeriod] = useState(
    card?.type === 'graph' ? card.period : '24h',
  );
  const [refreshInterval, setRefreshInterval] = useState(
    card?.type === 'graph' ? String(card.refreshInterval ?? '') : '',
  );
  const [longPressEntityId, setLongPressEntityId] = useState(
    card?.type === 'script' ? (card.longPressEntityId ?? '') : '',
  );
  const [doublePressEntityId, setDoublePressEntityId] = useState(
    card?.type === 'script' ? (card.doublePressEntityId ?? '') : '',
  );
  const [w, setW] = useState(String(card?.layout.w ?? 2));
  const [h, setH] = useState(String(card?.layout.h ?? 1));

  // Sync layout fields when card prop changes (e.g. resize via grid handle)
  useEffect(() => {
    if (card) {
      setW(String(card.layout.w));
      setH(String(card.layout.h));
    }
  }, [card?.layout.w, card?.layout.h]);

  // Reset type-specific fields when type changes (only in add mode)
  useEffect(() => {
    if (isEdit) return;
    setIcon('');
    setUnit('');
    setPrecision('');
    setClimateEntityId('');
    setPeriod('24h');
    setRefreshInterval('');
    setLongPressEntityId('');
    setDoublePressEntityId('');
  }, [type, isEdit]);

  // Push live preview to parent on every field change (edit mode only)
  const emitPreview = useCallback(() => {
    if (!isEdit || !onPreview || !card) return;
    onPreview(buildCard(card.id, type, title, showTitle, entityId, icon, unit, precision, climateEntityId, period, refreshInterval, card.layout.x, card.layout.y, w, h, longPressEntityId, doublePressEntityId));
  }, [isEdit, onPreview, card, type, title, showTitle, entityId, icon, unit, precision, climateEntityId, period, refreshInterval, w, h, longPressEntityId, doublePressEntityId]);

  useEffect(() => {
    emitPreview();
  }, [emitPreview]);

  const canSave = title.trim() !== '' && entityId.trim() !== '';

  const handleSave = () => {
    if (!canSave) return;
    const id = card?.id ?? `card_${Date.now()}`;
    const result = buildCard(id, type, title, showTitle, entityId, icon, unit, precision, climateEntityId, period, refreshInterval, card?.layout.x ?? 0, card?.layout.y ?? Infinity, w, h, longPressEntityId, doublePressEntityId);
    onSave(result);
  };

  return (
    <div className="card-props-overlay">
      <div className="card-props-backdrop" onClick={onCancel} />
      <div className="card-props-panel">
        <div className="card-props-header">
          <h3>{isEdit ? 'Edit Card' : 'Add Card'}</h3>
          <button className="card-props-close" onClick={onCancel}>&times;</button>
        </div>

        <div className="card-props-body">
          <div className="card-props-field">
            <label>Type</label>
            <select value={type} onChange={e => setType(e.target.value as CardType)} disabled={isEdit}>
              <option value="indicator">Indicator</option>
              <option value="script">Action</option>
              <option value="graph">Graph</option>
            </select>
          </div>

          <div className="card-props-field">
            <label>Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Card title" />
          </div>

          <label className="card-props-toggle">
            <input type="checkbox" checked={showTitle} onChange={e => setShowTitle(e.target.checked)} />
            <span>Show title on card</span>
          </label>

          <div className="card-props-field">
            <label>Entity ID</label>
            <EntityPicker
              value={entityId}
              onChange={setEntityId}
              onSelect={(e) => { if (!title.trim() && e.friendly_name) setTitle(e.friendly_name); }}
              placeholder="sensor.temperature"
              entities={haEntities}
            />
          </div>

          {/* Type-specific fields */}
          {(type === 'script' || type === 'indicator') && (
            <div className="card-props-field">
              <label>Icon (Lucide name)</label>
              <input value={icon} onChange={e => setIcon(e.target.value)} placeholder="Thermometer" />
            </div>
          )}

          {type === 'script' && (
            <>
              <div className="card-props-section">Long Press Action</div>
              <div className="card-props-field">
                <label>Entity ID</label>
                <EntityPicker value={longPressEntityId} onChange={setLongPressEntityId} placeholder="script.my_action" entities={haEntities} />
              </div>

              <div className="card-props-section">Double Press Action</div>
              <div className="card-props-field">
                <label>Entity ID</label>
                <EntityPicker value={doublePressEntityId} onChange={setDoublePressEntityId} placeholder="script.my_action" entities={haEntities} />
              </div>
            </>
          )}

          {type === 'indicator' && (
            <>
              <div className="card-props-row">
                <div className="card-props-field">
                  <label>Unit</label>
                  <input value={unit} onChange={e => setUnit(e.target.value)} placeholder="°C" />
                </div>
                <div className="card-props-field">
                  <label>Precision</label>
                  <input type="number" min="0" max="5" value={precision} onChange={e => setPrecision(e.target.value)} placeholder="1" />
                </div>
              </div>
              <div className="card-props-field">
                <label>Climate Entity (optional)</label>
                <EntityPicker value={climateEntityId} onChange={setClimateEntityId} placeholder="climate.thermostat" entities={haEntities} />
              </div>
            </>
          )}

          {type === 'graph' && (
            <div className="card-props-row">
              <div className="card-props-field">
                <label>Period</label>
                <select value={period} onChange={e => setPeriod(e.target.value)}>
                  {PERIODS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div className="card-props-field">
                <label>Refresh (s)</label>
                <input type="number" min="30" value={refreshInterval} onChange={e => setRefreshInterval(e.target.value)} placeholder="300" />
              </div>
            </div>
          )}

          <div className="card-props-section">Layout</div>
          <div className="card-props-row">
            <div className="card-props-field">
              <label>Width (cols)</label>
              <input type="number" min="1" max="4" value={w} onChange={e => setW(e.target.value)} />
            </div>
            <div className="card-props-field">
              <label>Height (rows)</label>
              <input type="number" min="1" max="6" value={h} onChange={e => setH(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="card-props-footer">
          <button className="card-props-btn card-props-btn-cancel" onClick={onCancel}>Cancel</button>
          <button className="card-props-btn card-props-btn-save" onClick={handleSave} disabled={!canSave}>
            {isEdit ? 'Save' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  );
}
