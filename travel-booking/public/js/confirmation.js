if (requireLogin()) {
  renderHeader('');
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
            <div class="check-circle">\u2713</div>
            <h1 style="margin:0 0 4px;">Booking confirmed!</h1>
            <p style="color:#64748b;margin:0;">A confirmation email has been sent to <strong>${esc(user.email)}</strong>.</p>
          </div>

          <div class="kv"><span class="k">Booking reference</span><span class="v">${esc(booking.reference)}</span></div>
          <div class="kv"><span class="k">Package</span><span class="v">${esc(booking.packageTitle)}</span></div>
          <div class="kv"><span class="k">Destination</span><span class="v">${esc(booking.destinationName)}</span></div>
          <div class="kv"><span class="k">Travel date</span><span class="v">${fmtDate(booking.travelDate)}</span></div>
          <div class="kv"><span class="k">Travellers</span><span class="v">${booking.travelers}</span></div>
          <div class="kv"><span class="k">Price per person</span><span class="v">${money2(booking.pricePerPerson)}</span></div>
          <div class="kv"><span class="k">Paid with</span><span class="v">Card ending ${esc(booking.payment.last4)}</span></div>
          <div class="kv"><span class="k">Amount paid</span><span class="v" style="color:var(--brand-dark);font-size:18px;">${money2(booking.total)}</span></div>

          <div class="note">&#9993; Your receipt is saved to your profile under <strong>My Bookings</strong>. You can view or print it anytime.</div>

          <div class="center-actions">
            <a class="btn" href="/profile.html">View my bookings</a>
            <a class="btn ghost" href="/destinations.html">Book another trip</a>
            <button class="btn ghost" onclick="window.print()">Print receipt</button>
          </div>
        </div>`;
    } catch (err) {
      content.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
    }
  })();
}
