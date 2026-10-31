import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../ui.jsx';

const labels = {
  login: 'Вход',
  login_failed: 'Неудачный вход',
  register: 'Регистрация',
  user_create: 'Создан пользователь',
  user_update: 'Изменён пользователь',
  user_delete: 'Удалён пользователь',
  room_create: 'Создана конференция',
  stream_create: 'Создана трансляция',
  room_end: 'Комната завершена',
  room_delete: 'Комната удалена',
  settings_update: 'Настройки',
  kick: 'Исключение',
  stream_role: 'Роль в эфире',
  profile_update: 'Профиль',
};

export default function Audit() {
  const toast = useToast();
  const [events, setEvents] = useState([]);

  async function load(before) {
    const data = await api(`/api/admin/audit${before ? `?before=${before}` : ''}`);
    setEvents((current) => (before ? [...current, ...data.events] : data.events));
    return data.events;
  }

  useEffect(() => {
    load().catch((error) => toast.push(error.message, 'warn'));
  }, [toast]);

  return (
    <div className="stack wide">
      <header className="page-head">
        <div>
          <p className="eyebrow">Безопасность</p>
          <h1>Журнал</h1>
        </div>
      </header>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Время</th>
              <th>Кто</th>
              <th>Событие</th>
              <th>Детали</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id}>
                <td>{new Date(event.createdAt).toLocaleString('ru-RU')}</td>
                <td>{event.actorName || '—'}</td>
                <td>{labels[event.action] || event.action}</td>
                <td>{event.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {events.length === 0 && <p className="empty">Журнал пуст.</p>}
      </div>
      {events.length > 0 && (
        <button type="button" className="btn ghost" onClick={() => load(events[events.length - 1].id).catch((error) => toast.push(error.message, 'warn'))}>
          Ещё записи
        </button>
      )}
    </div>
  );
}
