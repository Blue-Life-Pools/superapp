const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();

if (!configuredApiUrl) {
  throw new Error('VITE_API_URL is not configured. Add it to the frontend .env file.');
}

const absoluteApiUrl = /^https?:\/\//i.test(configuredApiUrl)
  ? configuredApiUrl
  : `https://${configuredApiUrl}`;

let parsedApiUrl: URL;

try {
  parsedApiUrl = new URL(absoluteApiUrl);
} catch {
  throw new Error('VITE_API_URL must be a valid absolute backend URL.');
}

export const API_URL = parsedApiUrl.toString().replace(/\/+$/, '');

const appTokenKey = 'bluelife-app-token';

export function getAppToken() {
  try {
    return window.localStorage.getItem(appTokenKey) ?? '';
  } catch {
    return '';
  }
}

export function setAppToken(token: string) {
  try {
    if (token) window.localStorage.setItem(appTokenKey, token);
    else window.localStorage.removeItem(appTokenKey);
  } catch {
    // Authentication still works for the current request when storage is unavailable.
  }
}

export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const token = getAppToken();
  const url = typeof input === 'string' ? input : input.toString();
  if (token && url.startsWith(API_URL) && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers });
}
