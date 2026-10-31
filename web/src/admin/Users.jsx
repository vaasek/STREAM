import { useEffect, useMemo, useState } from 'react';
import { api, groupByDepartment, matchesDepartmentPick } from '../api.js';
import { DepartmentSelect, Field, Modal, useToast } from '../ui.jsx';

export default function Users() {
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [query, setQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState([]);
  const [deptName, setDeptName] = useState('');
  const [creating, setCreating] = useState(false);
  const [resetId, setResetId] = useState(null);
  const [password, setPassword] = useState('');

  async function load() {
    const data = await api('/api/admin/users');
    setUsers(data.users);
    setDepartments(data.departments || []);
  }

  useEffect(() => {
    load().catch((error) => toast.push(error.message, 'warn'));
  }, [toast]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return users.filter((user) => {
      if (!matchesDepartmentPick(deptFilter, user)) return false;
      if (!needle) return true;
      return user.name.toLowerCase().includes(needle) || user.email.toLowerCase().includes(needle) || (user.departmentName || '').toLowerCase().includes(needle);
    });
  }, [users, query, deptFilter]);
  const groups = groupByDepartment(visible);

  async function act(path, options, ok) {
    try {
      await api(path, options);
      toast.push(ok);
      await load();
    } catch (error) {
      toast.push(error.message, 'warn');
    }
  }

  return (
    <div className="stack wide">
      <header className="page-head">
        <div>
          <p className="eyebrow">Доступ</p>
          <h1>Пользователи</h1>
        </div>
        <button type="button" className="btn primary" onClick={() => setCreating(true)}>Новый</button>
      </header>
      <section className="dept-box">
        <h2>Подразделения</h2>
        <form className="dept-add" onSubmit={async (event) => {
          event.preventDefault();
          const name = deptName.trim();
          if (name.length < 2) return;
          try {
            await api('/api/admin/departments', { method: 'POST', body: { name } });
            setDeptName('');
            toast.push('Подразделение создано');
            await load();
          } catch (error) {
            toast.push(error.message, 'warn');
          }
        }}>
          <input value={deptName} onChange={(event) => setDeptName(event.target.value)} placeholder="Название подразделения" maxLength={60} />
          <button className="btn primary" type="submit">Добавить</button>
        </form>
        {departments.length === 0 && <p className="empty">Подразделений пока нет.</p>}
        <ul className="dept-list">
          {departments.map((item) => (
            <li key={item.id}>
              <span>{item.name}</span>
              <button type="button" className="btn tiny danger" onClick={() => {
                if (window.confirm(`Удалить подразделение «${item.name}»? Пользователи останутся без него.`)) {
                  act(`/api/admin/departments/${item.id}`, { method: 'DELETE' }, 'Подразделение удалено');
                }
              }}>Удалить</button>
            </li>
          ))}
        </ul>
      </section>
      <div className="filter-row">
        <input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по имени, почте или подразделению" />
        <DepartmentSelect value={deptFilter} onChange={setDeptFilter} people={users} />
      </div>
      {groups.length === 0 && <p className="empty">Никого не нашлось.</p>}
      {groups.map(([name, list]) => (
      <section key={name} className="dept-group">
        <h3>{name}</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Имя</th>
              <th>Почта</th>
              <th>Подразделение</th>
              <th>Роль</th>
              <th>Статус</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map((user) => (
              <tr key={user.id}>
                <td>{user.name} {user.online && <span className="badge live">в сети</span>}</td>
                <td>{user.email}</td>
                <td>
                  <select
                    className="user-dept"
                    value={user.departmentId || ''}
                    aria-label={`Подразделение ${user.name}`}
                    onChange={(event) => act(`/api/admin/users/${user.id}`, {
                      method: 'PATCH',
                      body: { departmentId: event.target.value || null },
                    }, 'Подразделение обновлено')}
                  >
                    <option value="">Без подразделения</option>
                    {departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </td>
                <td>{user.role === 'admin' ? 'Администратор' : 'Пользователь'}</td>
                <td>{user.status === 'active' ? 'Активен' : 'Отключён'}</td>
                <td className="actions">
                  <button type="button" className="btn tiny" onClick={() => act(`/api/admin/users/${user.id}`, { method: 'PATCH', body: { role: user.role === 'admin' ? 'user' : 'admin' } }, 'Роль обновлена')}>
                    {user.role === 'admin' ? 'Снять админа' : 'Сделать админом'}
                  </button>
                  <button type="button" className="btn tiny" onClick={() => act(`/api/admin/users/${user.id}`, { method: 'PATCH', body: { status: user.status === 'active' ? 'disabled' : 'active' } }, 'Статус обновлён')}>
                    {user.status === 'active' ? 'Отключить' : 'Включить'}
                  </button>
                  <button type="button" className="btn tiny" onClick={() => { setResetId(user.id); setPassword(''); }}>Пароль</button>
                  <button type="button" className="btn tiny danger" onClick={() => {
                    if (window.confirm(`Удалить ${user.name}?`)) act(`/api/admin/users/${user.id}`, { method: 'DELETE' }, 'Пользователь удалён');
                  }}>Удалить</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </section>
      ))}
      {creating && (
        <Modal title="Новый пользователь" onClose={() => setCreating(false)}>
          <form className="stack" onSubmit={async (event) => {
            event.preventDefault();
            const form = new FormData(event.target);
            try {
              await api('/api/admin/users', {
                method: 'POST',
                body: {
                  name: form.get('name'),
                  email: form.get('email'),
                  password: form.get('password'),
                  role: form.get('role'),
                  departmentId: form.get('departmentId') || null,
                },
              });
              setCreating(false);
              toast.push('Пользователь создан');
              await load();
            } catch (error) {
              toast.push(error.message, 'warn');
            }
          }}>
            <Field label="Имя"><input name="name" required minLength={2} /></Field>
            <Field label="Почта"><input name="email" type="email" required /></Field>
            <Field label="Пароль"><input name="password" type="text" required minLength={8} /></Field>
            <Field label="Роль">
              <select name="role" defaultValue="user">
                <option value="user">Пользователь</option>
                <option value="admin">Администратор</option>
              </select>
            </Field>
            <Field label="Подразделение">
              <select name="departmentId" defaultValue="">
                <option value="">Без подразделения</option>
                {departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </Field>
            <button className="btn primary" type="submit">Создать</button>
          </form>
        </Modal>
      )}
      {resetId && (
        <Modal title="Новый пароль" onClose={() => setResetId(null)}>
          <form className="stack" onSubmit={async (event) => {
            event.preventDefault();
            await act(`/api/admin/users/${resetId}`, { method: 'PATCH', body: { password } }, 'Пароль обновлён');
            setResetId(null);
          }}>
            <Field label="Пароль не короче 8 символов">
              <input value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} />
            </Field>
            <button className="btn primary" type="submit">Сохранить</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
