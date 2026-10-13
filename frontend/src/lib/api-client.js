const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

function csrfToken() {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.split('; ').find((item) => item.startsWith('sd_csrf='));
  if (!match) return null;
  try { return decodeURIComponent(match.slice('sd_csrf='.length)); } catch { return null; }
}

async function request(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && !path.startsWith('/auth/login') && !path.startsWith('/integrations/deals')) {
    const token = csrfToken();
    if (token) headers.set('X-CSRF-Token', token);
  }

  const response = await fetch(`${BASE_URL}${path}`, { ...options, method, headers, credentials: 'include' });
  if (response.status === 401 && typeof window !== 'undefined') window.dispatchEvent(new Event('auth:unauthorized'));
  if (!response.ok) {
    let message = `Ошибка запроса (${response.status})`;
    try {
      const body = await response.json();
      if (body?.error) message = body.error;
    } catch { /* non-JSON */ }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  if (response.status === 204) return null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return response.json();
  return response.blob();
}

function toQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, value);
  });
  const query = search.toString();
  return query ? `?${query}` : '';
}

export const api = {
  get: (path, params) => request(`${path}${toQuery(params)}`),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path) => request(path, { method: 'DELETE' }),
  downloadUrl: (path, params) => `${BASE_URL}${path}${toQuery(params)}`
};

export { toQuery };
