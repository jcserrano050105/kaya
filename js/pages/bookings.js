(function () {
  if (!KAYA.Auth.ok) { return; }
  var ui = KAYA.ui;
  var customer = KAYA.CustomerStore.customer();

  ui.$("#customer-line").textContent = "All bookings for " + customer.full_name + ", newest first. Only you can see these.";

  var list = ui.$("#booking-list");
  KAYA.IntegrationClient.listMyBookings().then(function (res) {
    if (!res.count) {
      list.innerHTML = '<div class="card empty">No bookings yet. <a href="book.html">Book a service</a> to get started.</div>';
      return;
    }
    list.innerHTML = res.data.map(function (b) {
      var extra = [];
      if (b.estimate) { extra.push("Estimate: " + KAYA.ESTIMATE_STATUS_LABELS[b.estimate.status] + " · " + ui.peso(b.estimate.total)); }
      if (b.payment) { extra.push("Payment: " + KAYA.PAYMENT_STATUS_LABELS[b.payment.status]); }
      else if (b.status === "COMPLETED") { extra.push("Payment due"); }
      return '<article class="card booking-row">' +
        "<div><h3>" + ui.esc(ui.serviceName(b.service_id)) + " with " + ui.esc(b.worker_name) + "</h3>" +
        '<div class="small muted">' + ui.esc(b.booking_id) + " · " + ui.esc(ui.formatDate(b.schedule)) + "</div>" +
        (extra.length ? '<div class="small">' + ui.esc(extra.join(" · ")) + "</div>" : "") + "</div>" +
        '<div class="btn-row">' + ui.statusBadge(b.status) +
        ' <a class="btn btn--ghost btn--small" href="booking.html?id=' + encodeURIComponent(b.booking_id) + '">' +
        (KAYA.ACTIVE_STATUSES.indexOf(b.status) !== -1 ? "Track" : "Details") + "</a></div>" +
        "</article>";
    }).join("");
  }).catch(function (err) {
    ui.showMessage(ui.$("#list-message"), ui.errorText(err), "error");
  });
})();
