import {
  addMessage,
  assertRoomAccess,
  canPublishIn,
  getRoomByCode,
} from './routes.js';
import { audit, listMessages } from './db.js';
import {
  closeProducer,
  connectTransport,
  consume,
  createTransport,
  joinRoom,
  kickPeer,
  pauseProducer,
  produce,
  removePeer,
  resumeConsumer,
  rtpCapabilities,
  setMediaState,
} from './media.js';
import { markOffline, markOnline, onlineIds, socketsOf } from './presence.js';
import { cleanText } from './util.js';

function reply(callback, payload) {
  if (typeof callback === 'function') callback(payload);
}

function asObject(value) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

async function handle(callback, work) {
  try {
    reply(callback, await work());
  } catch (error) {
    reply(callback, { error: error.message || 'Ошибка' });
  }
}

function emitAuthed(io, event, data) {
  for (const socket of io.sockets.sockets.values()) {
    if (!socket.user?.guest) socket.emit(event, data);
  }
}

export function registerSockets(io) {
  io.on('connection', (socket) => {
    const user = socket.user;
    if (!user.guest) {
      const fresh = markOnline(user.sub, socket);
      socket.emit('presence:snapshot', onlineIds());
      if (fresh) emitAuthed(io, 'presence:update', { userId: user.sub, online: true });
    }

    const chatTimes = [];

    socket.on('disconnect', () => {
      removePeer(socket);
      if (!user.guest && markOffline(user.sub, socket)) {
        emitAuthed(io, 'presence:update', { userId: user.sub, online: false });
      }
    });

    socket.on('rtpCapabilities', ({ roomCode } = {}, callback) => {
      handle(callback, async () => {
        const room = getRoomByCode(String(roomCode || '').toLowerCase());
        if (!room || room.status !== 'live') return { error: 'Комната не найдена или уже закрыта' };
        return { rtpCapabilities: await rtpCapabilities(room) };
      });
    });

    socket.on('joinRoom', (payload = {}, callback) => {
      handle(callback, async () => {
        const room = getRoomByCode(String(payload.roomCode || '').toLowerCase());
        assertRoomAccess(room, user, payload.password);
        if (!payload.rtpCapabilities) return { error: 'Нет параметров медиа' };
        const canPublish = canPublishIn(room, user);
        const displayName = cleanText(payload.displayName, 60);
        const joined = await joinRoom(socket, room, {
          rtpCapabilities: asObject(payload.rtpCapabilities),
          canPublish,
          displayName,
        });
        return {
          ...joined,
          room: {
            code: room.code,
            title: room.title,
            type: room.type,
            ownerId: room.owner_id,
            ownerName: room.owner_name,
          },
          messages: listMessages(room.id).map((message) => ({
            id: message.id,
            author: message.author,
            body: message.body,
            createdAt: message.created_at,
            userId: message.user_id,
          })),
        };
      });
    });

    socket.on('createTransport', ({ direction } = {}, callback) => {
      handle(callback, () => createTransport(socket, direction === 'send' ? 'send' : 'recv'));
    });

    socket.on('connectTransport', ({ transportId, dtlsParameters } = {}, callback) => {
      handle(callback, async () => {
        await connectTransport(socket, transportId, asObject(dtlsParameters));
        return { ok: true };
      });
    });

    socket.on('produce', (payload = {}, callback) => {
      handle(callback, () => produce(socket, {
        ...payload,
        rtpParameters: asObject(payload.rtpParameters),
        appData: asObject(payload.appData),
      }));
    });

    socket.on('consume', (payload = {}, callback) => {
      handle(callback, () => consume(socket, {
        ...payload,
        rtpCapabilities: asObject(payload.rtpCapabilities),
      }));
    });

    socket.on('resumeConsumer', ({ consumerId } = {}, callback) => {
      resumeConsumer(socket, consumerId);
      reply(callback, { ok: true });
    });

    socket.on('pauseProducer', ({ producerId } = {}, callback) => {
      pauseProducer(socket, producerId, true);
      reply(callback, { ok: true });
    });

    socket.on('resumeProducer', ({ producerId } = {}, callback) => {
      pauseProducer(socket, producerId, false);
      reply(callback, { ok: true });
    });

    socket.on('closeProducer', ({ producerId } = {}, callback) => {
      closeProducer(socket, producerId);
      reply(callback, { ok: true });
    });

    socket.on('mediaState', (state = {}) => {
      setMediaState(socket, state);
    });

    socket.on('chat', ({ body } = {}, callback) => {
      handle(callback, async () => {
        const code = socket.data.roomCode;
        const room = code ? getRoomByCode(code) : null;
        if (!room) return { error: 'Вы не в комнате' };
        const now = Date.now();
        while (chatTimes.length && now - chatTimes[0] > 10_000) chatTimes.shift();
        if (chatTimes.length >= 20) return { error: 'Слишком много сообщений' };
        const text = cleanText(body, 2000);
        if (!text) return { error: 'Пустое сообщение' };
        chatTimes.push(now);
        const message = addMessage({
          roomId: room.id,
          userId: user.guest ? null : user.sub,
          author: user.name,
          body: text,
        });
        const payload = {
          id: message.id,
          author: message.author,
          body: message.body,
          createdAt: message.createdAt,
          userId: message.userId,
        };
        for (const peerSocket of io.sockets.sockets.values()) {
          if (peerSocket.data.roomCode === room.code) peerSocket.emit('chat', payload);
        }
        return { message: payload };
      });
    });

    socket.on('kick', ({ peerId } = {}, callback) => {
      handle(callback, async () => {
        const target = kickPeer(socket, peerId);
        audit(user, 'kick', target?.name || peerId);
        return { ok: true };
      });
    });

    socket.on('leaveRoom', (_payload, callback) => {
      removePeer(socket);
      reply(callback, { ok: true });
    });

    socket.on('call:invite', ({ toUserId, roomCode, title } = {}, callback) => {
      if (user.guest) return reply(callback, { error: 'Гость не может звонить' });
      const room = getRoomByCode(String(roomCode || '').toLowerCase());
      if (!room || room.status !== 'live' || room.owner_id !== user.sub) {
        return reply(callback, { error: 'Звонок не привязан к вашей комнате' });
      }
      const targets = socketsOf(toUserId).filter((item) => item.id !== socket.id);
      if (targets.length === 0) return reply(callback, { error: 'Пользователь не в сети' });
      const free = targets.filter((item) => !item.data.roomCode);
      if (free.length === 0) return reply(callback, { error: 'Пользователь занят' });
      for (const target of free) {
        target.emit('call:incoming', {
          fromId: user.sub,
          fromName: user.name,
          roomCode,
          title: title || 'Звонок',
        });
      }
      reply(callback, { ok: true });
    });

    socket.on('call:decline', ({ toUserId } = {}) => {
      if (user.guest) return;
      for (const target of socketsOf(toUserId)) {
        target.emit('call:declined', { fromName: user.name });
      }
    });
  });
}
