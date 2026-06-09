if (requireLogin()) {
  renderHeader('destinations');
  const packageId = qs('package');
  const travelers = Math.max(1, parseInt(qs('travelers'), 10) || 1);
  const travelDate = qs('date');

  (async () => {
    const content = document.getElementById('content');
    if (!packageId || !travelDate) { location.href = '/destinations.html'; return; }
    try {
      const { package: pkg, destination } = await api('/packages/' + encodeURIComponent(packageId));
      const total = pkg.price * travelers;

      content.innerHTML = `
        <div class="split">
          <div class="panel">
            <h2>Payment details</h2>
            <div id="alert" class="alert"></div>
            <form id="payForm">
              <div class="field">
                <label for="cardName">Name on card</label>
                <input type="text" id="cardName" placeholder="Jane Traveller" autocomplete="cc-name" required />
              </div>
              <div class="field">
                <label for="cardNumber">Card number</label>
                <input type="text" id="cardNumber" inputmode="numeric" placeholder="4242 4242 4242 4242" maxlength="23" required />
              </div>
              <div class="row2">
                <div class="field">
                  <label for="expiry">Expiry (MM/YY)</label>
                  <input type="text" id="expiry" placeholder="12/28" maxlength="5" required />
                </div>
                <div class="field">
                  <label for="cvv">CVV</label>
                  <input type="text" id="cvv" inputmode="numeric" placeholder="123" maxlength="4" required />
                </div>
              </div>
              <button class="btn accent block lg" type="submit" id="payBtn" style="margin-top:8px;">Pay ${money2(total)} &amp; confirm</button>
              <p style="font-size:13px;color:#64748b;text-align:center;margin:10px 0 0;">Tip: use test card 4242 4242 4242 4242, any future expiry and any CVV.</p>
            </form>
          </div>
          <aside>
            <div class="panel summary">
              <h2>Order summary</h2>
              <img src="${esc(pkg.image)}" alt="" style="width:100%;height:130px;object-fit:cover;border-radius:12px;margin-bottom:14px;" />
              <h3 style="margin:0 0 2px;">${esc(pkg.title)}</h3>
              <div class="meta" style="color:#64748b;font-size:14px;margin-bottom:12px;">
                ${destination ? esc(destination.name) + ', ' + esc(destination.country) : ''} &middot; ${pkg.nights}N/${pkg.days}D
              </div>
              <div class="line"><span>Travel date</span><span>${fmtDate(travelDate)}</span></div>
              <div class="line"><span>Price / person</span><span>${money2(pkg.price)}</span></div>
              <div class="line"><span>Travellers</span><span>\u00d7 ${travelers}</span></div>
              <div class="line total"><span>Total</span><span>${money2(total)}</span></div>
            </div>
          </aside>
        </div>`;

      // Light formatting helpers for the card inputs.
      const cardNumber = document.getElementById('cardNumber');
      cardNumber.addEventListener('input', () => {
        let v = cardNumber.value.replace(/\D/g, '').slice(0, 19);
        cardNumber.value = v.replace(/(.{4})/g, '$1 ').trim();
      });
      const expiry = document.getElementById('expiry');
      expiry.addEventListener('input', () => {
        let v = expiry.value.replace(/\D/g, '').slice(0, 4);
        if (v.length >= 3) v = v.slice(0, 2) + '/' + v.slice(2);
        expiry.value = v;
      });

      const form = document.getElementById('payForm');
      const btn = document.getElementById('payBtn');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideAlert('alert');
        const payment = {
          cardName: document.getElementById('cardName').value.trim(),
          cardNumber: cardNumber.value,
          expiry: expiry.value,
          cvv: document.getElementById('cvv').value.trim(),
        };
        if (!/^\d{2}\/\d{2}$/.test(payment.expiry)) {
          showAlert('alert', 'Please enter the expiry as MM/YY.');
          return;
        }
        btn.disabled = true;
        btn.textContent = 'Processing payment\u2026';
        try {
          const data = await api('/bookings', {
            method: 'POST',
            body: { packageId, travelers, travelDate, payment },
          });
          location.href = '/confirmation.html?booking=' + encodeURIComponent(data.booking.id);
        } catch (err) {
          showAlert('alert', err.message);
          btn.disabled = false;
          btn.textContent = `Pay ${money2(total)} & confirm`;
        }
      });
    } catch (err) {
      content.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
    }
  })();
}
