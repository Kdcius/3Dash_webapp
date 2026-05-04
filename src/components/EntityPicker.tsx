import { useState, useRef, useEffect, useCallback, useMemo, useId } from 'react';
import { createPortal } from 'react-dom';
import './EntityPicker.css';

export interface HAEntityOption {
  entity_id: string;
  friendly_name?: string;
}

interface Props {
  value: string;
  onChange: (val: string) => void;
  /** Fired when the user picks an entity from the dropdown (not on free typing). */
  onSelect?: (entity: HAEntityOption) => void;
  placeholder?: string;
  entities: HAEntityOption[];
  className?: string;
}

const MAX_RESULTS = 50;

export default function EntityPicker({ value, onChange, onSelect, placeholder, entities, className }: Props) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const keyboardNavRef = useRef(false);
  const listboxId = useId();

  const filtered = useMemo(() => {
    if (entities.length === 0) return [];
    const q = value.toLowerCase();
    if (!q) return entities.slice(0, MAX_RESULTS);
    return entities
      .filter(e =>
        e.entity_id.toLowerCase().includes(q) ||
        (e.friendly_name?.toLowerCase().includes(q) ?? false),
      )
      .slice(0, MAX_RESULTS);
  }, [entities, value]);

  const select = useCallback((entity: HAEntityOption) => {
    onChange(entity.entity_id);
    onSelect?.(entity);
    setOpen(false);
  }, [onChange, onSelect]);

  const openDropdown = useCallback(() => {
    if (entities.length === 0) return;
    if (inputRef.current) setRect(inputRef.current.getBoundingClientRect());
    setHighlighted(0);
    setOpen(true);
  }, [entities.length]);

  // Close when clicking outside (input AND dropdown).
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (inputRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  // Keep dropdown glued to the input as the user scrolls or resizes.
  useEffect(() => {
    if (!open) return;
    const update = () => {
      if (inputRef.current) setRect(inputRef.current.getBoundingClientRect());
    };
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open]);

  useEffect(() => { setHighlighted(0); }, [value]);

  useEffect(() => {
    if (!keyboardNavRef.current) return;
    keyboardNavRef.current = false;
    itemRefs.current[highlighted]?.scrollIntoView({ block: 'nearest' });
  }, [highlighted]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (e.key === 'ArrowDown') openDropdown();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      keyboardNavRef.current = true;
      setHighlighted(h => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      keyboardNavRef.current = true;
      setHighlighted(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      if (filtered[highlighted]) {
        e.preventDefault();
        select(filtered[highlighted]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }, [open, filtered, highlighted, select, openDropdown]);

  const dropdownStyle: React.CSSProperties | undefined = rect ? {
    position: 'fixed',
    top: rect.bottom + 2,
    left: rect.left,
    width: rect.width,
    zIndex: 9999,
  } : undefined;

  return (
    <>
      <input
        ref={inputRef}
        value={value}
        onChange={e => { onChange(e.target.value); openDropdown(); }}
        onFocus={openDropdown}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={open && filtered[highlighted] ? `${listboxId}-${highlighted}` : undefined}
      />
      {open && filtered.length > 0 && dropdownStyle && createPortal(
        <div
          ref={dropdownRef}
          className="entity-picker-dropdown"
          style={dropdownStyle}
          id={listboxId}
          role="listbox"
        >
          {filtered.map((e, i) => (
            <div
              key={e.entity_id}
              id={`${listboxId}-${i}`}
              ref={el => { itemRefs.current[i] = el; }}
              className={`entity-picker-item${i === highlighted ? ' highlighted' : ''}`}
              role="option"
              aria-selected={i === highlighted}
              onMouseDown={ev => { ev.preventDefault(); select(e); }}
              onMouseEnter={() => setHighlighted(i)}
            >
              <span className="entity-picker-id">{e.entity_id}</span>
              {e.friendly_name && e.friendly_name !== e.entity_id && (
                <span className="entity-picker-name">{e.friendly_name}</span>
              )}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
