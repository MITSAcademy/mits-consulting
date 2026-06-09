if (requireLogin()) {
  renderHeader('destinations');
  const user = getUser();
  if (user) document.getElementById('greeting').textContent = `Where to next, ${user.name.split(' ')[0]}?`;

  (async () => {
    const grid = document.getElementById('grid');
    try {
      const { destinations } = await api('/destinations');
      if (!destinations.length) {
        grid.innerHTML = '<div class="empty">No destinations available yet.</div>';
        return;
      }
      grid.innerHTML = destinations.map((d) => `
        <a class="card" href="/destination.html?id=${encodeURIComponent(d.id)}">
          <img class="thumb" src="${esc(d.image)}" alt="${esc(d.name)}" loading="lazy" />
          <div class="body">
            <h3>${esc(d.name)}</h3>
            <div class="meta">${esc(d.country)} &middot; ${esc(d.tagline)}</div>
            <div class="desc">${esc(d.description)}</div>
            <div class="foot">
              <span class="pill">${d.packageCount} package${d.packageCount === 1 ? '' : 's'}</span>
              <span class="price">${money(d.fromPrice)} <small>/ from</small></span>
            </div>
          </div>
        </a>`).join('');
    } catch (err) {
      grid.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
    }
  })();
}
