if (requireLogin()) {
  renderHeader('profile');
  const bookingId = qs('booking');
  const user = getUser();

  (async () => {
    const content = document.getElementById('content');
    if (!bookingId) { location.href = '/profile.html'; return; }
    try {
      const { booking } = await api('/bookings/' + encodeURIComponent(bookingId));
      content.innerHTML = `
        <div class="panel receipt">
          <div class="head">
            <div class="logo" style="justify-content:center;margin-bottom:8px;"><span class="mark">\u2708\uFE0F</span> Wanderlust</div>
            <h1 style="margin:0;font-size:24px;">Booking Receipt</h1>
            <p style="color:#64748b;margin:4px 0 0;">${booking.status === 'upcoming' ? 'Upcoming trip' : 'Completed trip'} &middot; Issued ${fmtDate(booking.bookingDate)}</p>
          </div>

          <div class="kv"><span class="k">Booking reference</span><span class="v">${esc(booking.reference)}</span></div>
          <div class="kv"><span class="k">Booked by</span><span class="v">${esc(user.name)} (${esc(user.email)})</span></div>
          <div class="kv"><span class="k">Package</span><span class="v">${esc(booking.packageTitle)}</span></div>
          <div class="kv"><span class="k">Destination</span><span class="v">${esc(booking.destinationName)}</span></div>
          <div class="kv"><span class="k">Travel date</span><span class="v">${fmtDate(booking.travelDate)}</span></div>
          <div class="kv"><span class="k">Travellers</span><span class="v">${booking.travelers}</span></div>
          <div class="kv"><span class="k">Price per person</span><span class="v">${money2(booking.pricePerPerson)}</span></div>
          <div class="kv"><span class="k">Payment method</span><span class="v">Card ending ${esc(booking.payment.last4)}</span></div>
          <div class="kv"><span class="k">Payment status</span><span class="v" style="color:var(--brand-dark);">Paid</span></div>
          <div class="kv"><span class="k">Total amount</span><span class="v" style="font-size:18px;color:var(--brand-dark);">${money2(booking.total)}</span></div>

          <div class="note">Thank you for booking with Wanderlust Travel. Bon voyage!</div>

          <div class="center-actions">
            <button class="btn" onclick="window.print()">Print / Save PDF</button>
            <a class="btn ghost" href="/profile.html">Back to My Bookings</a>
          </div>
        </div>`;
    } catch (err) {
      content.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
    }
  })();
}
