import { Platform } from 'react-native';
import { tokenStore } from './tokenStore';

// For Android emulator: 10.0.2.2 maps to your machine's localhost
// For iOS simulator:    localhost works fine
// For physical device:  set EXPO_PUBLIC_API_URL to your machine's LAN IP
//   e.g. EXPO_PUBLIC_API_URL=http://192.168.1.100:8002/api/v1
// 8002 is the backend dev port (backend/.env, docker-compose, Makefile all agree).
export const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === 'android'
    ? 'http://10.0.2.2:8002/api/v1'
    : 'http://localhost:8002/api/v1');

// Without this, an unreachable backend (spun-down host that completes the TLS
// handshake and then never answers) leaves every screen spinning until RN's
// own socket timeout — minutes on Android. Fail fast with a real message.
const REQUEST_TIMEOUT_MS = 15000;

let isRefreshing = false;
let waitQueue = [];

function flushQueue(err, token) {
  waitQueue.forEach((cb) => cb(err, token));
  waitQueue = [];
}

async function doRefresh() {
  const { refreshToken } = tokenStore.get();
  if (!refreshToken) throw new Error('No refresh token');
  // Via rawFetch so the refresh call gets the same timeout as everything else.
  const res = await rawFetch('POST', '/auth/refresh-token', { refreshToken }, {
    'Content-Type': 'application/json',
    'X-Client': 'mobile',
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.message || 'Token refresh failed');
  const { accessToken, refreshToken: newRefresh } = json.data;
  await tokenStore.set(accessToken, newRefresh);
  return accessToken;
}

async function rawFetch(method, path, body, headers) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function request(method, path, body, opts = {}) {
  const { skipAuth = false, tempToken = null } = opts;
  const { accessToken } = tokenStore.get();

  // X-Client tags every request so the backend API-Log viewer buckets this
  // traffic under the "Mobile" section (the web admin sends 'web').
  const headers = { 'Content-Type': 'application/json', 'X-Client': 'mobile' };
  if (tempToken) {
    headers.Authorization = `Bearer ${tempToken}`;
  } else if (!skipAuth && accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  let res;
  try {
    res = await rawFetch(method, path, body, headers);
  } catch (networkErr) {
    throw new Error('App is down. Please try again later.');
  }

  if (res.status === 401 && !skipAuth && !tempToken) {
    if (isRefreshing) {
      const newToken = await new Promise((resolve, reject) => {
        waitQueue.push((err, tok) => (err ? reject(err) : resolve(tok)));
      });
      headers.Authorization = `Bearer ${newToken}`;
      try {
        res = await rawFetch(method, path, body, headers);
      } catch {
        throw new Error('App is down. Please try again later.');
      }
    } else {
      isRefreshing = true;
      let newToken;
      try {
        newToken = await doRefresh();
        flushQueue(null, newToken);
      } catch (err) {
        flushQueue(err, null);
        isRefreshing = false;
        throw err;
      }
      isRefreshing = false;
      headers.Authorization = `Bearer ${newToken}`;
      try {
        res = await rawFetch(method, path, body, headers);
      } catch {
        throw new Error('App is down. Please try again later.');
      }
    }
  }

  const json = await res.json();
  if (!res.ok) throw new Error(json.message || `Request failed (${res.status})`);
  return json;
}

export const api = {
  get: (path, opts) => request('GET', path, undefined, opts),
  post: (path, body, opts) => request('POST', path, body, opts),
  put: (path, body, opts) => request('PUT', path, body, opts),
  patch: (path, body, opts) => request('PATCH', path, body, opts),
  del: (path, opts) => request('DELETE', path, undefined, opts),
};
