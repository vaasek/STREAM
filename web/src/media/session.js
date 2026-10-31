import { Device } from 'mediasoup-client';

function request(socket, event, data = {}, timeout = 12000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Сервер не ответил')), timeout);
    socket.emit(event, data, (response) => {
      clearTimeout(timer);
      if (!response || response.error) reject(new Error(response?.error || 'Нет ответа сервера'));
      else resolve(response);
    });
  });
}

function groupOf(source) {
  return source === 'screen' || source === 'screen-audio' ? 'screen' : 'camera';
}

let audioContext = null;
const remoteAudio = new Map();

function output() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioContext || audioContext.state === 'closed') audioContext = new Ctx();
  return audioContext;
}

export function primeAudio() {
  const ctx = output();
  if (!ctx) return Promise.resolve(false);
  return ctx.resume().then(() => ctx.state === 'running').catch(() => false);
}

if (typeof window !== 'undefined') {
  const kick = () => { audioContext?.resume?.().catch(() => {}); };
  window.addEventListener('pointerdown', kick, true);
  window.addEventListener('keydown', kick, true);
}

function playRemote(track) {
  const ctx = output();
  if (!ctx || remoteAudio.has(track)) return;
  const node = ctx.createMediaStreamSource(new MediaStream([track]));
  node.connect(ctx.destination);
  remoteAudio.set(track, node);
  track.addEventListener('ended', () => stopRemote(track), { once: true });
  ctx.resume().catch(() => {});
}

function stopRemote(track) {
  const node = remoteAudio.get(track);
  if (!node) return;
  try { node.disconnect(); } catch { /* already disconnected */ }
  remoteAudio.delete(track);
}

function stopAllRemote() {
  for (const track of [...remoteAudio.keys()]) stopRemote(track);
}

export function createRoomSession(socket, { roomCode, password, camera = true, onEvent }) {
  let device = null;
  let sendTransport = null;
  let recvTransport = null;
  let closed = false;
  let joining = false;
  let started = false;
  let canPublish = false;
  let micOn = true;
  let camOn = true;
  let hand = false;
  const producers = new Map();
  const tiles = new Map();
  const localStreams = [];

  function emit(type, payload) {
    onEvent(type, payload);
  }

  function publishTiles() {
    emit('tiles', [...tiles.values()].map((tile) => ({ ...tile })));
  }

  function upsertTrack({ key, peerId, peerName, source, track, local }) {
    let tile = tiles.get(key);
    if (!tile) {
      tile = {
        id: key,
        peerId,
        peerName,
        source,
        stream: new MediaStream(),
        hasVideo: false,
        hasAudio: false,
        local,
        rev: 0,
      };
      tiles.set(key, tile);
    }
    tile.peerName = peerName;
    for (const previous of tile.stream.getTracks().filter((item) => item.kind === track.kind)) {
      tile.stream.removeTrack(previous);
    }
    tile.stream.addTrack(track);
    tile.hasVideo = tile.stream.getVideoTracks().length > 0;
    tile.hasAudio = tile.stream.getAudioTracks().length > 0;
    tile.rev += 1;
    publishTiles();
  }

  function removeTrack(key, kind) {
    const tile = tiles.get(key);
    if (!tile) return;
    for (const track of tile.stream.getTracks().filter((item) => item.kind === kind)) {
      tile.stream.removeTrack(track);
      if (kind === 'audio') stopRemote(track);
      if (tile.local) track.stop();
    }
    tile.hasVideo = tile.stream.getVideoTracks().length > 0;
    tile.hasAudio = tile.stream.getAudioTracks().length > 0;
    if (!tile.hasVideo && !tile.hasAudio) tiles.delete(key);
    else tile.rev += 1;
    publishTiles();
  }

  async function makeTransport(direction) {
    const params = await request(socket, 'createTransport', { direction });
    const transport = direction === 'send'
      ? device.createSendTransport(params)
      : device.createRecvTransport(params);
    transport.on('connect', ({ dtlsParameters }, callback, errback) => {
      request(socket, 'connectTransport', { transportId: transport.id, dtlsParameters })
        .then(() => callback())
        .catch(errback);
    });
    transport.on('connectionstatechange', (state) => {
      if (state === 'failed') {
        emit('warning', 'Медиасоединение не установлено. Проверьте IP сервера и UDP-порты.');
      }
    });
    if (direction === 'send') {
      transport.on('produce', ({ kind, rtpParameters, appData }, callback, errback) => {
        request(socket, 'produce', {
          transportId: transport.id,
          kind,
          rtpParameters,
          appData,
        }).then(({ id }) => callback({ id })).catch(errback);
      });
    }
    return transport;
  }

  async function consumeProducer(meta) {
    if (!recvTransport || closed || !device) return;
    const params = await request(socket, 'consume', {
      transportId: recvTransport.id,
      producerId: meta.producerId,
      rtpCapabilities: device.rtpCapabilities,
    });
    const consumer = await recvTransport.consume(params);
    upsertTrack({
      key: `${meta.peerId}:${groupOf(meta.source)}`,
      peerId: meta.peerId,
      peerName: meta.peerName,
      source: groupOf(meta.source),
      track: consumer.track,
      local: false,
    });
    if (consumer.track.kind === 'audio') {
      playRemote(consumer.track);
      const ctx = output();
      emit('sound', ctx?.state === 'running');
    }
    await request(socket, 'resumeConsumer', { consumerId: consumer.id });
  }

  async function produceTrack(track, source) {
    if (!sendTransport || closed) return;
    const previous = producers.get(source);
    if (previous) {
      previous.track?.stop();
      previous.close();
      producers.delete(source);
      await request(socket, 'closeProducer', { producerId: previous.id }).catch(() => {});
    }
    const extra = track.kind === 'video'
      ? { encodings: [{ maxBitrate: source === 'screen' ? 1_500_000 : 900_000 }] }
      : {};
    const producer = await sendTransport.produce({ track, appData: { source }, ...extra });
    producers.set(source, producer);
    producer.on('trackended', () => {
      stopSource(source).catch(() => {});
    });
    upsertTrack({
      key: `local:${groupOf(source)}`,
      peerId: 'local',
      peerName: 'Вы',
      source: groupOf(source),
      track,
      local: true,
    });
    if ((source === 'mic' && !micOn) || (source === 'camera' && !camOn)) {
      track.enabled = false;
      await request(socket, 'pauseProducer', { producerId: producer.id }).catch(() => {});
    }
  }

  async function openSend() {
    if (!canPublish || sendTransport || closed) return;
    sendTransport = await makeTransport('send');
  }

  async function publishLocal() {
    if (!canPublish || closed) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      emit('warning', 'Камера и микрофон в браузере включаются только по HTTPS. Откройте защищённый адрес сервера и подтвердите сертификат.');
      return;
    }
    await openSend();
    if (closed) return;
    const voice = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
    const picture = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } };
    const attempts = camera
      ? [
        { audio: voice, video: picture },
        { audio: voice, video: false },
        { audio: false, video: picture },
      ]
      : [{ audio: voice, video: false }];
    let stream = null;
    let lastError = null;
    for (const constraints of attempts) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!stream) {
      emit('warning', lastError?.name === 'NotAllowedError'
        ? 'Доступ к камере и микрофону запрещён. Можно остаться зрителем.'
        : 'Камера и микрофон недоступны. Можно остаться зрителем.');
      return;
    }
    localStreams.push(stream);
    const audio = stream.getAudioTracks()[0];
    const video = stream.getVideoTracks()[0];
    if (audio) await produceTrack(audio, 'mic');
    if (video) await produceTrack(video, 'camera');
    const devices = await navigator.mediaDevices.enumerateDevices();
    emit('devices', {
      audio: devices.filter((item) => item.kind === 'audioinput'),
      video: devices.filter((item) => item.kind === 'videoinput'),
    });
    socket.emit('mediaState', { audio: micOn, video: camOn, hand });
  }

  async function stopSource(source) {
    const producer = producers.get(source);
    if (!producer) return;
    producers.delete(source);
    try { producer.track?.stop(); } catch { /* already stopped */ }
    try { producer.close(); } catch { /* already closed */ }
    await request(socket, 'closeProducer', { producerId: producer.id }).catch(() => {});
    removeTrack(`local:${groupOf(source)}`, producer.kind);
    if (source === 'screen' || source === 'screen-audio') emit('sharing', producers.has('screen'));
  }

  function dropRemote(peerId) {
    let changed = false;
    for (const key of [...tiles.keys()]) {
      if (key.startsWith(`${peerId}:`)) {
        tiles.delete(key);
        changed = true;
      }
    }
    if (changed) publishTiles();
  }

  async function cleanupMedia() {
    for (const producer of producers.values()) {
      try { producer.track?.stop(); } catch { /* ignore */ }
      try { producer.close(); } catch { /* ignore */ }
    }
    producers.clear();
    try { sendTransport?.close(); } catch { /* ignore */ }
    try { recvTransport?.close(); } catch { /* ignore */ }
    sendTransport = null;
    recvTransport = null;
    device = null;
    tiles.clear();
    stopAllRemote();
    publishTiles();
    for (const stream of localStreams) stream.getTracks().forEach((track) => track.stop());
    localStreams.length = 0;
  }

  async function join() {
    if (closed || joining) return;
    joining = true;
    started = true;
    try {
      const caps = await request(socket, 'rtpCapabilities', { roomCode });
      if (closed) return;
      device = new Device();
      await device.load({ routerRtpCapabilities: caps.rtpCapabilities });
      if (closed) return;
      const joined = await request(socket, 'joinRoom', {
        roomCode,
        password,
        rtpCapabilities: device.rtpCapabilities,
      });
      if (closed) return;
      canPublish = joined.canPublish;
      emit('joined', joined);
      recvTransport = await makeTransport('recv');
      if (closed) return;
      for (const producer of joined.producers) await consumeProducer(producer);
      if (canPublish) {
        try {
          await publishLocal();
        } catch (error) {
          emit('warning', error?.message || 'Камера и микрофон не включились');
        }
      }
    } catch (error) {
      device = null;
      if (!closed) throw error;
    } finally {
      joining = false;
    }
  }

  async function onNewProducer(meta) {
    try {
      await consumeProducer(meta);
    } catch (error) {
      emit('warning', error.message);
    }
  }

  function onProducerClosed({ peerId, source, kind }) {
    if (!peerId || peerId === socket.id) return;
    removeTrack(`${peerId}:${groupOf(source)}`, kind === 'audio' ? 'audio' : 'video');
  }

  async function onConnect() {
    if (!started || closed || joining || !device) return;
    emit('warning', 'Связь восстановлена, подключаем комнату заново');
    await cleanupMedia();
    try {
      await join();
    } catch (error) {
      emit('error', error.message);
    }
  }

  socket.on('newProducer', onNewProducer);
  socket.on('producerClosed', onProducerClosed);
  socket.on('peerJoined', (peer) => emit('peerJoined', peer));
  socket.on('peerLeft', ({ peerId }) => {
    dropRemote(peerId);
    emit('peerLeft', peerId);
  });
  socket.on('peerState', (peer) => emit('peerState', peer));
  socket.on('chat', (message) => emit('chat', message));
  socket.on('kicked', (payload) => emit('kicked', payload));
  socket.on('roomClosed', (payload) => emit('closed', payload));
  socket.on('publishPermission', async ({ canPublish: next }) => {
    canPublish = next;
    emit('canPublish', next);
    if (!next) {
      await stopSource('mic');
      await stopSource('camera');
      await stopSource('screen');
      await stopSource('screen-audio');
      return;
    }
    if (!producers.has('mic') && (!camera || !producers.has('camera'))) await publishLocal();
  });
  socket.on('connect', onConnect);
  socket.on('disconnect', () => {
    if (!closed) emit('warning', 'Нет связи с сервером');
  });

  return {
    join,
    async leave() {
      closed = true;
      socket.off('newProducer', onNewProducer);
      socket.off('producerClosed', onProducerClosed);
      socket.off('connect', onConnect);
      await cleanupMedia();
      if (socket.connected) await request(socket, 'leaveRoom', {}).catch(() => {});
    },
    async setMic(on) {
      micOn = on;
      const producer = producers.get('mic');
      if (producer?.track) producer.track.enabled = on;
      if (producer) await request(socket, on ? 'resumeProducer' : 'pauseProducer', { producerId: producer.id }).catch(() => {});
      socket.emit('mediaState', { audio: micOn, video: camOn, hand });
    },
    async setCam(on) {
      camOn = on;
      const producer = producers.get('camera');
      if (producer?.track) producer.track.enabled = on;
      if (producer) await request(socket, on ? 'resumeProducer' : 'pauseProducer', { producerId: producer.id }).catch(() => {});
      socket.emit('mediaState', { audio: micOn, video: camOn, hand });
    },
    async listDevices() {
      if (!window.isSecureContext || !navigator.mediaDevices?.enumerateDevices) {
        emit('devices', { audio: [], video: [] });
        emit('warning', 'Список камер и микрофонов пуст, пока страница открыта по HTTP. Откройте HTTPS-адрес сервера.');
        return { audio: [], video: [] };
      }
      let found = await navigator.mediaDevices.enumerateDevices();
      const inputs = found.filter((item) => item.kind === 'audioinput' || item.kind === 'videoinput');
      if (inputs.length === 0 || inputs.every((item) => !item.label)) {
        try {
          const probe = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
          probe.getTracks().forEach((track) => track.stop());
          found = await navigator.mediaDevices.enumerateDevices();
        } catch { /* нет разрешения или устройства */ }
      }
      const audio = found.filter((item) => item.kind === 'audioinput');
      const video = found.filter((item) => item.kind === 'videoinput');
      emit('devices', { audio, video });
      return { audio, video };
    },
    async shareScreen() {
      if (!canPublish) return;
      if (!navigator.mediaDevices?.getDisplayMedia) {
        throw new Error('Показ экрана в браузере доступен по HTTPS. Откройте защищённый адрес сервера.');
      }
      await openSend();
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      localStreams.push(stream);
      const video = stream.getVideoTracks()[0];
      const audio = stream.getAudioTracks()[0];
      if (video) {
        video.addEventListener('ended', () => {
          stopSource('screen').catch(() => {});
          stopSource('screen-audio').catch(() => {});
        });
        await produceTrack(video, 'screen');
      }
      if (audio) await produceTrack(audio, 'screen-audio');
    },
    stopShare() {
      return Promise.all([stopSource('screen'), stopSource('screen-audio')]);
    },
    isSharing() {
      return producers.has('screen');
    },
    toggleHand() {
      hand = !hand;
      socket.emit('mediaState', { audio: micOn, video: camOn, hand });
      return hand;
    },
    async setAudioDevice(deviceId) {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId } },
        video: false,
      });
      localStreams.push(stream);
      const track = stream.getAudioTracks()[0];
      if (!micOn) track.enabled = false;
      const producer = producers.get('mic');
      if (producer) {
        const old = producer.track;
        await producer.replaceTrack({ track });
        old?.stop();
        upsertTrack({ key: 'local:camera', peerId: 'local', peerName: 'Вы', source: 'camera', track, local: true });
      } else {
        await openSend();
        await produceTrack(track, 'mic');
      }
    },
    async setVideoDevice(deviceId) {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      localStreams.push(stream);
      const track = stream.getVideoTracks()[0];
      if (!camOn) track.enabled = false;
      const producer = producers.get('camera');
      if (producer) {
        const old = producer.track;
        await producer.replaceTrack({ track });
        old?.stop();
        upsertTrack({ key: 'local:camera', peerId: 'local', peerName: 'Вы', source: 'camera', track, local: true });
      } else {
        await openSend();
        await produceTrack(track, 'camera');
      }
    },
    sendChat(body) {
      return request(socket, 'chat', { body });
    },
    kick(peerId) {
      return request(socket, 'kick', { peerId });
    },
  };
}
