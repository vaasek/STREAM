const byUser = new Map();

export function markOnline(userId, socket) {
  let set = byUser.get(userId);
  const fresh = !set || set.size === 0;
  if (!set) {
    set = new Set();
    byUser.set(userId, set);
  }
  set.add(socket);
  return fresh;
}

export function markOffline(userId, socket) {
  const set = byUser.get(userId);
  if (!set) return false;
  set.delete(socket);
  if (set.size === 0) {
    byUser.delete(userId);
    return true;
  }
  return false;
}

export function socketsOf(userId) {
  return [...(byUser.get(userId) || [])];
}

export function onlineIds() {
  return [...byUser.keys()];
}

export function onlineCount() {
  return byUser.size;
}

export function dropUser(userId) {
  for (const socket of socketsOf(userId)) socket.disconnect(true);
}
