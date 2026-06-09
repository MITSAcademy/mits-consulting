if (getToken()) location.replace('/destinations.html');

const form = document.getElementById('signupForm');
const btn = document.getElementById('submitBtn');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideAlert('alert');
  btn.disabled = true;
  btn.textContent = 'Creating\u2026';
  try {
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const data = await api('/auth/signup', { method: 'POST', auth: false, body: { name, email, password } });
    setAuth(data.token, data.user);
    location.href = '/destinations.html';
  } catch (err) {
    showAlert('alert', err.message);
    btn.disabled = false;
    btn.textContent = 'Create account';
  }
});
