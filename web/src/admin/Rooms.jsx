import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, roomTypeLabel } from '../api.js';
import { useToast } from '../ui.jsx';

export default function Rooms({ fixedType }) {
  const toast = useToast();
  const [rooms, setRooms] = useState([]);
  const [filter, setFilter] = useState(fixedType || 'all');

  async function load() {
    const data = await api('/api/admin/rooms');
    setRooms(data.rooms);
  }

  useEffect(() => {
    load().catch((error) => toast.push(error.message, 'warn'));
  }, [toast]);

  const visible = rooms.filter((room) => filter === 'all' || room.type === filter);

  async function endRoom(room) {
    try {
      await api(`/api/rooms/${room.code}/end`, { method: 'POST' });
      toast.push('Комната завершена');
      await load();
    } catch (error) {
      toast.push(error.message, 'warn');
    }
  }

  async function remove(room) {
    if (!window.confirm(`Удалить «${room.title}»?`)) return;
    try {
      await api(`/api/admin/rooms/${room.id}`, { method: 'DELETE' });
      toast.push('Комната удалена');
      await load();
    } catch (error) {
      toast.push(error.message, 'warn');
    }
  }

  return (
    <div className="stack wide">
      <header className="page-head">
        <div>
          <p className="eyebrow">{fixedType === 'stream' ? 'Эфир' : 'История'}</p>
          <h1>{fixedType === 'stream' ? 'Трансляции' : 'Комнаты'}</h1>
        </div>
        {!fixedType && (
          <div className="switch">
            {[['all', 'Все'], ['conference', 'Конференции'], ['stream', 'Трансляции'], ['wall', 'Стены']].map(([id, label]) => (
              <button key={id} type="button" className={filter === id ? 'on' : ''} onClick={() => setFilter(id)}>{label}</button>
            ))}
          </div>
        )}
      </header>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Название</th>
              <th>Тип</th>
              <th>Ведущий</th>
              <th>Сейчас</th>
              <th>Пик</th>
              <th>Статус</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map((room) => (
              <tr key={room.id}>
                <td>{room.title}<div className="hint">{room.code}</div></td>
                <td>{roomTypeLabel(room.type)}</td>
                <td>{room.ownerName}</td>
                <td>{room.peers}</td>
                <td>{room.peakPeers}</td>
                <td>{room.status === 'live' ? 'Идёт' : 'Завершена'}</td>
                <td className="actions">
                  {room.status === 'live' && <Link className="btn tiny" to={`/r/${room.code}`}>Открыть</Link>}
                  {room.status === 'live' && <button type="button" className="btn tiny" onClick={() => endRoom(room)}>Завершить</button>}
                  <button type="button" className="btn tiny danger" onClick={() => remove(room)}>Удалить</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 && <p className="empty">Список пуст.</p>}
      </div>
    </div>
  );
}
