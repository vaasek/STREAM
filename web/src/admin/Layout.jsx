import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

const links = [
  ['/admin', 'Обзор'],
  ['/admin/users', 'Пользователи'],
  ['/admin/rooms', 'Комнаты'],
  ['/admin/streams', 'Трансляции'],
  ['/admin/settings', 'Настройки'],
  ['/admin/audit', 'Журнал'],
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  return (
    <div className="admin">
      <aside className="admin-nav">
        <div className="brand">
          <span className="mark small" aria-hidden="true" />
          <strong>Админка</strong>
        </div>
        <nav>
          {links.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/admin'}>{label}</NavLink>
          ))}
        </nav>
        <div className="admin-foot">
          <span>{user.name}</span>
          <NavLink to="/app">К встречам</NavLink>
          <button type="button" onClick={logout}>Выйти</button>
        </div>
      </aside>
      <section className="admin-main">
        <Outlet />
      </section>
    </div>
  );
}
