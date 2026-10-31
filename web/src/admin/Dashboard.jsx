import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, roomTypeLabel } from '../api.js';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let stop = false;
    async function load() {
      try {
        const data = await api('/api/admin/stats');
        if (!stop) setStats(data);
      } catch (err) {
        if (!stop) setError(err.message);
      }
    }
    load();
    const timer = setInterval(load, 4000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, []);

  if (error) return <p className="form-error">{error}</p>;
  if (!stats) return <p className="empty">Собираем сводку…</p>;
  const max = Math.max(1, ...stats.week.map((item) => item.count));

  return (
    <div className="stack wide">
      <header className="page-head">
        <div>
          <p className="eyebrow">Streamon {stats.version}</p>
          <h1>Состояние сервера</h1>
        </div>
      </header>
      {!stats.media && (
        <p className="banner warn">Медиасервер не запущен{stats.mediaError ? `: ${stats.mediaError}` : ''}. Проверьте сборку mediasoup и диапазон портов.</p>
      )}
      <div className="stats">
        <article><b>{stats.onlineUsers}</b><span>в сети</span></article>
        <article><b>{stats.peers}</b><span>в комнатах</span></article>
        <article><b>{stats.liveConferences}</b><span>конференции</span></article>
        <article><b>{stats.liveStreams}</b><span>трансляции</span></article>
        <article><b>{stats.liveWalls || 0}</b><span>стены экранов</span></article>
        <article><b>{stats.users}</b><span>пользователей</span></article>
      </div>
      <section className="panel">
        <header className="panel-head"><h2>Комнаты за 7 дней</h2></header>
        <div className="bars">
          {stats.week.map((item) => (
            <div key={item.day} className="bar">
              <div style={{ height: `${Math.max(6, (item.count / max) * 100)}%` }} title={String(item.count)} />
              <span>{new Date(`${item.day}T12:00:00`).toLocaleDateString('ru-RU', { weekday: 'short' })}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="panel">
        <header className="panel-head"><h2>Сейчас идут</h2></header>
        {stats.liveRooms.length === 0 && <p className="empty">Активных комнат нет.</p>}
        <ul className="streams">
          {stats.liveRooms.map((room) => (
            <li key={room.id}>
              <div>
                <strong>{room.title}</strong>
                <small>{roomTypeLabel(room.type)} · {room.peers} в комнате · {room.code}</small>
              </div>
              <Link className="btn ghost" to={`/r/${room.code}`}>Открыть</Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
