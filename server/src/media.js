import mediasoup from 'mediasoup';
import { config } from './config.js';
import { endRoom, getSettings, setPeak, setRoomRole } from './db.js';

const mediaCodecs = [
  { kind: 'audio', mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: { 'x-google-start-bitrate': 1000 },
  },
  {
    kind: 'video',
    mimeType: 'video/H264',
    clockRate: 90000,
    parameters: {
      'packetization-mode': 1,
      'profile-level-id': '4d0032',
      'level-asymmetry-allowed': 1,
      'x-google-start-bitrate': 1000,
    },
  },
  {
    kind: 'video',
    mimeType: 'video/H264',
    clockRate: 90000,
    parameters: {
      'packetization-mode': 1,
      'profile-level-id': '42e01f',
      'level-asymmetry-allowed': 1,
      'x-google-start-bitrate': 1000,
    },
  },
];

let worker = null;
let workerError = '';
const rooms = new Map();

export function mediaStatus() {
  return {
    up: Boolean(worker),
    error: workerError,
    announcedIp: config.announcedIp,
    rtcMinPort: config.rtcMinPort,
    rtcMaxPort: config.rtcMaxPort,
  };
}

export async function startMedia() {
  try {
    worker = await mediasoup.createWorker({
      logLevel: config.mediasoupLog,
      rtcMinPort: config.rtcMinPort,
      rtcMaxPort: config.rtcMaxPort,
    });
    worker.on('died', () => {
      console.error('mediasoup worker завершился, процесс будет перезапущен');
      process.exit(1);
    });
    workerError = '';
    console.log(`Медиасервер слушает ${config.announcedIp}, UDP/TCP ${config.rtcMinPort}-${config.rtcMaxPort}`);
  } catch (error) {
    worker = null;
    workerError = error.message;
    console.error('Медиасервер не запустился:', error.message);
  }
}

export function iceServers() {
  const settings = getSettings();
  const servers = [];
  if (settings.stunUrl) servers.push({ urls: settings.stunUrl });
  if (settings.turnUrl) {
    servers.push({
      urls: settings.turnUrl,
      username: settings.turnUsername || undefined,
      credential: settings.turnPassword || undefined,
    });
  }
  return servers;
}

export function peerCounts() {
  const counts = {};
  for (const [code, room] of rooms) counts[code] = room.peers.size + (room.ghosts?.size || 0);
  return counts;
}

export function totalPeers() {
  let n = 0;
  for (const room of rooms.values()) n += room.peers.size;
  return n;
}

async function ensureRoom(dbRoom) {
  if (!worker) {
    const error = new Error(workerError || 'Медиасервер не запущен');
    error.status = 503;
    throw error;
  }
  let room = rooms.get(dbRoom.code);
  if (room && !room.closed) {
    clearTimeout(room.idleTimer);
    room.ownerId = dbRoom.owner_id;
    room.type = dbRoom.type;
    room.dbId = dbRoom.id;
    return room;
  }
  const router = await worker.createRouter({ mediaCodecs });
  room = {
    code: dbRoom.code,
    dbId: dbRoom.id,
    type: dbRoom.type,
    ownerId: dbRoom.owner_id,
    router,
    peers: new Map(),
    links: new Map(),
    linkedTo: new Set(),
    ghosts: new Map(),
    idleTimer: null,
    closed: false,
    ownerLeaveTimer: null,
  };
  rooms.set(dbRoom.code, room);
  return room;
}

function listenInfos() {
  return [
    { protocol: 'udp', ip: '0.0.0.0', announcedAddress: config.announcedIp },
    { protocol: 'tcp', ip: '0.0.0.0', announcedAddress: config.announcedIp },
  ];
}

function serializePeer(peer) {
  return {
    id: peer.id,
    userId: peer.userId,
    name: peer.name,
    guest: peer.guest,
    audio: peer.audio,
    video: peer.video,
    hand: peer.hand,
    canPublish: peer.canPublish,
    linked: Boolean(peer.linked),
    departmentId: peer.departmentId || null,
    departmentName: peer.departmentName || '',
  };
}

function serializeLink(info) {
  return {
    producerId: info.pipeProducer.id,
    peerId: info.peerId,
    peerName: info.peerName,
    kind: info.kind,
    source: info.source,
  };
}

function serializeProducer(peer, producer) {
  return {
    producerId: producer.id,
    peerId: peer.id,
    peerName: peer.name,
    kind: producer.kind,
    source: producer.appData.source,
  };
}

function broadcast(room, exceptId, event, data) {
  for (const peer of room.peers.values()) {
    if (peer.id === exceptId) continue;
    peer.socket.emit(event, data);
  }
}

function scheduleIdle(room) {
  clearTimeout(room.idleTimer);
  if (room.peers.size > 0 || room.closed) return;
  room.idleTimer = setTimeout(() => {
    if (room.peers.size === 0 && !room.closed) {
      room.router.close();
      rooms.delete(room.code);
    }
  }, 90_000);
}

function destroyPeer(peer) {
  if (peer.removed) return;
  peer.removed = true;
  for (const producer of peer.producers.values()) {
    try { producer.close(); } catch { /* already closed */ }
  }
  for (const consumer of peer.consumers.values()) {
    try { consumer.close(); } catch { /* already closed */ }
  }
  for (const transport of peer.transports.values()) {
    try { transport.close(); } catch { /* already closed */ }
  }
  peer.producers.clear();
  peer.consumers.clear();
  peer.transports.clear();
}

export function removePeer(socket, { notify = true } = {}) {
  const code = socket.data.roomCode;
  if (!code) return;
  const room = rooms.get(code);
  socket.data.roomCode = null;
  if (!room || room.closed) return;
  const peer = room.peers.get(socket.id);
  if (!peer) return;
  const producers = [...peer.producers.values()];
  room.peers.delete(peer.id);
  destroyPeer(peer);
  if (notify) {
    for (const producer of producers) {
      broadcast(room, null, 'producerClosed', {
        producerId: producer.id,
        peerId: peer.id,
        source: producer.appData.source,
        kind: producer.kind,
      });
    }
    broadcast(room, null, 'peerLeft', { peerId: peer.id });
  }
  const ownerStillHere = [...room.peers.values()].some((item) => item.userId === room.ownerId);
  if (room.type === 'stream' && peer.userId === room.ownerId && !ownerStillHere) {
    clearTimeout(room.hostLeaveTimer);
    const code = room.code;
    room.hostLeaveTimer = setTimeout(() => {
      const current = rooms.get(code);
      if (!current || current.closed) return;
      const still = [...current.peers.values()].some((item) => item.userId === current.ownerId);
      if (!still) finishRoom(current, 'Трансляция завершена');
    }, 20_000);
  }
  scheduleIdle(room);
}

export function finishRoom(roomOrCode, reason = 'Комната завершена') {
  const room = typeof roomOrCode === 'string' ? rooms.get(roomOrCode) : roomOrCode;
  if (!room || room.closed) {
    if (typeof roomOrCode === 'string') return false;
    return false;
  }
  room.closed = true;
  clearTimeout(room.idleTimer);
  clearTimeout(room.ownerLeaveTimer);
  clearTimeout(room.hostLeaveTimer);
  detachLinks(room);
  endRoom(room.dbId);
  for (const peer of [...room.peers.values()]) {
    peer.socket.data.roomCode = null;
    peer.socket.emit('roomClosed', { reason });
    destroyPeer(peer);
  }
  room.peers.clear();
  try { room.router.close(); } catch { /* already closed */ }
  rooms.delete(room.code);
  return true;
}

export function setPublishPermission(code, userId, canPublish) {
  const room = rooms.get(code);
  if (!room) return;
  for (const peer of room.peers.values()) {
    if (peer.userId !== userId) continue;
    peer.canPublish = canPublish;
    peer.socket.emit('publishPermission', { canPublish });
    if (!canPublish) {
      for (const producer of [...peer.producers.values()]) {
        broadcast(room, peer.id, 'producerClosed', {
          producerId: producer.id,
          peerId: peer.id,
          source: producer.appData.source,
          kind: producer.kind,
        });
        producer.close();
        peer.producers.delete(producer.id);
      }
    }
    broadcast(room, null, 'peerState', serializePeer(peer));
  }
}

function findPeer(socket) {
  const room = rooms.get(socket.data.roomCode);
  if (!room) return null;
  const peer = room.peers.get(socket.id);
  if (!peer) return null;
  return { room, peer };
}

export async function rtpCapabilities(dbRoom) {
  const room = await ensureRoom(dbRoom);
  return room.router.rtpCapabilities;
}

export async function joinRoom(socket, dbRoom, { rtpCapabilities: caps, canPublish, displayName }) {
  removePeer(socket);
  const room = await ensureRoom(dbRoom);
  const peer = {
    id: socket.id,
    userId: socket.user.sub,
    name: displayName || socket.user.name,
    guest: Boolean(socket.user.guest),
    socket,
    transports: new Map(),
    producers: new Map(),
    consumers: new Map(),
    rtpCapabilities: caps,
    canPublish,
    audio: true,
    video: true,
    hand: false,
    removed: false,
    departmentId: socket.user.departmentId || null,
    departmentName: socket.user.departmentName || '',
  };
  room.peers.set(peer.id, peer);
  socket.data.roomCode = room.code;
  clearTimeout(room.idleTimer);
  if (peer.userId === room.ownerId) clearTimeout(room.ownerLeaveTimer);
  if (peer.userId === room.ownerId) clearTimeout(room.hostLeaveTimer);
  if (room.peers.size > (dbRoom.peak_peers || 0)) setPeak(room.dbId, room.peers.size);

  const producers = [];
  for (const other of room.peers.values()) {
    if (other.id === peer.id) continue;
    for (const producer of other.producers.values()) producers.push(serializeProducer(other, producer));
  }
  for (const info of room.links.values()) {
    if (!info.pipeProducer.closed) producers.push(serializeLink(info));
  }
  broadcast(room, peer.id, 'peerJoined', serializePeer(peer));
  return {
    peers: [
      ...[...room.peers.values()].filter((item) => item.id !== peer.id).map(serializePeer),
      ...room.ghosts.values(),
    ],
    producers,
    canPublish,
    selfId: peer.id,
  };
}

function grantPublish(found) {
  if (found.peer.canPublish) return true;
  if (found.peer.guest) return false;
  found.peer.canPublish = true;
  if (found.room.dbId && found.peer.userId) setRoomRole(found.room.dbId, found.peer.userId, 'speaker');
  found.peer.socket.emit('publishPermission', { canPublish: true });
  broadcast(found.room, null, 'peerState', serializePeer(found.peer));
  return true;
}

export async function createTransport(socket, direction) {
  const found = findPeer(socket);
  if (!found) throw Object.assign(new Error('Сначала войдите в комнату'), { status: 400 });
  if (direction === 'send' && !grantPublish(found)) {
    throw Object.assign(new Error('В этой трансляции вам нельзя выходить в эфир'), { status: 403 });
  }
  const transport = await found.room.router.createWebRtcTransport({
    listenInfos: listenInfos(),
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: 1_200_000,
  });
  if (direction === 'send') {
    try { await transport.setMaxIncomingBitrate(2_500_000); } catch { /* optional */ }
  }
  found.peer.transports.set(transport.id, transport);
  transport.on('dtlsstatechange', (state) => {
    if (state === 'closed') transport.close();
  });
  transport.on('close', () => found.peer.transports.delete(transport.id));
  return {
    id: transport.id,
    iceParameters: transport.iceParameters,
    iceCandidates: transport.iceCandidates,
    dtlsParameters: transport.dtlsParameters,
    iceServers: iceServers(),
  };
}

export async function connectTransport(socket, transportId, dtlsParameters) {
  const found = findPeer(socket);
  const transport = found?.peer.transports.get(transportId);
  if (!transport) throw Object.assign(new Error('Транспорт не найден'), { status: 404 });
  await transport.connect({ dtlsParameters });
}

const sources = new Set(['mic', 'camera', 'screen', 'screen-audio']);

export async function produce(socket, { transportId, kind, rtpParameters, appData }) {
  const found = findPeer(socket);
  if (!found) throw Object.assign(new Error('Сначала войдите в комнату'), { status: 400 });
  if (!grantPublish(found)) throw Object.assign(new Error('Публикация запрещена'), { status: 403 });
  const source = appData?.source;
  if (!sources.has(source)) throw Object.assign(new Error('Неизвестный источник'), { status: 400 });
  const transport = found.peer.transports.get(transportId);
  if (!transport) throw Object.assign(new Error('Транспорт не найден'), { status: 404 });
  if (found.peer.producers.size >= 4) throw Object.assign(new Error('Слишком много потоков'), { status: 400 });
  const producer = await transport.produce({
    kind,
    rtpParameters,
    appData: { source, peerId: found.peer.id },
  });
  found.peer.producers.set(producer.id, producer);
  producer.on('transportclose', () => found.peer.producers.delete(producer.id));
  broadcast(found.room, found.peer.id, 'newProducer', serializeProducer(found.peer, producer));
  fanOut(found.room, found.peer, producer).catch((error) => console.error('Не удалось передать экран в другую комнату', error));
  return { id: producer.id };
}

export async function consume(socket, { transportId, producerId, rtpCapabilities: caps }) {
  const found = findPeer(socket);
  if (!found) throw Object.assign(new Error('Сначала войдите в комнату'), { status: 400 });
  const transport = found.peer.transports.get(transportId);
  if (!transport) throw Object.assign(new Error('Транспорт не найден'), { status: 404 });
  if (!found.room.router.canConsume({ producerId, rtpCapabilities: caps })) {
    throw Object.assign(new Error('Этот поток нельзя принять'), { status: 400 });
  }
  const consumer = await transport.consume({ producerId, rtpCapabilities: caps, paused: true });
  found.peer.consumers.set(consumer.id, consumer);
  consumer.on('transportclose', () => found.peer.consumers.delete(consumer.id));
  consumer.on('producerclose', () => found.peer.consumers.delete(consumer.id));
  return {
    id: consumer.id,
    producerId,
    kind: consumer.kind,
    rtpParameters: consumer.rtpParameters,
  };
}

export function resumeConsumer(socket, consumerId) {
  const consumer = findPeer(socket)?.peer.consumers.get(consumerId);
  if (consumer) consumer.resume();
}

export function pauseProducer(socket, producerId, paused) {
  const producer = findPeer(socket)?.peer.producers.get(producerId);
  if (!producer) return;
  if (paused) producer.pause();
  else producer.resume();
}

export function closeProducer(socket, producerId) {
  const found = findPeer(socket);
  const producer = found?.peer.producers.get(producerId);
  if (!producer || !found) return;
  found.peer.producers.delete(producer.id);
  const payload = {
    producerId: producer.id,
    peerId: found.peer.id,
    source: producer.appData.source,
    kind: producer.kind,
  };
  producer.close();
  broadcast(found.room, found.peer.id, 'producerClosed', payload);
}

export function setMediaState(socket, state) {
  const found = findPeer(socket);
  if (!found) return;
  if (typeof state.audio === 'boolean') found.peer.audio = state.audio;
  if (typeof state.video === 'boolean') found.peer.video = state.video;
  if (typeof state.hand === 'boolean') found.peer.hand = state.hand;
  broadcast(found.room, null, 'peerState', serializePeer(found.peer));
}

export function kickPeer(socket, peerId) {
  const found = findPeer(socket);
  if (!found) throw Object.assign(new Error('Вы не в комнате'), { status: 400 });
  const actor = socket.user;
  const isOwner = actor.sub === found.room.ownerId;
  if (!isOwner && actor.role !== 'admin') {
    throw Object.assign(new Error('Исключать может ведущий или администратор'), { status: 403 });
  }
  const target = found.room.peers.get(peerId);
  if (!target) throw Object.assign(new Error('Участник уже вышел'), { status: 404 });
  if (target.id === found.peer.id) throw Object.assign(new Error('Нельзя исключить себя'), { status: 400 });
  target.socket.emit('kicked', { reason: 'Вас исключили из комнаты' });
  target.socket.disconnect(true);
  return target;
}

function ensureGhost(target, info) {
  if (target.ghosts.has(info.peerId)) return;
  const ghost = {
    id: info.peerId,
    userId: info.userId || null,
    name: info.peerName,
    departmentId: info.departmentId || null,
    departmentName: info.departmentName || '',
    guest: false,
    audio: false,
    video: true,
    hand: false,
    canPublish: false,
    linked: true,
  };
  target.ghosts.set(info.peerId, ghost);
  broadcast(target, null, 'peerJoined', ghost);
}

function dropLink(target, key) {
  const info = target.links?.get(key);
  if (!info || info.dropping) return;
  info.dropping = true;
  target.links.delete(key);
  try {
    if (!info.pipeProducer.closed) info.pipeProducer.close();
  } catch { /* already closed */ }
  broadcast(target, null, 'producerClosed', {
    producerId: info.pipeProducer.id,
    peerId: info.peerId,
    source: info.source,
    kind: info.kind,
  });
  const still = [...target.links.values()].some((item) => item.peerId === info.peerId);
  if (!still && target.ghosts.has(info.peerId)) {
    target.ghosts.delete(info.peerId);
    broadcast(target, null, 'peerLeft', { peerId: info.peerId });
  }
}

function detachLinks(room) {
  for (const code of [...(room.linkedTo || [])]) {
    const target = rooms.get(code);
    if (!target?.links) continue;
    for (const key of [...target.links.keys()]) {
      if (key.startsWith(`${room.code}:`)) dropLink(target, key);
    }
  }
  for (const key of [...(room.links?.keys() || [])]) dropLink(room, key);
  for (const other of rooms.values()) other.linkedTo?.delete(room.code);
}

async function pipeProducer(source, target, peer, producer) {
  if (producer.kind !== 'video' || producer.closed) return false;
  const key = `${source.code}:${producer.id}`;
  if (target.links.has(key)) return false;
  const { pipeProducer: piped } = await source.router.pipeToRouter({
    producerId: producer.id,
    router: target.router,
    keepId: false,
    enableSctp: false,
  });
  const info = {
    key,
    pipeProducer: piped,
    peerId: `link:${source.code}:${peer.id}`,
    peerName: peer.name,
    userId: peer.userId || null,
    departmentId: peer.departmentId || null,
    departmentName: peer.departmentName || '',
    source: producer.appData?.source || 'screen',
    kind: producer.kind,
    dropping: false,
  };
  target.links.set(key, info);
  const forget = () => dropLink(target, key);
  producer.observer.once('close', forget);
  piped.observer.once('close', forget);
  ensureGhost(target, info);
  broadcast(target, null, 'newProducer', serializeLink(info));
  return true;
}

async function fanOut(source, peer, producer) {
  for (const code of source.linkedTo || []) {
    const target = rooms.get(code);
    if (!target || target.closed) continue;
    try {
      await pipeProducer(source, target, peer, producer);
    } catch (error) {
      console.error('pipe', source.code, code, error);
    }
  }
}

export async function linkRooms(targetDb, sourceDb) {
  if (!targetDb || !sourceDb) throw Object.assign(new Error('Комната не найдена'), { status: 404 });
  if (targetDb.code === sourceDb.code) return 0;
  const target = await ensureRoom(targetDb);
  const source = await ensureRoom(sourceDb);
  if (target.closed || source.closed) throw Object.assign(new Error('Комната уже закрыта'), { status: 400 });
  source.linkedTo.add(target.code);
  let added = 0;
  for (const peer of source.peers.values()) {
    for (const producer of peer.producers.values()) {
      try {
        if (await pipeProducer(source, target, peer, producer)) added += 1;
      } catch (error) {
        console.error('pipe', error);
      }
    }
  }
  return added;
}
