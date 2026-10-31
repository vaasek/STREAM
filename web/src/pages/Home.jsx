import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, groupByDepartment, matchesDepartmentPick, plural } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useRealtime } from '../realtime.jsx';
import { DepartmentSelect, Field, Icon, Modal, useToast } from '../ui.jsx';
import ProfileDialog from './Profile.jsx';

function socketRequest(socket, event, data) {
  return new Promise((resolve, reject) => {
    socket.emit(event, data, (response) => {
      if (!response || response.error) reject(new Error(response?.error || 'Нет ответа'));
      else resolve(response);
    });
  });
}

export default function Home() {
  const { user, logout } = useAuth();
  const { socket, online } = useRealtime();
  const toast = useToast();
  const navigate = useNavigate();
  const [people, setPeople] = useState([]);
  const [streams, setStreams] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [deptFilter, setDeptFilter] = useState([]);
  const [code, setCode] = useState('');
  const [dialog, setDialog] = useState(null);
  const [profile, setProfile] = useState(false);
  const [serverName, setServerName] = useState('Streamon');
  const [calling, setCalling] = useState(null);

  useEffect(() => {
    fetch('/api/public').then((res) => res.json()).then((data) => {
      if (data.serverName) setServerName(data.serverName);
      document.title = data.serverName || 'Streamon';
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let stop = false;
    async function load() {
      try {
        const [directory, live] = await Promise.all([
          api('/api/directory'),
          api('/api/streams'),
        ]);
        if (!stop) {
          setPeople(directory.people);
          setDepartments(directory.departments || []);
          setStreams(live.streams);
        }
      } catch (error) {
        if (!stop) toast.push(error.message, 'warn');
      }
    }
    load();
    const timer = setInterval(load, 15000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [toast]);

  const onlineSet = new Set(online);
  const everyone = people.map((person) => ({
    ...person,
    online: online.length ? onlineSet.has(person.id) : person.online,
  }));
  const roster = everyone.filter((person) => matchesDepartmentPick(deptFilter, person));
  const peopleGroups = groupByDepartment(roster);

  async function createRoom(event) {
    event.preventDefault();
    const form = new FormData(event.target);
    try {
      const data = await api('/api/rooms', {
        method: 'POST',
        body: {
          title: form.get('title'),
          type: dialog,
          isPublic: form.get('isPublic') === 'on',
          password: form.get('password') || '',
        },
      });
      navigate(`/r/${data.room.code}`);
    } catch (error) {
      toast.push(error.message, 'warn');
    }
  }

  function joinByCode(event) {
    event.preventDefault();
    const value = code.trim().toLowerCase();
    if (!value) return;
    navigate(`/r/${value}`);
  }

  async function callPerson(person) {
    if (!socket) return;
    setCalling(person.id);
    let created = null;
    try {
      created = await api('/api/rooms', {
        method: 'POST',
        body: { title: `Звонок · ${person.name}`, type: 'conference', isPublic: false },
      });
      await socketRequest(socket, 'call:invite', {
        toUserId: person.id,
        roomCode: created.room.code,
        title: created.room.title,
      });
      navigate(`/r/${created.room.code}`);
    } catch (error) {
      toast.push(error.message, 'warn');
      if (created?.room?.code) {
        api(`/api/rooms/${created.room.code}/end`, { method: 'POST' }).catch(() => {});
      }
    } finally {
      setCalling(null);
    }
  }

  return (
    <div className="shell">
      <header className="shell-bar">
        <div className="brand">
          <span className="mark small" aria-hidden="true" />
          <div>
            <strong>{serverName}</strong>
            <em>Конференции и эфир</em>
          </div>
        </div>
        <div className="bar-actions">
          {user.role === 'admin' && <Link className="btn ghost" to="/admin">Админка</Link>}
          <button type="button" className="btn ghost" onClick={() => setProfile(true)}>{user.name}</button>
          <button type="button" className="btn ghost" onClick={logout}>Выйти</button>
        </div>
      </header>

      <main className="home">
        <section className="hero">
          <div>
            <p className="eyebrow">Здравствуйте, {user.name}</p>
            <h1>Начать разговор или выйти в эфир</h1>
          </div>
          <div className="hero-actions">
            <button type="button" className="action" onClick={() => setDialog('conference')}>
              <span>Конференция</span>
              <small>Все участники с камерой и микрофоном</small>
            </button>
            <button type="button" className="action mint" onClick={() => setDialog('stream')}>
              <span>Трансляция</span>
              <small>Вы ведёте эфир, остальные смотрят</small>
            </button>
            <button type="button" className="action wall" onClick={() => setDialog('wall')}>
              <span>Стена экранов</span>
              <small>Экраны всех устройств рядом, как в зале</small>
            </button>
          </div>
          <form className="join-row" onSubmit={joinByCode}>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="Код комнаты"
              aria-label="Код комнаты"
              maxLength={12}
            />
            <button className="btn primary" type="submit">Войти</button>
          </form>
        </section>

        <section className="split">
          <div className="panel">
            <header className="panel-head">
              <h2>Люди</h2>
              <span>{roster.filter((person) => person.online).length} в сети</span>
            </header>
            <div className="filter-row">
              <DepartmentSelect value={deptFilter} onChange={setDeptFilter} people={everyone} />
            </div>
            {people.length === 0 && <p className="empty">Пока на сервере больше никого нет. Администратор может завести пользователей.</p>}
            {people.length > 0 && roster.length === 0 && <p className="empty">В этом подразделении никого нет.</p>}
            {peopleGroups.map(([name, list]) => (
              <section key={name} className="dept-group">
                <h3>{name}</h3>
                <ul className="people">
                  {list.map((person) => (
                    <li key={person.id}>
                      <span className={person.online ? 'dot on' : 'dot'} />
                      <span className="who">{person.name}</span>
                      <button
                        type="button"
                        className="icon-btn"
                        disabled={!person.online || calling === person.id || !socket}
                        aria-label={`Позвонить ${person.name}`}
                        onClick={() => callPerson(person)}
                      >
                        <Icon name="phone" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <div className="panel">
            <header className="panel-head">
              <h2>Открытые трансляции</h2>
              <span>{streams.length}</span>
            </header>
            {streams.length === 0 && <p className="empty">Сейчас нет публичных эфиров.</p>}
            <ul className="streams">
              {streams.map((stream) => (
                <li key={stream.id}>
                  <div>
                    <strong>{stream.title}</strong>
                    <small>{stream.ownerName} · {stream.peers} {plural(stream.peers, 'зритель', 'зрителя', 'зрителей')}</small>
                  </div>
                  <button type="button" className="btn mint" onClick={() => navigate(`/r/${stream.code}`)}>Смотреть</button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      {dialog && (
        <Modal title={{ stream: 'Новая трансляция', wall: 'Новая стена экранов', conference: 'Новая конференция' }[dialog]} onClose={() => setDialog(null)}>
          <form className="stack" onSubmit={createRoom}>
            <Field label="Название">
              <input name="title" maxLength={80} placeholder={dialog === 'stream' ? 'Название эфира' : dialog === 'wall' ? 'Класс или зал' : 'Название встречи'} required />
            </Field>
            <Field label="Пароль, если нужен">
              <input name="password" type="text" maxLength={80} autoComplete="off" />
            </Field>
            <label className="check">
              <input name="isPublic" type="checkbox" defaultChecked={dialog !== 'conference'} />
              <span>Показывать в общем списке и пускать гостей</span>
            </label>
            <button className="btn primary" type="submit">Создать и открыть</button>
          </form>
        </Modal>
      )}
      {profile && <ProfileDialog onClose={() => setProfile(false)} />}
    </div>
  );
}
