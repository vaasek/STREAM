import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Field, useToast } from '../ui.jsx';

export default function Settings() {
  const toast = useToast();
  const [form, setForm] = useState(null);

  useEffect(() => {
    api('/api/admin/settings').then((data) => {
      setForm(data.settings);
    }).catch((error) => toast.push(error.message, 'warn'));
  }, [toast]);

  function set(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(event) {
    event.preventDefault();
    try {
      const data = await api('/api/admin/settings', { method: 'PUT', body: form });
      setForm(data.settings);
      toast.push('Настройки сохранены');
    } catch (error) {
      toast.push(error.message, 'warn');
    }
  }

  if (!form) return <p className="empty">Загрузка настроек…</p>;

  return (
    <form className="stack wide settings" onSubmit={save}>
      <header className="page-head">
        <div>
          <p className="eyebrow">Сервер</p>
          <h1>Настройки</h1>
        </div>
        <button className="btn primary" type="submit">Сохранить</button>
      </header>
      <Field label="Имя сервера">
        <input value={form.serverName} onChange={(event) => set('serverName', event.target.value)} maxLength={40} />
      </Field>
      <Field label="Текст на странице входа">
        <textarea value={form.welcomeText} onChange={(event) => set('welcomeText', event.target.value)} maxLength={280} rows={3} />
      </Field>
      <label className="check">
        <input type="checkbox" checked={form.allowRegistration} onChange={(event) => set('allowRegistration', event.target.checked)} />
        <span>Открытая регистрация</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={form.allowGuests} onChange={(event) => set('allowGuests', event.target.checked)} />
        <span>Гости могут входить в публичные комнаты по имени</span>
      </label>
      <Field label="STUN">
        <input value={form.stunUrl} onChange={(event) => set('stunUrl', event.target.value)} placeholder="stun:stun.l.google.com:19302" />
      </Field>
      <Field label="TURN URL">
        <input value={form.turnUrl} onChange={(event) => set('turnUrl', event.target.value)} placeholder="turn:turn.example.com:3478" />
      </Field>
      <div className="pair">
        <Field label="TURN логин">
          <input value={form.turnUsername} onChange={(event) => set('turnUsername', event.target.value)} />
        </Field>
        <Field label="TURN пароль">
          <input value={form.turnPassword} onChange={(event) => set('turnPassword', event.target.value)} />
        </Field>
      </div>
    </form>
  );
}
