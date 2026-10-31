const KEY = 'streamon_token';
let memory = localStorage.getItem(KEY);

export function getToken() {
  return memory;
}

export function setToken(value) {
  memory = value || null;
  if (memory) localStorage.setItem(KEY, memory);
  else localStorage.removeItem(KEY);
}

export async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  const token = memory;
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Сервер недоступен');
  }
  const data = await response.json().catch(() => ({}));
  if (
    response.status === 401
    && token
    && !path.startsWith('/api/auth/login')
    && !path.startsWith('/api/auth/register')
    && !path.startsWith('/api/auth/guest')
  ) {
    setToken(null);
    window.dispatchEvent(new Event('streamon:logout'));
  }
  if (!response.ok) throw new Error(data.error || 'Ошибка запроса');
  return data;
}

export function roomTypeLabel(type) {
  if (type === 'stream') return 'Трансляция';
  if (type === 'wall') return 'Стена экранов';
  return 'Конференция';
}

export function plural(n, one, few, many) {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return few;
  return many;
}

export function formatClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

export function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase() || '?';
}

export function groupByDepartment(items, nameOf = (item) => item.departmentName) {
  const groups = new Map();
  for (const item of items) {
    const name = nameOf(item) || 'Без подразделения';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(item);
  }
  return [...groups.entries()].sort((left, right) => {
    if (left[0] === 'Без подразделения') return 1;
    if (right[0] === 'Без подразделения') return -1;
    return left[0].localeCompare(right[0], 'ru');
  });
}

export function matchesDepartmentPick(pick, person) {
  const list = Array.isArray(pick) ? pick : (pick ? [pick] : []);
  if (list.length === 0) return true;
  if (!person) return false;
  return list.some((item) => {
    if (item === 'dept:__none') return !person.departmentId;
    if (typeof item === 'string' && item.startsWith('dept:')) return person.departmentId === item.slice(5);
    if (typeof item === 'string' && item.startsWith('user:')) {
      const wanted = item.slice(5);
      return person.userId === wanted || person.id === wanted;
    }
    return person.userId === item || person.id === item;
  });
}

export function hue(name = '') {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % 360;
}
