import { useState } from 'react';
import { Layers } from 'lucide-react';
import LucideIcon from './SidePanel/cards/LucideIcon';
import type { ZoneConfig } from '../types';
import './ZoneSwitcher.css';

interface Props {
  zones: ZoneConfig[];
  activeZoneId: string | null;
  /** null = show everything (no zone filter). */
  onSelect: (zoneId: string | null) => void;
}

/**
 * Floating action button for switching between floors / areas
 * (e.g. Outside, Ground Floor, First Floor, Garage, Garden).
 * Collapsed: a single layers button. Expanded: one pill per zone.
 */
export default function ZoneSwitcher({ zones, activeZoneId, onSelect }: Props) {
  const [open, setOpen] = useState(false);

  if (zones.length === 0) return null;

  const active = zones.find((z) => z.id === activeZoneId) ?? null;

  const select = (id: string | null) => {
    onSelect(id);
    setOpen(false);
  };

  return (
    <div className={`zone-switcher${open ? ' open' : ''}`}>
      {open && (
        <div className="zone-switcher-menu" role="menu">
          <button
            role="menuitem"
            className={`zone-pill${!active ? ' active' : ''}`}
            onClick={() => select(null)}
          >
            <Layers size={15} />
            <span>All</span>
          </button>
          {zones.map((z) => (
            <button
              key={z.id}
              role="menuitem"
              className={`zone-pill${active?.id === z.id ? ' active' : ''}`}
              onClick={() => select(z.id)}
            >
              {z.icon ? <LucideIcon name={z.icon} size={15} /> : <Layers size={15} />}
              <span>{z.name}</span>
            </button>
          ))}
        </div>
      )}
      <button
        className="zone-fab"
        aria-label="Switch zone"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {active?.icon ? <LucideIcon name={active.icon} size={20} /> : <Layers size={20} />}
        {active && <span className="zone-fab-label">{active.name}</span>}
      </button>
    </div>
  );
}
