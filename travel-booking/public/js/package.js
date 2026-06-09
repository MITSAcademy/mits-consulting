if (requireLogin()) {
  renderHeader('destinations');
  const id = qs('id');
  let PKG = null;

  function todayPlus(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }

  function recalc() {
    const t = Math.max(1, parseInt(document.getElementById('travelers').value, 10) || 1);
    document.getElementById('sumPer').textContent = money2(PKG.price);
    document.getElementById('sumQty').textContent = '\u00d7 ' + t;
    document.getElementById('sumTotal').textContent = money2(PKG.price * t);
  }

  (async () => {
    const content = document.getElementById('content');
    if (!id) { location.href = '/destinations.html'; return; }
    try {
      const { package: pkg, destination } = await api('/packages/' + encodeURIComponent(id));
      PKG = pkg;
      document.title = pkg.title + ' \u00b7 Wanderlust Travel';
      document.getElementById('crumbPkg').textContent = pkg.title;
      const destLink = document.getElementById('crumbDest');
      destLink.textContent = destination ? destination.name : 'Destination';
      destLink.href = destination ? '/destination.html?id=' + encodeURIComponent(destination.id) : '#';

      document.getElementById('hero').innerHTML = `
        <div class="detail-hero">
          <img src="${esc(pkg.image)}" alt="${esc(pkg.title)}" />
          <div class="overlay">
            <h1>${esc(pkg.title)}</h1>
            <div class="meta">${destination ? esc(destination.name) + ', ' + esc(destination.country) + ' &middot; ' : ''}${pkg.nights} nights / ${pkg.days} days</div>
          </div>
        </div>`;

      const itinerary = pkg.itinerary.map((s) => `
        <li data-day="${s.day}">
          <h4>${esc(s.title)}</h4>
          <p>${esc(s.details)}</p>
        </li>`).join('');

      const highlights = pkg.highlights.map((h) => `<li>${esc(h)}</li>`).join('');

      content.innerHTML = `
        <div class="split">
          <div>
            <div class="panel" style="margin-bottom:24px;">
              <h2>Overview</h2>
              <p style="color:#475569;margin:0 0 16px;">${esc(pkg.summary)}</p>
              <h2 style="font-size:18px;">What's included</h2>
              <ul class="highlights">${highlights}</ul>
            </div>
            <div class="panel">
              <h2>Day-by-day itinerary</h2>
              <ul class="timeline">${itinerary}</ul>
            </div>
          </div>
          <aside>
            <div class="panel summary">
              <h2>Book this trip</h2>
              <div class="field">
                <label for="travelers">Travellers</label>
                <input type="number" id="travelers" min="1" max="20" value="2" />
              </div>
              <div class="field">
                <label for="travelDate">Travel date</label>
                <input type="date" id="travelDate" min="${todayPlus(1)}" value="${todayPlus(21)}" />
              </div>
              <div class="line"><span>Price per person</span><span id="sumPer"></span></div>
              <div class="line"><span>Travellers</span><span id="sumQty"></span></div>
              <div class="line total"><span>Total</span><span id="sumTotal"></span></div>
              <button class="btn accent block lg" id="bookBtn" style="margin-top:16px;">Continue to payment</button>
              <p style="font-size:13px;color:#64748b;text-align:center;margin:10px 0 0;">You won't be charged \u2014 this is a demo.</p>
            </div>
          </aside>
        </div>`;

      document.getElementById('travelers').addEventListener('input', recalc);
      recalc();

      document.getElementById('bookBtn').addEventListener('click', () => {
        const travelers = Math.max(1, parseInt(document.getElementById('travelers').value, 10) || 1);
        const date = document.getElementById('travelDate').value;
        if (!date) { alert('Please choose a travel date.'); return; }
        const params = new URLSearchParams({ package: pkg.id, travelers: String(travelers), date });
        location.href = '/checkout.html?' + params.toString();
      });
    } catch (err) {
      content.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
    }
  })();
}
