import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { getToken } from './api.js';
import { useAuth } from './auth.jsx';

const RealtimeContext = createContext(null);

export function RealtimeProvider({ children }) {
  const { user, token } = useAuth();
  const [socket, setSocket] = useState(null);
  const [online, setOnline] = useState([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const current = getToken();
    if (!current || !user) {
      setSocket(null);
      setOnline([]);
      setConnected(false);
      return undefined;
    }
    const next = io({
      auth: { token: current },
      autoConnect: true,
      reconnection: true,
    });
    const onSnap = (ids) => setOnline(ids);
    const onUpdate = ({ userId, online: isOn }) => {
      setOnline((prev) => {
        const set = new Set(prev);
        if (isOn) set.add(userId);
        else set.delete(userId);
        return [...set];
      });
    };
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    next.on('presence:snapshot', onSnap);
    next.on('presence:update', onUpdate);
    next.on('connect', onConnect);
    next.on('disconnect', onDisconnect);
    setSocket(next);
    return () => {
      next.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [token, user?.id, Boolean(user)]);

  const value = useMemo(
    () => ({ socket, online, connected }),
    [socket, online, connected],
  );
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime() {
  return useContext(RealtimeContext);
}
