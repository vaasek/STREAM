import { adminRequired, authRequired, signGuest, signUser } from './auth.js';
import { config, initialAdminFile } from './config.js';
import {
  addMessage,
  audit,
  checkPassword,
  clearInitialAdminFile,
  countAdmins,
  countUsers,
  createDepartment,
  createRoom,
  createUser,
  deleteDepartment,
  deleteRoom,
  deleteUser,
  endRoom,
  getDepartment,
  getRoomByCode,
  getRoomById,
  getRoomRole,
  getSettings,
  getUserByEmail,
  getUserById,
  listDepartments,
  initialAdminPending,
  listAudit,
  listLive,
  listLivePublic,
  listMessages,
  listRooms,
  listUsers,
  renameDepartment,
  roomCounts,
  roomPasswordOk,
  roomsPerDay,
  saveSettings,
  setRoomRole,
  touchLogin,
  updateUser,
} from './db.js';
import { finishRoom, linkRooms, mediaStatus, peerCounts, setPublishPermission, totalPeers } from './media.js';
import { dropUser, onlineCount, onlineIds } from './presence.js';
import { asyncRoute, cleanText, dayStamp, httpError, validEmail } from './util.js';

const loginAttempts = new Map();

function tooManyAttempts(key) {
  const now = Date.now();
  const list = (loginAttempts.get(key) || []).filter((ts) => now - ts < 10 * 60 * 1000);
  loginAttempts.set(key, list);
  return list.length >= 8;
}

function markAttempt(key) {
  const list = loginAttempts.get(key) || [];
  list.push(Date.now());
  loginAttempts.set(key, list);
}

function mapRoom(room, peers) {
  if (!room) return null;
  return {
    id: room.id,
    code: room.code,
    title: room.title,
    type: room.type,
    ownerId: room.owner_id,
    ownerName: room.owner_name || '—',
    isPublic: Boolean(room.is_public),
    hasPassword: Boolean(room.password_hash),
    maxParticipants: room.max_participants,
    status: room.status,
    createdAt: room.created_at,
    endedAt: room.ended_at,
    peakPeers: Math.max(room.peak_peers || 0, peers || 0),
    peers: peers ?? 0,
  };
}

function requirePassword(value) {
  const password = String(value || '');
  if (password.length < 8) throw httpError(400, 'Пароль должен быть не короче 8 символов');
  if (password.length > 100) throw httpError(400, 'Пароль слишком длинный');
  return password;
}

function departmentFromBody(body) {
  const raw = body?.departmentId;
  if (!raw) return null;
  const department = getDepartment(String(raw));
  if (!department) throw httpError(400, 'Подразделение не найдено');
  return department.id;
}

function publicUser(user) {
  const departmentId = user.departmentId || user.department_id || null;
  const departmentName = user.departmentName || user.department_name || (departmentId ? getDepartment(departmentId)?.name : '') || '';
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    guest: false,
    email: user.email,
    departmentId,
    departmentName,
  };
}

export function registerRoutes(app) {
  app.get('/api/health', (req, res) => {
    const media = mediaStatus();
    res.json({ ok: true, version: config.version, media: media.up });
  });

  app.get('/api/public', (req, res) => {
    const settings = getSettings();
    res.json({
      serverName: settings.serverName,
      allowRegistration: settings.allowRegistration,
      allowGuests: settings.allowGuests,
      welcomeText: settings.welcomeText,
      version: config.version,
      httpsUrl: config.httpsUrl,
    });
  });

  app.post('/api/auth/login', asyncRoute(async (req, res) => {
    const email = cleanText(req.body?.email, 120).toLowerCase();
    const password = String(req.body?.password || '');
    const key = `${req.ip}:${email}`;
    if (tooManyAttempts(key)) throw httpError(429, 'Слишком много попыток. Подождите десять минут');
    const user = validEmail(email) ? getUserByEmail(email) : null;
    if (!user || user.status !== 'active' || !checkPassword(user, password)) {
      markAttempt(key);
      audit({ id: user?.id, name: email }, 'login_failed', email);
      throw httpError(401, 'Неверная почта или пароль');
    }
    touchLogin(user.id);
    audit(user, 'login', email);
    res.json({ token: signUser(user), user: publicUser(user) });
  }));

  app.post('/api/auth/register', asyncRoute(async (req, res) => {
    const settings = getSettings();
    if (!settings.allowRegistration) throw httpError(403, 'Регистрация на сервере закрыта');
    const name = cleanText(req.body?.name, 60);
    const email = cleanText(req.body?.email, 120).toLowerCase();
    const password = requirePassword(req.body?.password);
    if (name.length < 2) throw httpError(400, 'Укажите имя');
    if (!validEmail(email)) throw httpError(400, 'Укажите почту');
    if (getUserByEmail(email)) throw httpError(409, 'Такая почта уже зарегистрирована');
    const user = createUser({ email, name, password, role: 'user' });
    audit(user, 'register', email);
    res.status(201).json({ token: signUser(user), user: publicUser(user) });
  }));

  app.get('/api/auth/me', authRequired, (req, res) => {
    if (req.user.guest) {
      return res.json({
        id: req.user.sub,
        name: req.user.name,
        role: 'guest',
        guest: true,
        roomCode: req.user.roomCode,
      });
    }
    res.json(publicUser(req.user));
  });

  app.patch('/api/auth/profile', authRequired, asyncRoute(async (req, res) => {
    if (req.user.guest) throw httpError(403, 'Гость не может менять профиль');
    const user = getUserById(req.user.sub);
    const name = req.body?.name != null ? cleanText(req.body.name, 60) : user.name;
    if (name.length < 2) throw httpError(400, 'Укажите имя');
    let password;
    if (req.body?.newPassword) {
      if (!checkPassword(user, String(req.body.currentPassword || ''))) {
        throw httpError(400, 'Текущий пароль не совпадает');
      }
      password = requirePassword(req.body.newPassword);
    }
    const updated = updateUser(user.id, { name, password });
    if (password) clearInitialAdminFile();
    audit(updated, 'profile_update', password ? 'пароль изменён' : 'имя изменено');
    res.json({ user: publicUser(updated), token: signUser(updated) });
  }));

  app.post('/api/auth/guest', asyncRoute(async (req, res) => {
    const settings = getSettings();
    if (!settings.allowGuests) throw httpError(403, 'Гостевой вход отключён');
    const code = cleanText(req.body?.roomCode, 12).toLowerCase();
    const name = cleanText(req.body?.name, 60);
    if (name.length < 2) throw httpError(400, 'Укажите имя');
    const room = getRoomByCode(code);
    if (!room || room.status !== 'live') throw httpError(404, 'Комната не найдена или уже закрыта');
    if (!room.is_public) throw httpError(403, 'В закрытую комнату можно войти только по учётной записи');
    const guest = signGuest({ name, roomCode: code });
    res.json({ token: guest.token, user: { id: guest.id, name, role: 'guest', guest: true, roomCode: code } });
  }));

  app.get('/api/directory', authRequired, (req, res) => {
    if (req.user.guest) throw httpError(403, 'Недостаточно прав');
    const online = new Set(onlineIds());
    const people = listUsers()
      .filter((user) => user.status === 'active' && user.id !== req.user.sub)
      .map((user) => ({
        id: user.id,
        name: user.name,
        online: online.has(user.id),
        departmentId: user.departmentId,
        departmentName: user.departmentName,
      }));
    res.json({ people, departments: listDepartments() });
  });

  app.get('/api/streams', (req, res) => {
    const counts = peerCounts();
    res.json({
      streams: listLivePublic('stream').map((room) => mapRoom(room, counts[room.code] || 0)),
    });
  });

  app.get('/api/live', authRequired, (req, res) => {
    const counts = peerCounts();
    const rooms = listLive()
      .filter((room) => room.is_public || room.owner_id === req.user.sub || req.user.role === 'admin')
      .map((room) => mapRoom(room, counts[room.code] || 0));
    res.json({ rooms });
  });

  app.get('/api/rooms/:code/public', (req, res) => {
    const settings = getSettings();
    const room = getRoomByCode(String(req.params.code || '').toLowerCase());
    if (!room) return res.status(404).json({ error: 'Комната не найдена' });
    res.json({
      ...mapRoom(room, peerCounts()[room.code] || 0),
      allowGuests: settings.allowGuests,
      serverName: settings.serverName,
      httpsUrl: config.httpsUrl,
    });
  });

  app.post('/api/rooms', authRequired, asyncRoute(async (req, res) => {
    if (req.user.guest) throw httpError(403, 'Гость не может создавать комнаты');
    const type = req.body?.type === 'stream' || req.body?.type === 'wall' ? req.body.type : 'conference';
    const title = cleanText(req.body?.title, 80) || (type === 'stream' ? 'Трансляция' : type === 'wall' ? 'Стена экранов' : 'Конференция');
    const isPublic = Boolean(req.body?.isPublic);
    const password = cleanText(req.body?.password, 80);
    const maxParticipants = 0;
    const room = createRoom({
      title,
      type,
      ownerId: req.user.sub,
      isPublic,
      password,
      maxParticipants,
    });
    audit(req.user, type === 'stream' ? 'stream_create' : 'room_create', `${room.code} ${title}`);
    res.status(201).json({ room: mapRoom(room, 0) });
  }));

  app.get('/api/rooms/:code/messages', authRequired, (req, res) => {
    const room = getRoomByCode(String(req.params.code || '').toLowerCase());
    if (!room) throw httpError(404, 'Комната не найдена');
    res.json({
      messages: listMessages(room.id).map((message) => ({
        id: message.id,
        author: message.author,
        body: message.body,
        createdAt: message.created_at,
        userId: message.user_id,
      })),
    });
  });

  app.post('/api/rooms/:code/end', authRequired, asyncRoute(async (req, res) => {
    const room = getRoomByCode(String(req.params.code || '').toLowerCase());
    if (!room) throw httpError(404, 'Комната не найдена');
    if (room.owner_id !== req.user.sub && req.user.role !== 'admin') {
      throw httpError(403, 'Завершить комнату может ведущий или администратор');
    }
    const reason = room.type === 'stream' ? 'Трансляция завершена' : 'Конференция завершена';
    const closedLive = room.status === 'live' && finishRoom(room.code, reason);
    if (room.status === 'live' && !closedLive) endRoom(room.id);
    audit(req.user, 'room_end', room.code);
    res.json({ ok: true });
  }));

  app.post('/api/rooms/:code/role', authRequired, asyncRoute(async (req, res) => {
    const room = getRoomByCode(String(req.params.code || '').toLowerCase());
    if (!room || room.status !== 'live') throw httpError(404, 'Комната не найдена');
    if (room.type !== 'stream') throw httpError(400, 'Роли спикеров есть только у трансляций');
    if (room.owner_id !== req.user.sub && req.user.role !== 'admin') throw httpError(403, 'Недостаточно прав');
    const userId = cleanText(req.body?.userId, 80);
    const role = req.body?.role === 'speaker' ? 'speaker' : 'viewer';
    const target = getUserById(userId);
    if (!target) throw httpError(404, 'Пользователь не найден');
    if (target.id === room.owner_id) throw httpError(400, 'Владелец трансляции уже ведёт эфир');
    setRoomRole(room.id, target.id, role);
    setPublishPermission(room.code, target.id, role === 'speaker');
    audit(req.user, 'stream_role', `${room.code} ${target.name} ${role}`);
    res.json({ ok: true, role });
  }));

  app.post('/api/rooms/:code/combine', authRequired, asyncRoute(async (req, res) => {
    const room = getRoomByCode(String(req.params.code || '').toLowerCase());
    if (!room || room.status !== 'live') throw httpError(404, 'Комната не найдена или уже закрыта');
    if (req.user.guest) throw httpError(403, 'Гость не может объединять трансляции');
    if (req.user.sub !== room.owner_id && req.user.role !== 'admin') {
      throw httpError(403, 'Объединять комнаты может ведущий');
    }
    if (room.type === 'stream') throw httpError(400, 'Объединять экраны можно в конференции или на стене');
    const codes = Array.isArray(req.body?.codes) ? req.body.codes : [];
    const linked = [];
    for (const raw of codes.slice(0, 20)) {
      const source = getRoomByCode(cleanText(raw, 16).toLowerCase());
      if (!source || source.status !== 'live' || source.code === room.code) continue;
      const allowed = source.is_public || source.owner_id === req.user.sub || req.user.role === 'admin';
      if (!allowed) {
        linked.push({ code: source.code, title: source.title, added: 0, error: 'Нет доступа' });
        continue;
      }
      try {
        const added = await linkRooms(room, source);
        linked.push({ code: source.code, title: source.title, added });
      } catch (error) {
        linked.push({ code: source.code, title: source.title, added: 0, error: error.message });
      }
    }
    audit(req.user, 'room_combine', `${room.code} ${linked.map((item) => item.code).join(',')}`);
    res.json({ linked });
  }));

  app.get('/api/admin/stats', authRequired, adminRequired, (req, res) => {
    const counts = roomCounts();
    const since = new Date();
    since.setDate(since.getDate() - 6);
    const rows = roomsPerDay(since.toISOString());
    const byDay = new Map(rows.map((row) => [row.day, row.count]));
    const week = [];
    for (let i = 6; i >= 0; i -= 1) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const day = dayStamp(date);
      week.push({ day, count: byDay.get(day) || 0 });
    }
    const countsNow = peerCounts();
    const liveRooms = listRooms(100)
      .filter((room) => room.status === 'live')
      .slice(0, 8)
      .map((room) => mapRoom(room, countsNow[room.code] || 0));
    const media = mediaStatus();
    res.json({
      users: countUsers(),
      onlineUsers: onlineCount(),
      peers: totalPeers(),
      liveConferences: counts.conference,
      liveStreams: counts.stream,
      liveWalls: counts.wall,
      announcedIp: media.announcedIp,
      announcedIpIsLocal: config.announcedIpIsLocal,
      rtcMinPort: media.rtcMinPort,
      rtcMaxPort: media.rtcMaxPort,
      media: media.up,
      mediaError: media.error,
      version: config.version,
      initialPasswordPending: initialAdminPending(),
      initialPasswordFile: initialAdminFile,
      week,
      liveRooms,
    });
  });

  app.get('/api/admin/users', authRequired, adminRequired, (req, res) => {
    const online = new Set(onlineIds());
    res.json({
      users: listUsers().map((user) => ({ ...user, online: online.has(user.id) })),
      departments: listDepartments(),
    });
  });

  app.post('/api/admin/departments', authRequired, adminRequired, asyncRoute(async (req, res) => {
    const name = cleanText(req.body?.name, 60);
    if (name.length < 2) throw httpError(400, 'Укажите название подразделения');
    const department = createDepartment(name);
    if (!department) throw httpError(409, 'Такое подразделение уже есть');
    audit(req.user, 'department_create', name);
    res.status(201).json({ department });
  }));

  app.patch('/api/admin/departments/:id', authRequired, adminRequired, asyncRoute(async (req, res) => {
    const name = cleanText(req.body?.name, 60);
    if (name.length < 2) throw httpError(400, 'Укажите название подразделения');
    const department = renameDepartment(req.params.id, name);
    if (department === null) throw httpError(404, 'Подразделение не найдено');
    if (department === false) throw httpError(409, 'Такое подразделение уже есть');
    audit(req.user, 'department_rename', name);
    res.json({ department });
  }));

  app.delete('/api/admin/departments/:id', authRequired, adminRequired, asyncRoute(async (req, res) => {
    const department = getDepartment(req.params.id);
    if (!department) throw httpError(404, 'Подразделение не найдено');
    deleteDepartment(department.id);
    audit(req.user, 'department_delete', department.name);
    res.json({ ok: true });
  }));

  app.post('/api/admin/users', authRequired, adminRequired, asyncRoute(async (req, res) => {
    const name = cleanText(req.body?.name, 60);
    const email = cleanText(req.body?.email, 120).toLowerCase();
    const password = requirePassword(req.body?.password);
    const role = req.body?.role === 'admin' ? 'admin' : 'user';
    const departmentId = departmentFromBody(req.body);
    if (name.length < 2) throw httpError(400, 'Укажите имя');
    if (!validEmail(email)) throw httpError(400, 'Укажите почту');
    if (getUserByEmail(email)) throw httpError(409, 'Такая почта уже есть');
    const user = createUser({ email, name, password, role, departmentId });
    audit(req.user, 'user_create', `${email} (${role})`);
    res.status(201).json({ user });
  }));

  app.patch('/api/admin/users/:id', authRequired, adminRequired, asyncRoute(async (req, res) => {
    const user = getUserById(req.params.id);
    if (!user) throw httpError(404, 'Пользователь не найден');
    const fields = {};
    if (req.body?.name != null) {
      fields.name = cleanText(req.body.name, 60);
      if (fields.name.length < 2) throw httpError(400, 'Укажите имя');
    }
    if (req.body?.role != null) {
      fields.role = req.body.role === 'admin' ? 'admin' : 'user';
      if (user.role === 'admin' && fields.role !== 'admin' && countAdmins() <= 1) {
        throw httpError(400, 'Нельзя снять роль с последнего администратора');
      }
    }
    if (req.body?.status != null) {
      fields.status = req.body.status === 'disabled' ? 'disabled' : 'active';
      if (user.role === 'admin' && fields.status === 'disabled' && countAdmins() <= 1) {
        throw httpError(400, 'Нельзя отключить последнего администратора');
      }
    }
    if (req.body?.password) fields.password = requirePassword(req.body.password);
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'departmentId')) {
      fields.departmentId = departmentFromBody(req.body);
    }
    const updated = updateUser(user.id, fields);
    if (fields.status === 'disabled') dropUser(user.id);
    if (fields.password && user.id === req.user.sub) clearInitialAdminFile();
    audit(req.user, 'user_update', `${user.email} ${JSON.stringify(fields.status || fields.role || 'профиль')}`);
    res.json({ user: updated });
  }));

  app.delete('/api/admin/users/:id', authRequired, adminRequired, asyncRoute(async (req, res) => {
    const user = getUserById(req.params.id);
    if (!user) throw httpError(404, 'Пользователь не найден');
    if (user.id === req.user.sub) throw httpError(400, 'Нельзя удалить свою учётную запись');
    if (user.role === 'admin' && countAdmins() <= 1) throw httpError(400, 'Нельзя удалить последнего администратора');
    dropUser(user.id);
    deleteUser(user.id);
    audit(req.user, 'user_delete', user.email);
    res.json({ ok: true });
  }));

  app.get('/api/admin/rooms', authRequired, adminRequired, (req, res) => {
    const counts = peerCounts();
    res.json({ rooms: listRooms(400).map((room) => mapRoom(room, counts[room.code] || 0)) });
  });

  app.delete('/api/admin/rooms/:id', authRequired, adminRequired, asyncRoute(async (req, res) => {
    const room = getRoomById(req.params.id);
    if (!room) throw httpError(404, 'Комната не найдена');
    finishRoom(room.code, 'Комната удалена администратором');
    deleteRoom(room.id);
    audit(req.user, 'room_delete', room.code);
    res.json({ ok: true });
  }));

  app.get('/api/admin/settings', authRequired, adminRequired, (req, res) => {
    res.json({
      settings: getSettings(),
      announcedIp: config.announcedIp,
      rtcMinPort: config.rtcMinPort,
      rtcMaxPort: config.rtcMaxPort,
    });
  });

  app.put('/api/admin/settings', authRequired, adminRequired, asyncRoute(async (req, res) => {
    const body = req.body || {};
    const next = {};
    if (body.serverName != null) {
      next.serverName = cleanText(body.serverName, 40) || 'Streamon';
    }
    if (body.welcomeText != null) next.welcomeText = cleanText(body.welcomeText, 280);
    if (body.allowRegistration != null) next.allowRegistration = Boolean(body.allowRegistration);
    if (body.allowGuests != null) next.allowGuests = Boolean(body.allowGuests);
    if (body.maxParticipants != null) {
      next.maxParticipants = Math.min(50, Math.max(2, Number(body.maxParticipants) || 16));
    }
    if (body.maxViewers != null) {
      next.maxViewers = Math.min(1000, Math.max(2, Number(body.maxViewers) || 300));
    }
    if (body.stunUrl != null) next.stunUrl = cleanText(body.stunUrl, 200);
    if (body.turnUrl != null) next.turnUrl = cleanText(body.turnUrl, 200);
    if (body.turnUsername != null) next.turnUsername = cleanText(body.turnUsername, 120);
    if (body.turnPassword != null) next.turnPassword = String(body.turnPassword).slice(0, 120);
    const settings = saveSettings(next);
    audit(req.user, 'settings_update', settings.serverName);
    res.json({ settings });
  }));

  app.get('/api/admin/audit', authRequired, adminRequired, (req, res) => {
    const before = req.query.before ? Number(req.query.before) : undefined;
    const rows = listAudit(120, Number.isFinite(before) ? before : undefined);
    res.json({
      events: rows.map((row) => ({
        id: row.id,
        actorId: row.actor_id,
        actorName: row.actor_name,
        action: row.action,
        detail: row.detail,
        createdAt: row.created_at,
      })),
    });
  });
}

export function canPublishIn(room, user) {
  if (!user) return false;
  if (room.type === 'conference' || room.type === 'wall') return true;
  if (user.sub === room.owner_id) return true;
  if (user.guest) return false;
  return getRoomRole(room.id, user.sub) === 'speaker';
}

export function assertRoomAccess(room, user, password) {
  if (!room || room.status !== 'live') throw httpError(404, 'Комната не найдена или уже закрыта');
  if (user.guest) {
    if (user.roomCode !== room.code) throw httpError(403, 'Гостевой вход выдан для другой комнаты');
    if (!room.is_public) throw httpError(403, 'Комната закрыта');
    if (!getSettings().allowGuests) throw httpError(403, 'Гостевой вход отключён');
  }
  const privileged = !user.guest && (user.sub === room.owner_id || user.role === 'admin');
  if (!privileged && !roomPasswordOk(room, password)) throw httpError(403, 'Неверный пароль комнаты');
}

export { addMessage, getRoomByCode, mapRoom };
