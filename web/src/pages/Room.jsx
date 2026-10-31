import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, formatClock, groupByDepartment, hue, initials, matchesDepartmentPick, plural, roomTypeLabel } from '../api.js';
import { useAuth } from '../auth.jsx';
import { createRoomSession, primeAudio } from '../media/session.js';
import { useRealtime } from '../realtime.jsx';
import { Boot, DepartmentSelect, Field, Icon, Modal, useToast } from '../ui.jsx';

function Tile({ tile, videoOff, muted, expanded, onExpand }) {
  const box = useRef(null);
  const ref = useRef(null);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    let stop = false;
    element.srcObject = tile.stream;
    element.muted = true;
    element.play().catch(() => {
      if (!stop && !tile.local) setBlocked(true);
    });
    return () => { stop = true; };
  }, [tile.rev, tile.id, tile.stream, tile.local]);

  const label = tile.source === 'screen' ? `Экран · ${tile.peerName}` : tile.peerName;

  async function toggleFull(event) {
    if (event.target.closest('button')) return;
    const node = box.current;
    if (!node) return;
    if (expanded) {
      onExpand?.(tile.id);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      return;
    }
    if (document.fullscreenElement === node) {
      document.exitFullscreen().catch(() => {});
      return;
    }
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      await node.requestFullscreen();
    } catch {
      onExpand?.(tile.id);
    }
  }

  return (
    <article
      ref={box}
      className={`tile ${tile.source === 'screen' ? 'screen' : ''} ${videoOff ? 'video-off' : ''} ${expanded ? 'expanded' : ''}`}
      title="Двойной щелчок — на весь экран"
      onDoubleClick={toggleFull}
    >
      <video
        ref={ref}
        autoPlay
        playsInline
        className={tile.local && tile.source === 'camera' ? 'mirror' : ''}
      />
      {(!tile.hasVideo || videoOff) && (
        <div className="avatar" style={{ background: `hsl(${hue(tile.peerName)} 42% 38%)` }}>{initials(tile.peerName)}</div>
      )}
      <footer>
        <span>{label}</span>
        {muted && <em>микрофон выключен</em>}
      </footer>
      {blocked && !tile.local && (
        <button type="button" className="sound-unlock" onClick={() => { primeAudio().then(() => setBlocked(false)); }}>
          Включить звук
        </button>
      )}
    </article>
  );
}

export default function Room() {
  const { code } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user, ready, guest, logout } = useAuth();
  const realtime = useRealtime();
  const socket = realtime?.socket;
  const [meta, setMeta] = useState(null);
  const [metaError, setMetaError] = useState('');
  const [guestName, setGuestName] = useState('');
  const [password, setPassword] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [joined, setJoined] = useState(null);
  const [tiles, setTiles] = useState([]);
  const [peers, setPeers] = useState([]);
  const [selfId, setSelfId] = useState('');
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [canPublish, setCanPublish] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [hand, setHand] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [devices, setDevices] = useState({ audio: [], video: [] });
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [side, setSide] = useState('chat');
  const [sideOpen, setSideOpen] = useState(() => window.innerWidth > 980);
  const [error, setError] = useState('');
  const [combineOpen, setCombineOpen] = useState(false);
  const [liveRooms, setLiveRooms] = useState([]);
  const [picked, setPicked] = useState([]);
  const [showQuery, setShowQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState([]);
  const [rosterDept, setRosterDept] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [hear, setHear] = useState(true);
  const [startedAt, setStartedAt] = useState(null);
  const [clock, setClock] = useState('00:00');
  const sessionRef = useRef(null);

  useEffect(() => {
    let stop = false;
    api(`/api/rooms/${code}/public`)
      .then((data) => { if (!stop) setMeta(data); })
      .catch((err) => { if (!stop) setMetaError(err.message); });
    return () => { stop = true; };
  }, [code]);

  const isOwner = Boolean(user && meta && user.id === meta.ownerId);
  const isAdmin = user?.role === 'admin';
  const needsPassword = Boolean(meta?.hasPassword && !isOwner && !isAdmin && !unlocked);
  const canEnter = Boolean(meta && meta.status === 'live' && user && !needsPassword);
  const sessionPassword = needsPassword ? '' : password;

  useEffect(() => {
    setShowQuery('');
    setDeptFilter([]);
  }, [code]);

  useEffect(() => {
    if (!expandedId) return undefined;
    function onKey(event) {
      if (event.key === 'Escape') setExpandedId(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expandedId]);

  useEffect(() => {
    if (!startedAt) return undefined;
    const timer = setInterval(() => setClock(formatClock(Date.now() - startedAt)), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  useEffect(() => {
    if (!canEnter || !socket) return undefined;
    let alive = true;
    const session = createRoomSession(socket, {
      roomCode: code,
      password: sessionPassword,
      camera: meta.type !== 'wall',
      onEvent(type, payload) {
        if (!alive) return;
        if (type === 'joined') {
          setJoined(payload.room);
          setPeers(payload.peers);
          setSelfId(payload.selfId);
          setMessages(payload.messages || []);
          setCanPublish(payload.canPublish);
          setStartedAt(Date.now());
          setError('');
        } else if (type === 'tiles') setTiles(payload);
        else if (type === 'peerJoined') setPeers((list) => [...list.filter((item) => item.id !== payload.id), payload]);
        else if (type === 'peerLeft') setPeers((list) => list.filter((item) => item.id !== payload));
        else if (type === 'peerState') setPeers((list) => list.map((item) => (item.id === payload.id ? payload : item)));
        else if (type === 'chat') {
          setMessages((list) => (list.some((item) => item.id === payload.id) ? list : [...list, payload]));
        } else if (type === 'canPublish') setCanPublish(payload);
        else if (type === 'devices') setDevices(payload);
        else if (type === 'sharing') setSharing(payload);
        else if (type === 'sound') setHear(Boolean(payload));
        else if (type === 'warning') toast.push(payload, 'warn');
        else if (type === 'error') setError(payload);
        else if (type === 'kicked') {
          toast.push(payload?.reason || 'Вас исключили', 'warn');
          navigate('/app');
        } else if (type === 'closed') {
          toast.push(payload?.reason || 'Комната закрыта');
          setMeta((current) => (current ? { ...current, status: 'ended' } : current));
          setJoined(null);
        }
      },
    });
    sessionRef.current = session;
    session.join().catch((err) => {
      if (!alive) return;
      setError(err.message);
      if (String(err.message).toLowerCase().includes('пароль')) setUnlocked(false);
    });
    return () => {
      alive = false;
      session.leave();
      sessionRef.current = null;
    };
  }, [canEnter, socket, code, sessionPassword, navigate, toast]);

  useEffect(() => {
    function onKey(event) {
      if (!canPublish || event.target.closest('input, textarea')) return;
      const key = event.key.toLowerCase();
      if (key === 'm' || key === 'ь') {
        const next = !micOn;
        setMicOn(next);
        sessionRef.current?.setMic(next);
      }
      if (key === 'v' || key === 'м') {
        const next = !camOn;
        setCamOn(next);
        sessionRef.current?.setCam(next);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canPublish, micOn, camOn]);

  if (!ready || (!meta && !metaError)) return <Boot text="Открываем комнату" />;

  if (metaError) {
    return (
      <div className="gate">
        <div className="card">
          <h1>Комната не найдена</h1>
          <p>{metaError}</p>
          <Link className="btn primary" to={user && !user.guest ? '/app' : '/'}>На главную</Link>
        </div>
      </div>
    );
  }

  if (meta.status === 'ended' && !joined) {
    return (
      <div className="gate">
        <div className="card">
          <p className="eyebrow">Завершено</p>
          <h1>{meta.title}</h1>
          <p>Эта комната уже закрыта: {roomTypeLabel(meta.type).toLowerCase()}.</p>
          <Link className="btn primary" to={user && !user.guest ? '/app' : '/'}>На главную</Link>
        </div>
      </div>
    );
  }

  if (!user) {
    const loginHref = `/?next=${encodeURIComponent(`/r/${code}`)}`;
    if (!meta.isPublic || !meta.allowGuests) {
      return (
        <div className="gate">
          <div className="card">
            <p className="eyebrow">{meta.serverName}</p>
            <h1>{meta.title}</h1>
            <p>Нужна учётная запись этого сервера.</p>
            <Link className="btn primary" to={loginHref}>Войти</Link>
          </div>
        </div>
      );
    }
    return (
      <div className="gate">
        <form
          className="card stack"
          onSubmit={async (event) => {
            event.preventDefault();
            primeAudio();
            try {
              await guest(guestName, code);
              if (password) setUnlocked(true);
            } catch (err) {
              setError(err.message);
            }
          }}
        >
          <p className="eyebrow">Гостевой вход</p>
          <h1>{meta.title}</h1>
          <Field label="Как вас представить">
            <input value={guestName} onChange={(event) => setGuestName(event.target.value)} required minLength={2} maxLength={60} />
          </Field>
          {meta.hasPassword && (
            <Field label="Пароль комнаты">
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </Field>
          )}
          {error && <p className="form-error">{error}</p>}
          <button className="btn primary" type="submit">Войти</button>
          <Link className="text-link" to={loginHref}>У меня есть учётная запись</Link>
        </form>
      </div>
    );
  }

  if (needsPassword) {
    return (
      <div className="gate">
        <form
          className="card stack"
          onSubmit={(event) => {
            event.preventDefault();
            primeAudio();
            setUnlocked(true);
            setError('');
          }}
        >
          <h1>{meta.title}</h1>
          <Field label="Пароль комнаты">
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoFocus />
          </Field>
          {error && <p className="form-error">{error}</p>}
          <button className="btn primary" type="submit">Войти</button>
        </form>
      </div>
    );
  }

  const selfPeer = {
    id: selfId || 'self',
    userId: user.id,
    name: user.name,
    self: true,
    audio: micOn,
    video: camOn,
    hand,
    canPublish,
    guest: Boolean(user.guest),
    departmentId: user.departmentId || null,
    departmentName: user.departmentName || '',
  };
  const roster = [selfPeer, ...peers];
  const screens = tiles.filter((tile) => tile.source === 'screen');
  const cameras = tiles.filter((tile) => tile.source !== 'screen');
  const wall = meta.type === 'wall';
  const screenTiles = tiles.filter((tile) => tile.hasVideo || tile.source === 'screen');
  const shownPeers = new Set(screenTiles.map((tile) => (tile.local ? 'self' : tile.peerId)));
  const waitingTiles = roster.filter((person) => !shownPeers.has(person.self ? 'self' : person.id)).map((person) => ({
    id: `wait:${person.id}`,
    peerId: person.self ? 'local' : person.id,
    peerName: person.name,
    source: 'person',
    hasVideo: false,
    local: Boolean(person.self),
    stream: null,
    rev: person.id,
  }));
  const wallTiles = [...screenTiles, ...waitingTiles];
  const showQueryText = showQuery.trim().toLowerCase();
  const visibleWall = wallTiles.filter((tile) => {
    if (!matchesDepartmentPick(deptFilter, tilePerson(tile))) return false;
    if (!showQueryText) return true;
    return showLabel(tile).toLowerCase().includes(showQueryText);
  });
  const showPeople = [];
  const seenPeople = new Set();
  for (const tile of wallTiles) {
    const person = tilePerson(tile);
    const key = person.userId || person.id;
    if (!key || seenPeople.has(key)) continue;
    seenPeople.add(key);
    showPeople.push(person);
  }
  const count = roster.length;
  const host = isOwner || isAdmin;

  function showLabel(tile) {
    return tile.source === 'screen' ? `Экран · ${tile.peerName}` : tile.peerName;
  }

  function tilePerson(tile) {
    const person = tile.local ? selfPeer : peers.find((item) => item.id === tile.peerId);
    return {
      id: person?.id || tile.peerId || tile.id,
      userId: person?.userId || null,
      name: person?.name || tile.peerName,
      departmentId: person?.departmentId || null,
      departmentName: person?.departmentName || '',
    };
  }

  function toggleExpanded(id) {
    setExpandedId((current) => (current === id ? null : id));
  }

  function showAll() {
    setShowQuery('');
    setDeptFilter([]);
  }

  function peerOf(tile) {
    if (tile.local) return selfPeer;
    return peers.find((item) => item.id === tile.peerId);
  }

  async function sendChat(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    try {
      await sessionRef.current?.sendChat(text);
    } catch (err) {
      toast.push(err.message, 'warn');
      setDraft(text);
    }
  }

  async function leave() {
    if (meta.type === 'stream' && isOwner) {
      await api(`/api/rooms/${code}/end`, { method: 'POST' }).catch(() => {});
    }
    navigate(user.guest ? '/' : '/app');
  }

  async function endForAll() {
    await api(`/api/rooms/${code}/end`, { method: 'POST' });
    navigate(user.guest ? '/' : '/app');
  }

  async function toggleShare() {
    if (sessionRef.current?.isSharing()) {
      await sessionRef.current.stopShare();
      setSharing(false);
      return;
    }
    try {
      await sessionRef.current?.shareScreen();
      setSharing(true);
    } catch (err) {
      if (err?.name !== 'NotAllowedError') toast.push(err.message || 'Не удалось показать экран', 'warn');
    }
  }

  async function copyLink() {
    const link = `${window.location.origin}/r/${code}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.push('Ссылка скопирована');
    } catch {
      toast.push(link);
    }
  }

  return (
    <div className={`room ${sideOpen ? '' : 'no-side'}`}>
      <header className="room-top">
        <div>
          <strong>{joined?.title || meta.title}</strong>
          <button type="button" className="code" onClick={copyLink}>
            {code}
            <Icon name="copy" />
          </button>
        </div>
        <div className="room-status">
          {meta.type === 'stream' && isOwner && <span className="badge live">В эфире</span>}
          {meta.type === 'stream' && !isOwner && <span className="badge">Просмотр</span>}
          {wall && <span className="badge live">Стена экранов</span>}
          <span className="clock">{clock}</span>
          <span>{count} {plural(count, 'участник', 'участника', 'участников')}</span>
        </div>
        <div className="row">
          <button type="button" className="icon-btn" aria-label="Чат и участники" onClick={() => setSideOpen((value) => !value)}>
            <Icon name={side === 'people' ? 'users' : 'chat'} />
          </button>
          {!hear && (
            <button type="button" className="btn primary" onClick={() => primeAudio().then((ok) => setHear(ok))}>
              Включить звук
            </button>
          )}
          <button type="button" className="btn danger" onClick={leave}>Выйти</button>
        </div>
      </header>

      <div className="room-main">
        <section className={wall ? `stage wall${wallTiles.length ? ' filtered' : ''}` : (screens.length ? 'stage split' : 'stage')}>
          {!socket && <p className="empty">Подключаемся к серверу…</p>}
          {!window.isSecureContext && meta?.httpsUrl && (
            <p className="banner warn">
              Камера и микрофон на этом адресе недоступны.{' '}
              <a href={`${meta.httpsUrl}/r/${code}`}>Открыть {meta.httpsUrl}</a>
              {' '}и подтвердить сертификат.
            </p>
          )}
          {error && <p className="form-error banner-inline">{error}</p>}
          {wall && wallTiles.length > 0 && (
            <div className="show-filter">
              <DepartmentSelect value={deptFilter} onChange={setDeptFilter} people={showPeople} />
              <input
                value={showQuery}
                onChange={(event) => setShowQuery(event.target.value)}
                placeholder="Фильтр по показам"
                aria-label="Фильтр по показам"
              />
              <button type="button" className={showQueryText || deptFilter.length ? '' : 'on'} onClick={showAll}>Все</button>
              <span>{visibleWall.length} из {wallTiles.length}</span>
            </div>
          )}
          {wall && canPublish && (
            <div className="empty-wall">
              {screenTiles.length === 0 && <p className="empty">Экраны появятся здесь, когда устройства начнут трансляцию</p>}
              <button type="button" className="btn primary" onClick={toggleShare}>
                {sharing ? 'Остановить показ экрана' : 'Показать экран'}
              </button>
            </div>
          )}
          {wall && wallTiles.length > 0 && visibleWall.length === 0 && (
            <p className="empty">Нет показов по этому фильтру. Включите нужные или нажмите «Все».</p>
          )}
          {wall && visibleWall.length > 0 && (
            <div className="wall-grid">
              {visibleWall.map((tile) => (
                <Tile key={tile.id} tile={tile} videoOff={false} muted={false} expanded={expandedId === tile.id} onExpand={toggleExpanded} />
              ))}
            </div>
          )}
          {!wall && socket && tiles.length === 0 && !error && (
            <p className="empty">{canPublish ? 'Камера ещё не появилась' : 'Ожидаем ведущего'}</p>
          )}
          {!wall && screens.length > 0 && (
            <div className="stage-grid screens">
              {screens.map((tile) => (
                <Tile key={tile.id} tile={tile} videoOff={false} muted={false} expanded={expandedId === tile.id} onExpand={toggleExpanded} />
              ))}
            </div>
          )}
          {!wall && (
            <div className={screens.length ? 'film' : 'stage-grid'}>
              {cameras.map((tile) => {
                const person = peerOf(tile);
                return (
                  <Tile
                    key={tile.id}
                    tile={tile}
                    videoOff={tile.source === 'camera' && person?.video === false}
                    muted={person?.audio === false && tile.source === 'camera'}
                    expanded={expandedId === tile.id}
                    onExpand={toggleExpanded}
                  />
                );
              })}
            </div>
          )}
        </section>

        {sideOpen && (
          <aside className="side">
            <div className="tabs">
              <button type="button" className={side === 'chat' ? 'on' : ''} onClick={() => setSide('chat')}>Чат</button>
              <button type="button" className={side === 'people' ? 'on' : ''} onClick={() => setSide('people')}>Люди</button>
            </div>
            {side === 'chat' ? (
              <div className="chat">
                <div className="chat-log">
                  {messages.map((message) => (
                    <div key={message.id} className="bubble">
                      <b>{message.author}</b>
                      <p>{message.body}</p>
                    </div>
                  ))}
                </div>
                <form onSubmit={sendChat}>
                  <input
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="Сообщение"
                    maxLength={2000}
                  />
                </form>
              </div>
            ) : (
              <div className="roster-wrap">
                <DepartmentSelect value={rosterDept} onChange={setRosterDept} people={roster} />
                {groupByDepartment(roster.filter((person) => matchesDepartmentPick(rosterDept, person))).map(([name, list]) => (
                  <section key={name} className="dept-group">
                    <h3>{name}</h3>
              <ul className="roster">
                {list.map((person) => (
                  <li key={person.id}>
                    <div>
                      <strong>{person.self ? `${person.name} (вы)` : person.name}</strong>
                      <small>
                        {person.hand ? 'поднял руку · ' : ''}
                        {person.audio === false ? 'без микрофона' : 'микрофон'}
                        {person.userId && person.userId === meta.ownerId ? ' · ведущий' : ''}
                      </small>
                    </div>
                    {host && !person.self && !person.linked && (
                      <div className="row tight">
                        {!person.linked && meta.type === 'stream' && person.userId && !String(person.userId).startsWith('guest:') && person.userId !== meta.ownerId && (
                          <button
                            type="button"
                            className="btn tiny"
                            onClick={() => api(`/api/rooms/${code}/role`, {
                              method: 'POST',
                              body: { userId: person.userId, role: person.canPublish ? 'viewer' : 'speaker' },
                            }).catch((err) => toast.push(err.message, 'warn'))}
                          >
                            {person.canPublish ? 'Убрать из эфира' : 'В эфир'}
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn tiny danger"
                          onClick={() => sessionRef.current?.kick(person.id).catch((err) => toast.push(err.message, 'warn'))}
                        >
                          Исключить
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
                  </section>
                ))}
              </div>
            )}
          </aside>
        )}
      </div>

      <footer className="controls">
        {canPublish && !wall && (
          <>
            <button type="button" className={`icon-btn ${micOn ? '' : 'off'}`} aria-label="Микрофон" onClick={() => { const next = !micOn; setMicOn(next); sessionRef.current?.setMic(next); }}>
              <Icon name={micOn ? 'mic' : 'mic-off'} />
            </button>
            <button type="button" className={`icon-btn ${camOn ? '' : 'off'}`} aria-label="Камера" onClick={() => { const next = !camOn; setCamOn(next); sessionRef.current?.setCam(next); }}>
              <Icon name={camOn ? 'cam' : 'cam-off'} />
            </button>
          </>
        )}
        {canPublish && (
            <button
              type="button"
              className={`icon-btn ${sharing ? 'on-air' : ''}`}
              aria-label="Экран"
              onClick={toggleShare}
            >
              <Icon name="screen" />
            </button>
        )}
        {meta.type === 'conference' && (
          <button
            type="button"
            className={`icon-btn ${hand ? 'on-air' : ''}`}
            aria-label="Поднять руку"
            onClick={() => setHand(sessionRef.current?.toggleHand() ?? !hand)}
          >
            <Icon name="hand" />
          </button>
        )}
        {canPublish && !wall && (
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setDevicesOpen((value) => !value);
              sessionRef.current?.listDevices().catch((err) => toast.push(err.message, 'warn'));
            }}
          >
            Устройства
          </button>
        )}
        {host && meta.type !== 'stream' && (
          <button
            type="button"
            className="btn ghost"
            onClick={async () => {
              try {
                const data = await api('/api/live');
                setLiveRooms(data.rooms.filter((room) => room.code !== code));
                setPicked([]);
                setCombineOpen(true);
              } catch (err) {
                toast.push(err.message, 'warn');
              }
            }}
          >
            Добавить трансляции
          </button>
        )}
        {host && (
          <button type="button" className="btn danger" onClick={endForAll}>
            {meta.type === 'stream' ? 'Завершить эфир' : wall ? 'Завершить стену' : 'Завершить для всех'}
          </button>
        )}
        {devicesOpen && canPublish && (
          <div className="device-pop">
            <label>
              Микрофон
              <select onChange={(event) => sessionRef.current?.setAudioDevice(event.target.value).catch((err) => toast.push(err.message, 'warn'))}>
                {devices.audio.length === 0 && <option value="">Микрофоны не найдены</option>}
                {devices.audio.map((item, index) => <option key={item.deviceId || index} value={item.deviceId}>{item.label || `Микрофон ${index + 1}`}</option>)}
              </select>
            </label>
            <label>
              Камера
              <select onChange={(event) => sessionRef.current?.setVideoDevice(event.target.value).catch((err) => toast.push(err.message, 'warn'))}>
                {devices.video.length === 0 && <option value="">Камеры не найдены</option>}
                {devices.video.map((item, index) => <option key={item.deviceId || index} value={item.deviceId}>{item.label || `Камера ${index + 1}`}</option>)}
              </select>
            </label>
          </div>
        )}
      </footer>
      {combineOpen && (
        <Modal title="Добавить экраны в эту комнату" onClose={() => setCombineOpen(false)}>
          <form
            className="stack"
            onSubmit={async (event) => {
              event.preventDefault();
              try {
                const data = await api(`/api/rooms/${code}/combine`, { method: 'POST', body: { codes: picked } });
                const added = data.linked.reduce((sum, item) => sum + (item.added || 0), 0);
                const failed = data.linked.find((item) => item.error);
                toast.push(failed?.error || (added ? `На стене экранов: ${added}` : 'Видео пока нет. Экран появится, когда его включат'));
                setCombineOpen(false);
              } catch (err) {
                toast.push(err.message, 'warn');
              }
            }}
          >
            <p className="empty">Живые трансляции и комнаты появятся здесь сеткой. Устройство может оставаться в своём эфире.</p>
            {liveRooms.length === 0 && <p className="empty">Сейчас нет других живых комнат.</p>}
            <div className="pick">
              {liveRooms.map((room) => (
                <label key={room.code}>
                  <input
                    type="checkbox"
                    checked={picked.includes(room.code)}
                    onChange={(event) => {
                      setPicked((list) => (event.target.checked ? [...list, room.code] : list.filter((item) => item !== room.code)));
                    }}
                  />
                  <span>
                    <strong>{room.title}</strong>
                    <small>{roomTypeLabel(room.type)} · {room.ownerName} · {room.peers} в комнате</small>
                  </span>
                </label>
              ))}
            </div>
            <button className="btn primary" type="submit" disabled={picked.length === 0}>Объединить</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
