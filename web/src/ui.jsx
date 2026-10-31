import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { groupByDepartment } from './api.js';

const ToastContext = createContext(null);

function nextId() {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((text, tone = 'info') => {
    const id = nextId();
    setToasts((list) => [...list.slice(-4), { id, text, tone }]);
    setTimeout(() => setToasts((list) => list.filter((item) => item.id !== id)), 4600);
  }, []);
  const value = useMemo(() => ({ push }), [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.tone}`}>{toast.text}</div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">×</button>
        </header>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function Boot({ text = 'Запуск' }) {
  return (
    <div className="boot">
      <div className="mark" aria-hidden="true" />
      <p>{text}</p>
    </div>
  );
}

export function Icon({ name }) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: '1.75',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };
  if (name === 'mic') {
    return (
      <svg {...common}>
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M6 11a6 6 0 0 0 12 0M12 17v3M8 21h8" />
      </svg>
    );
  }
  if (name === 'mic-off') {
    return (
      <svg {...common}>
        <path d="M15 10.5V6a3 3 0 0 0-5.7-1.3M9 9v3a3 3 0 0 0 4.4 2.6M6 11a6 6 0 0 0 9.5 4.8M12 17v3M8 21h8M4 4l16 16" />
      </svg>
    );
  }
  if (name === 'cam') {
    return (
      <svg {...common}>
        <rect x="2.5" y="6.5" width="13" height="11" rx="2" />
        <path d="M15.5 10.5 21 7.5v9l-5.5-3" />
      </svg>
    );
  }
  if (name === 'cam-off') {
    return (
      <svg {...common}>
        <path d="M3 7.5h8.5M15.5 10.5 21 7.5v9l-4-2.2M6.5 17.5H4a1.5 1.5 0 0 1-1.5-1.5V9M4 4l16 16" />
      </svg>
    );
  }
  if (name === 'screen') {
    return (
      <svg {...common}>
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path d="M8 20h8M12 16v4" />
      </svg>
    );
  }
  if (name === 'hand') {
    return (
      <svg {...common}>
        <path d="M8 11V6.5a1.5 1.5 0 0 1 3 0V11M11 10.5V5a1.5 1.5 0 0 1 3 0v6M14 11V7.5a1.5 1.5 0 0 1 3 0V13c0 3.5-2 7-6.5 7S4 16.5 4 13v-2.5a1.5 1.5 0 0 1 3 0" />
      </svg>
    );
  }
  if (name === 'chat') {
    return (
      <svg {...common}>
        <path d="M5 16.5 3.5 20.5 8 19a8.5 8.5 0 1 0-3-2.5Z" />
      </svg>
    );
  }
  if (name === 'users') {
    return (
      <svg {...common}>
        <path d="M16 20v-1.2A3.8 3.8 0 0 0 12.2 15H7.8A3.8 3.8 0 0 0 4 18.8V20" />
        <circle cx="10" cy="8" r="3" />
        <path d="M20 20v-1.1A3.4 3.4 0 0 0 17.2 15.6M16.2 5.2a2.6 2.6 0 0 1 0 4.9" />
      </svg>
    );
  }
  if (name === 'phone') {
    return (
      <svg {...common}>
        <path d="M8 3.5h3l1.2 3-2 1.2a12 12 0 0 0 5.1 5.1l1.2-2 3 1.2v3A2 2 0 0 1 17.4 17 16.5 16.5 0 0 1 7 6.6 2 2 0 0 1 8 3.5Z" />
      </svg>
    );
  }
  if (name === 'copy') {
    return (
      <svg {...common}>
        <rect x="8" y="8" width="12" height="12" rx="2" />
        <path d="M6 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}

export function DepartmentSelect({ value, onChange, people, label = 'Стримеры' }) {
  const selected = Array.isArray(value) ? value : (value ? [value] : []);
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState(null);
  const box = useRef(null);
  const unique = [];
  const seen = new Set();
  for (const person of people) {
    const key = person.userId || person.id;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push({ ...person, key });
  }
  const groups = groupByDepartment(unique);
  const picked = unique.filter((person) => selected.includes(person.key));
  const caption = picked.length === 0
    ? 'Все стримеры'
    : picked.length <= 2
      ? picked.map((person) => person.name).join(', ')
      : `${picked[0].name}, ${picked[1].name} +${picked.length - 2}`;

  useEffect(() => {
    if (!open) return undefined;
    function close(event) {
      if (!box.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  function toggle(id) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  }

  function toggleGroup(list) {
    const ids = list.map((person) => person.key);
    const allOn = ids.every((id) => selected.includes(id));
    const next = new Set(selected);
    for (const id of ids) {
      if (allOn) next.delete(id);
      else next.add(id);
    }
    onChange([...next]);
  }

  function showMenu() {
    const rect = box.current?.getBoundingClientRect();
    if (rect) setPlace({ top: rect.bottom + 8, left: rect.left, width: 300 });
    setOpen((current) => !current);
  }

  return (
    <div className="multi" ref={box}>
      <button type="button" className="multi-btn" aria-expanded={open} aria-label={label} onClick={showMenu}>
        {caption}
      </button>
      {open && place && (
        <div className="multi-menu" role="group" aria-label={label} style={{ top: place.top, left: place.left, width: place.width }}>
          <button type="button" className={selected.length === 0 ? 'on' : ''} onClick={() => onChange([])}>Все стримеры</button>
          {groups.map(([name, list]) => {
            const ids = list.map((person) => person.key);
            const allOn = ids.every((id) => selected.includes(id));
            return (
              <div key={name} className="multi-group">
                <label>
                  <input type="checkbox" checked={allOn && ids.length > 0} onChange={() => toggleGroup(list)} />
                  <span>{name}</span>
                </label>
                {list.map((person) => (
                  <label key={person.key} className="person">
                    <input type="checkbox" checked={selected.includes(person.key)} onChange={() => toggle(person.key)} />
                    <span>{person.name}</span>
                  </label>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
