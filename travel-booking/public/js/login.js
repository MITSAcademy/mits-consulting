// If already logged in, skip straight to destinations.
if (getToken()) location.replace('/destinations.html');

const form = document.getElementById('loginForm');
const btn = document.getElementById('submitBtn');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlert('alert');
  btn.disabled = true;
  btn.textContent = 'Logging in\u2026';
  try {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const data = await api('/auth/login', { method: 'POST', auth: false, body: { email, password } });
    setAuth(data.token, data.user);
    location.href = '/destinations.html';
  } catch (err) {
    showAlert('alert', err.message);
    btn.disabled = false;
    btn.textContent = 'Log in';
  }
});
