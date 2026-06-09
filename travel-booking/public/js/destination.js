if (requireLogin()) {
  renderHeader('destinations');
  const id = qs('id');

  (async () => {
    const grid = document.getElementById('grid');
    if (!id) { location.href = '/destinations.html'; return; }
    try {
      const { destination, packages } = await api('/destinations/' + encodeURIComponent(id));
      document.getElementById('crumbName').textContent = destination.name;
      document.title = destination.name + ' \u00b7 Wanderlust Travel';

      document.getElementById('hero').innerHTML = `
        <div class="detail-hero">
          <img src="${esc(destination.image)}" alt="${esc(destination.name)}" />
          <div class="overlay">
            <h1>${esc(destination.name)}, ${esc(destination.country)}</h1>
            <div class="meta">${esc(destination.description)}</div>
          </div>
        </div>`;

      if (!packages.length) {
        grid.innerHTML = '<div class="empty">No packages for this destination yet.</div>';
        return;
      }
      grid.innerHTML = packages.map((p) => `
        <a class="card" href="/package.html?id=${encodeURIComponent(p.id)}">
          <img class="thumb" src="${esc(p.image)}" alt="${esc(p.title)}" loading="lazy" />
          <div class="body">
            <h3>${esc(p.title)}</h3>
            <div class="meta">${p.nights} nights / ${p.days} days</div>
            <div class="desc">${esc(p.summary)}</div>
            <div class="foot">
              <span class="pill accent">${p.highlights.length} highlights</span>
              <span class="price">${money(p.price)} <small>/ person</small></span>
            </div>
          </div>
        </a>`).join('');
    } catch (err) {
      grid.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
    }
  })();
}
