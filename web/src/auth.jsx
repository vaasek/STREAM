import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from './api.js';
import { useToast } from './ui.jsx';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const toast = useToast();
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const onLogout = () => {
      setUser(null);
      toast?.push('Сессия завершена', 'warn');
    };
    window.addEventListener('streamon:logout', onLogout);
    return () => window.removeEventListener('streamon:logout', onLogout);
  }, [toast]);

  useEffect(() => {
    if (!getToken()) {
      setReady(true);
      return;
    }
    api('/api/auth/me')
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);

  const value = useMemo(() => ({
    user,
    ready,
    token: getToken(),
    async login(email, password) {
      const data = await api('/api/auth/login', { method: 'POST', body: { email, password } });
      setToken(data.token);
      setUser(data.user);
      return data.user;
    },
    async register(name, email, password) {
      const data = await api('/api/auth/register', { method: 'POST', body: { name, email, password } });
      setToken(data.token);
      setUser(data.user);
      return data.user;
    },
    async guest(name, roomCode) {
      const data = await api('/api/auth/guest', { method: 'POST', body: { name, roomCode } });
      setToken(data.token);
      setUser(data.user);
      return data.user;
    },
    async updateProfile(body) {
      const data = await api('/api/auth/profile', { method: 'PATCH', body });
      setToken(data.token);
      setUser(data.user);
      return data.user;
    },
    logout() {
      setToken(null);
      setUser(null);
    },
  }), [user, ready]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
