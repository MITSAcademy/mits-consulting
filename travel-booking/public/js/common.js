// Shared helpers loaded on every page.
const TOKEN_KEY = 'wl_token';
const USER_KEY = 'wl_user';

function getToken() { return localStorage.getItem(TOKEN_KEY); }
function setAuth(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
function getUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch (e) { return null; }
}
function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

// Fetch wrapper with auth + JSON handling.
async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && getToken()) headers.Authorization = 'Bearer ' + getToken();
  const res = await fetch('/api' + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch (e) { /* no body */ }
  if (res.status === 401) {
    // token invalid/expired -> bounce to login
    clearAuth();
    if (!location.pathname.includes('login') && !location.pathname.includes('signup')) {
      location.href = '/login.html';
    }
  }
  if (!res.ok) {
    throw new Error((data && data.error) || 'Something went wrong. Please try again.');
  }
  return data;
}

// Redirect to login if not authenticated. Call at the top of protected pages.
function requireLogin() {
  if (!getToken()) {
    location.href = '/login.html';
    return false;
  }
  return true;
}

function initials(name) {
  return (name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

function money(n) {
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function money2(n) {
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}
function qs(key) { return new URLSearchParams(location.search).get(key); }
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Renders the top navigation bar into <header id="header"></header>.
function renderHeader(active) {
  const el = document.getElementById('header');
  if (!el) return;
  const user = getUser();
  el.className = 'site-header';
  el.innerHTML = `
    <div class="container bar">
      <a class="logo" href="/destinations.html"><span class="mark">\u2708\uFE0F</span> Wanderlust</a>
      <nav class="nav">
        <a href="/destinations.html" class="${active === 'destinations' ? 'active' : ''}">Destinations</a>
        <a href="/profile.html" class="${active === 'profile' ? 'active' : ''}">My Bookings</a>
        <a href="#" id="logoutLink">Logout</a>
        <a href="/profile.html" class="avatar" title="${esc(user ? user.name : '')}">${initials(user ? user.name : '')}</a>
      </nav>
    </div>`;
  const logout = document.getElementById('logoutLink');
  if (logout) logout.addEventListener('click', (e) => { e.preventDefault(); clearAuth(); location.href = '/login.html'; });
}

function showAlert(id, message, type = 'error') {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  el.className = 'alert show ' + type;
}
function hideAlert(id) {
  const el = document.getElementById(id);
  if (el) el.className = 'alert';
}
