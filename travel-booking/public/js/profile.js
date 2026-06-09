if (requireLogin()) {
  renderHeader('profile');

  function row(b) {
    const statusPill = b.status === 'upcoming'
      ? '<span class="pill">Upcoming</span>'
      : '<span class="pill gray">Completed</span>';
    const img = (b.package && b.package.image) || (b.destination && b.destination.image) || '';
    return `
      <div class="booking-row">
        <img src="${esc(img)}" alt="" loading="lazy" />
        <div class="info">
          <h4>${esc(b.packageTitle)} ${statusPill}</h4>
          <div class="muted">${esc(b.destinationName)} &middot; ${b.travelers} traveller${b.travelers === 1 ? '' : 's'} &middot; ${fmtDate(b.travelDate)}</div>
          <div class="muted">Ref ${esc(b.reference)} &middot; ${money2(b.total)} paid</div>
        </div>
        <a class="btn ghost" href="/receipt.html?booking=${encodeURIComponent(b.id)}">Receipt</a>
      </div>`;
  }

  (async () => {
    const user = getUser();
    document.getElementById('profileHead').innerHTML = `
      <div class="profile-head">
        <div class="big-avatar">${initials(user.name)}</div>
        <div>
          <h1>${esc(user.name)}</h1>
          <div class="muted">${esc(user.email)}</div>
          <div class="muted" id="memberSince"></div>
        </div>
        <div style="margin-left:auto;">
          <a class="btn accent" href="/destinations.html">Plan a new trip</a>
        </div>
      </div>`;

    try {
      const me = await api('/auth/me');
      if (me.user && me.user.createdAt) {
        document.getElementById('memberSince').textContent = 'Member since ' + new Date(me.user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      }

      const { current, previous } = await api('/bookings');

      const curEl = document.getElementById('current');
      curEl.innerHTML = current.length
        ? current.map(row).join('')
        : '<div class="empty">No upcoming trips yet. <a href="/destinations.html">Explore destinations</a> to book your next adventure!</div>';

      const prevEl = document.getElementById('previous');
      prevEl.innerHTML = previous.length
        ? previous.map(row).join('')
        : '<div class="empty">No past trips yet.</div>';
    } catch (err) {
      document.getElementById('current').innerHTML = `<div class="empty">${esc(err.message)}</div>`;
    }
  })();
}
