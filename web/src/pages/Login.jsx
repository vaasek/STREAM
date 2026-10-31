import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { Boot, Field } from '../ui.jsx';

export default function Login() {
  const { user, ready, login, register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next');
  const [mode, setMode] = useState('login');
  const [publicInfo, setPublicInfo] = useState(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [streams, setStreams] = useState([]);

  useEffect(() => {
    fetch('/api/public').then((res) => res.json()).then(setPublicInfo).catch(() => {
      setPublicInfo({ serverName: 'Streamon', allowRegistration: true, welcomeText: '' });
    });
    fetch('/api/streams').then((res) => res.json()).then((data) => setStreams(data.streams || [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    if (user.guest && user.roomCode) navigate(`/r/${user.roomCode}`, { replace: true });
    else if (next && next.startsWith('/') && !next.startsWith('//')) navigate(next, { replace: true });
    else navigate('/app', { replace: true });
  }, [user, navigate, next]);

  if (!ready || user) return <Boot />;

  async function submit(event) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register(name, email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const serverName = publicInfo?.serverName || 'Streamon';

  return (
    <main className="login">
      <section className="login-brand">
        <div className="signal" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <h1>{serverName}</h1>
        {publicInfo?.welcomeText ? <p className="lead">{publicInfo.welcomeText}</p> : null}
      </section>
      <section className="login-panel">
        <form className="card" onSubmit={submit}>
          <div className="switch" role="tablist">
            <button type="button" className={mode === 'login' ? 'on' : ''} onClick={() => setMode('login')}>Вход</button>
            {publicInfo?.allowRegistration !== false && (
              <button type="button" className={mode === 'register' ? 'on' : ''} onClick={() => setMode('register')}>Регистрация</button>
            )}
          </div>
          <h2>{mode === 'login' ? 'Войти на сервер' : 'Создать учётную запись'}</h2>
          {mode === 'register' && (
            <Field label="Имя">
              <input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={60} autoComplete="name" />
            </Field>
          )}
          <Field label="Почта">
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="username" />
          </Field>
          <Field label="Пароль">
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </Field>
          {error && <p className="form-error">{error}</p>}
          <button className="btn primary wide" type="submit" disabled={busy}>
            {busy ? 'Подождите…' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
          </button>
          {streams.length > 0 && (
            <div className="stack">
              <p className="hint">Сейчас в эфире</p>
              {streams.map((stream) => (
                <Link key={stream.code} className="text-link" to={`/r/${stream.code}`}>{stream.title}</Link>
              ))}
            </div>
          )}
        </form>
      </section>
    </main>
  );
}
