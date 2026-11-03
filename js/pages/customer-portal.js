/* Customer Dashboard: customer.html#dashboard | #track | #payments | #warranty | #reviews | #profile.
   Every call carries the signed-in customer's id; Worker Management only returns their own records. */
(function () {
  if (!KAYA.Auth.ok) { return; }
  var ui = KAYA.ui;
  var Auth = KAYA.Auth;
  var client = KAYA.IntegrationClient;
  var store = KAYA.CustomerStore;
  var root = ui.$("#view-root");
  var VIEWS = ["dashboard", "track", "payments", "warranty", "reviews", "profile"];

  function icon(name) { return '<svg><use href="#i-' + name + '"/></svg>'; }

  function head(title, sub, action) {
    return '<div class="portal-head"><div><span class="system-tag system-tag--customer">Customer Dashboard</span>' +
      "<h1>" + title + "</h1><p>" + sub + "</p></div>" + (action || "") + "</div>";
  }

  function kpi(iconName, value, label, mod) {
    return '<div class="kpi' + (mod ? " kpi--" + mod : "") + '"><span class="kpi__icon">' + icon(iconName) + "</span><div><strong>" + value + "</strong><small>" + label + "</small></div></div>";
  }

  function miniProgress(status) {
    var idx = KAYA.STATUS_FLOW.indexOf(status);
    return '<div class="mini-progress" aria-hidden="true">' + KAYA.STATUS_FLOW.map(function (s, i) {
      return '<span class="' + (i < idx || status === "COMPLETED" ? "is-on" : i === idx ? "is-now" : "") + '"></span>';
    }).join("") + "</div>";
  }

  function bookingTitle(b) { return ui.esc(ui.serviceName(b.service_id)) + " with " + ui.esc(b.worker_name); }

  function estimateLabel(b) {
    if (!b.estimate) { return KAYA.ESTIMATE_ALLOWED_STATUSES.indexOf(b.status) !== -1 ? "Waiting for estimate" : ""; }
    return KAYA.ESTIMATE_STATUS_LABELS[b.estimate.status] + " · " + ui.peso(b.estimate.total);
  }

  function loadError(err) {
    root.insertAdjacentHTML("beforeend", '<p class="notice notice--error">' + ui.esc(ui.errorText(err)) + "</p>");
  }

  function isActive(b) { return KAYA.ACTIVE_STATUSES.indexOf(b.status) !== -1; }

  /* ---------- Dashboard ---------- */

  function dashboard() {
    var me = Auth.current();
    root.innerHTML = head("Hi, " + ui.esc(me.full_name.split(" ")[0]) + "!", "Here’s what’s happening with your home services.",
      '<a class="btn btn--accent" href="book.html">' + icon("search") + " Book a Service</a>") + '<div id="dash-body"><p class="muted">Loading…</p></div>';
    Promise.all([client.listMyBookings(), client.listMyWarranty()]).then(function (r) {
      var bookings = r[0].data, warranty = r[1].data;
      var active = bookings.filter(isActive);
      var pendingEst = bookings.filter(function (b) { return b.estimate && b.estimate.status === "SUBMITTED"; });
      var unpaid = bookings.filter(function (b) { return KAYA.PAYABLE_STATUSES.indexOf(b.status) !== -1 && !b.payment; });
      var toReview = bookings.filter(function (b) { return b.status === "COMPLETED" && !b.reviewed; });
      var openWr = warranty.filter(function (w) { return w.status !== "CLOSED"; });

      var alerts = pendingEst.map(function (b) {
        return '<div class="status-banner"><span class="status-banner__icon">' + icon("file") + "</span><div style=\"flex:1\">" +
          "<h2>Estimate waiting for your approval</h2><p>" + bookingTitle(b) + " · " + ui.peso(b.estimate.total) + ". The worker can’t start until you decide.</p></div>" +
          '<a class="btn btn--primary btn--small" href="booking.html?id=' + encodeURIComponent(b.booking_id) + '">Review estimate</a></div>';
      }).join("");

      ui.$("#dash-body").innerHTML = alerts +
        '<div class="kpis">' + kpi("route", active.length, "Active bookings") + kpi("file", pendingEst.length, "Estimates to approve", "accent") +
        kpi("check", bookings.filter(function (b) { return b.status === "COMPLETED"; }).length, "Completed services", "success") +
        kpi("shield", openWr.length, "Open warranty requests", openWr.length ? "danger" : "") + "</div>" +
        '<div class="quick-actions">' +
        '<a class="quick-action" href="book.html">' + icon("search") + "Book a Service</a>" +
        '<a class="quick-action" href="bookings.html">' + icon("list") + "My Bookings</a>" +
        '<a class="quick-action" href="#payments">' + icon("wallet") + "Payments" + (unpaid.length ? ' <span class="badge badge--pending">' + unpaid.length + " due</span>" : "") + "</a>" +
        '<a class="quick-action" href="#reviews">' + icon("star") + "Reviews" + (toReview.length ? ' <span class="badge badge--pending">' + toReview.length + "</span>" : "") + "</a></div>" +
        '<div class="card"><div class="card__head"><h2>Active bookings</h2><a class="btn btn--ghost btn--small" href="#track">Track all</a></div>' +
        (active.length ? active.map(trackRow).join("") : '<div class="empty">No active bookings. <a href="book.html">Book a service</a> when you need help.</div>') + "</div>";
    }).catch(loadError);
  }

  /* ---------- Track service ---------- */

  function trackRow(b) {
    return '<div class="list-row"><div><h3>' + bookingTitle(b) + "</h3>" +
      '<div class="small muted">' + ui.esc(b.booking_id) + " · " + ui.esc(ui.formatDate(b.schedule)) + (estimateLabel(b) ? " · " + ui.esc(estimateLabel(b)) : "") + "</div>" +
      miniProgress(b.status) + "</div>" +
      '<div class="btn-row">' + ui.statusBadge(b.status) + ' <a class="btn btn--primary btn--small" href="booking.html?id=' + encodeURIComponent(b.booking_id) + '">Open live tracker</a></div></div>';
  }

  function track() {
    root.innerHTML = head("Track Service", "Live status for your active bookings. Emergency assistance appears in the tracker while a worker is at your home.") +
      '<div class="card" id="track-body"><p class="muted">Loading…</p></div>';
    client.listMyBookings().then(function (res) {
      var active = res.data.filter(isActive);
      ui.$("#track-body").innerHTML = active.length ? active.map(trackRow).join("")
        : '<div class="empty">Nothing to track right now. Finished bookings are in <a href="bookings.html">My Bookings</a>.</div>';
    }).catch(loadError);
  }

  /* ---------- Payments ---------- */

  function payments() {
    root.innerHTML = head("Payments", "Record how you paid. KAYA keeps the payment status and transaction reference for every booking.") +
      '<div id="pay-kpis"></div><div class="card"><h2>Payment records</h2><div id="pay-body"><p class="muted">Loading…</p></div></div>';
    client.listMyBookings().then(function (res) {
      /* Payment is due once the worker starts; the worker completes the job after confirming it. */
      var done = res.data.filter(function (b) { return KAYA.PAYABLE_STATUSES.indexOf(b.status) !== -1; });
      var paid = done.filter(function (b) { return b.payment && b.payment.status === "PAID"; });
      var due = done.filter(function (b) { return !b.payment; });
      ui.$("#pay-kpis").innerHTML = '<div class="kpis">' +
        kpi("wallet", ui.peso(paid.reduce(function (t, b) { return t + b.payment.amount; }, 0)), "Total paid", "success") +
        kpi("receipt", paid.length, "Paid bookings") +
        kpi("clock", done.filter(function (b) { return b.payment && b.payment.status === "PENDING_CONFIRMATION"; }).length, "Awaiting worker confirmation", "accent") +
        kpi("alert", due.length, "Payment due", due.length ? "danger" : "") + "</div>";
      if (!done.length) { ui.$("#pay-body").innerHTML = '<div class="empty">Nothing to pay yet. Payment is due once your worker starts the job.</div>'; return; }
      ui.$("#pay-body").innerHTML = done.map(function (b) {
        var p = b.payment;
        var amount = b.estimate ? ui.peso(b.estimate.total) : "—";
        var right = p
          ? '<span class="badge ' + (p.status === "PAID" ? "badge--completed" : "badge--pending") + '">' + ui.esc(KAYA.PAYMENT_STATUS_LABELS[p.status]) + "</span>"
          : '<span class="badge badge--rejected">Payment due</span>';
        var detail = p
          ? '<div class="small muted">' + ui.esc(KAYA.PAYMENT_METHODS[p.method]) + (p.reference ? " · Ref " + ui.esc(p.reference) : "") + " · Transaction " + ui.esc(p.transaction_id) +
            " · Recorded " + ui.esc(ui.formatDate(p.recorded_at)) + (p.confirmed_at ? " · Confirmed " + ui.esc(ui.formatDate(p.confirmed_at)) : "") + "</div>"
          : '<form class="inline-form" data-pay="' + ui.esc(b.booking_id) + '" novalidate>' +
            '<div class="field"><label class="small" for="pm-' + b.booking_id + '">Method</label><select id="pm-' + b.booking_id + '" data-field="method">' +
            Object.keys(KAYA.PAYMENT_METHODS).map(function (k) { return '<option value="' + k + '">' + KAYA.PAYMENT_METHODS[k] + "</option>"; }).join("") + "</select></div>" +
            '<div class="field" data-ref-wrap hidden><label class="small" for="pr-' + b.booking_id + '">Transaction reference</label><input id="pr-' + b.booking_id + '" data-field="reference" type="text" maxlength="24" placeholder="e.g. GC8K21Q4X9"></div>' +
            '<button class="btn btn--primary btn--small" type="submit">Record payment</button>' +
            '<div class="payee" data-payee="' + ui.esc(b.booking_id) + '" hidden></div></form>';
        return '<div class="list-row"><div><h3>' + bookingTitle(b) + " · " + amount + '</h3><div class="small muted">' + ui.esc(b.booking_id) + " · " + (b.status === "COMPLETED" ? "Completed " + ui.esc(ui.formatDate(b.updated_at)) : "Work in progress · pay before the worker marks it completed") + "</div>" + detail + "</div>" + right + "</div>";
      }).join("");
    }).catch(loadError);
  }

  /* GCash and QR: show the assigned worker's GCash details or QR code to pay to. */
  var payees = {};

  function payeeHtml(method, p) {
    var amount = '<p class="payee__amount">Amount to pay: <strong>' + ui.peso(p.amount) + "</strong></p>";
    if (method === "GCASH") {
      if (!p.gcash_number) {
        return '<p class="small notice notice--warn">' + ui.esc(p.worker_name) + " hasn’t added GCash details yet. Ask them for their GCash number, or pay by cash.</p>";
      }
      return amount + '<div class="payee__row"><span class="payee__label">GCash name</span><strong>' + ui.esc(p.gcash_name) + "</strong></div>" +
        '<div class="payee__row"><span class="payee__label">GCash number</span><strong class="payee__number">' +
        ui.esc(p.gcash_number.replace(/^(\d{4})(\d{3})(\d{4})$/, "$1 $2 $3")) + "</strong>" +
        '<button class="btn btn--ghost btn--small" type="button" data-copy="' + ui.esc(p.gcash_number) + '">Copy</button></div>' +
        '<p class="small muted">Send the amount in GCash, then enter the reference number from your GCash receipt above.</p>';
    }
    if (!p.qr_image) {
      return '<p class="small notice notice--warn">' + ui.esc(p.worker_name) + " hasn’t added a QR code yet. Ask them to show it, or pay by cash or GCash.</p>";
    }
    return amount + '<div class="payee__qr"><img src="' + p.qr_image + '" alt="QR code for paying ' + ui.esc(p.worker_name) + '"></div>' +
      '<p class="small muted">Scan this with GCash, Maya or your banking app, pay the amount, then enter the reference number from your receipt above.</p>';
  }

  function showPayee(form, method) {
    var box = form.querySelector("[data-payee]");
    var id = box.getAttribute("data-payee");
    if (method === "CASH") { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = '<p class="small muted">Loading the worker’s payment details…</p>';
    (payees[id] = payees[id] || client.getPayee(id)).then(function (p) {
      if (form.querySelector("select").value === method) { box.innerHTML = payeeHtml(method, p); }
    }).catch(function (err) {
      delete payees[id];
      box.innerHTML = '<p class="small notice notice--warn">' + ui.esc(ui.errorText(err)) + "</p>";
    });
  }

  root.addEventListener("change", function (e) {
    if (e.target.matches("[data-pay] select")) {
      var form = e.target.closest("form");
      form.querySelector("[data-ref-wrap]").hidden = e.target.value === "CASH";
      showPayee(form, e.target.value);
    }
  });

  root.addEventListener("click", function (e) {
    var copy = e.target.closest("[data-copy]");
    if (!copy) { return; }
    var text = copy.getAttribute("data-copy");
    var done = function () { ui.toast("GCash number copied."); };
    if (navigator.clipboard) { navigator.clipboard.writeText(text).then(done, function () { ui.toast(text); }); } else { ui.toast(text); }
  });

  /* ---------- Warranty ---------- */

  function warranty() {
    root.innerHTML = head("Warranty Requests", "Repairs include a " + KAYA.WARRANTY_DAYS + "-day warranty. Request a follow-up visit from the original booking, and escalate to KAYA if it isn’t resolved.") +
      '<div class="layout-2"><div class="card"><h2>My requests</h2><div id="wr-list"><p class="muted">Loading…</p></div></div>' +
      '<form class="card" id="wr-form" novalidate><h2>Request Warranty Service</h2>' +
      '<div class="field"><label for="wr-booking">Original booking</label><select id="wr-booking" data-field="booking"></select></div>' +
      '<div class="field"><label for="wr-photos">Upload photos</label><label class="dropzone" for="wr-photos">' + icon("upload") +
      '<span id="wr-photo-label"><strong>Tap to upload</strong> or drag photos here</span><input id="wr-photos" type="file" accept="image/*" multiple></label></div>' +
      '<div class="field"><label for="wr-desc">Describe the issue</label><textarea id="wr-desc" data-field="description" maxlength="1000" placeholder="What happened, and when did it start?"></textarea></div>' +
      '<div class="field"><label for="wr-date">Preferred follow-up date</label><input id="wr-date" data-field="preferred_date" type="date"></div>' +
      '<button class="btn btn--primary btn--block" type="submit">Submit Warranty Request</button><p id="wr-msg" class="notice" hidden></p></form></div>';
    ui.$("#wr-date").min = new Date().toISOString().slice(0, 10);
    ui.$("#wr-photos").addEventListener("change", function () {
      var n = this.files.length;
      ui.$("#wr-photo-label").innerHTML = n ? "<strong>" + n + " photo" + (n > 1 ? "s" : "") + "</strong> attached" : "<strong>Tap to upload</strong> or drag photos here";
    });
    ui.$("#wr-form").addEventListener("submit", submitWarranty);
    loadWarranty();
  }

  function loadWarranty() {
    Promise.all([client.listMyBookings(), client.listMyWarranty()]).then(function (r) {
      var bookings = r[0].data, list = r[1].data;
      var open = list.filter(function (w) { return w.status !== "CLOSED"; }).map(function (w) { return w.booking_id; });
      var eligible = bookings.filter(function (b) {
        if (b.status !== "COMPLETED" || open.indexOf(b.booking_id) !== -1) { return false; }
        var c = b.status_history.filter(function (h) { return h.status === "COMPLETED"; })[0];
        return c && Date.now() - new Date(c.at).getTime() <= KAYA.WARRANTY_DAYS * 864e5;
      });
      var sel = ui.$("#wr-booking");
      sel.innerHTML = eligible.length ? eligible.map(function (b) {
        return '<option value="' + ui.esc(b.booking_id) + '">' + ui.esc(b.booking_id + " · " + ui.serviceName(b.service_id) + " · " + b.worker_name) + "</option>";
      }).join("") : '<option value="">No bookings within the warranty period</option>';
      ui.$("#wr-form").querySelector("button[type=submit]").disabled = !eligible.length;

      ui.$("#wr-list").innerHTML = list.length ? list.map(function (w) {
        var actions = "";
        if (w.status === "RESOLVED") {
          actions = '<button class="btn btn--primary btn--small" type="button" data-wr="' + w.warranty_id + '" data-to="CLOSED">Confirm it’s fixed</button>' +
            '<button class="btn btn--ghost btn--small" type="button" data-wr="' + w.warranty_id + '" data-to="DISPUTED">Still not fixed — escalate</button>';
        } else if (w.status === "OPEN" || w.status === "SCHEDULED") {
          actions = '<button class="btn btn--ghost btn--small" type="button" data-wr="' + w.warranty_id + '" data-to="DISPUTED">Escalate to KAYA</button>';
        }
        return '<div class="list-row"><div><h3>' + ui.esc(w.warranty_id) + " · " + ui.esc(ui.serviceName(w.service_id)) + "</h3>" +
          '<div class="small muted">Booking ' + ui.esc(w.booking_id) + " · " + w.photo_count + " photo(s) · Requested " + ui.esc(ui.formatDate(w.created_at)) + "</div>" +
          '<p class="small" style="margin:6px 0 0">' + ui.esc(w.description) + "</p>" +
          (w.visit_date ? '<p class="small" style="margin:4px 0 0"><strong>Follow-up visit:</strong> ' + ui.esc(w.visit_date) + "</p>" : "") +
          (w.resolution_note ? '<p class="small" style="margin:4px 0 0"><strong>Worker note:</strong> ' + ui.esc(w.resolution_note) + "</p>" : "") +
          (w.admin_note ? '<p class="small" style="margin:4px 0 0"><strong>KAYA decision:</strong> ' + ui.esc(w.admin_note) + "</p>" : "") +
          (actions ? '<div class="btn-row mt">' + actions + "</div>" : "") + "</div>" +
          '<span class="badge ' + (w.status === "CLOSED" ? "badge--completed" : w.status === "DISPUTED" ? "badge--rejected" : "badge--pending") + '">' + ui.esc(KAYA.WARRANTY_STATUS_LABELS[w.status]) + "</span></div>";
      }).join("") : '<div class="empty">No warranty requests yet.</div>';
    }).catch(loadError);
  }

  function submitWarranty(e) {
    e.preventDefault();
    var form = e.target;
    var errors = {
      booking: ui.$("#wr-booking").value ? "" : "Choose the original booking.",
      description: ui.$("#wr-desc").value.trim().length >= 10 ? "" : "Describe the issue in at least 10 characters.",
      preferred_date: ui.$("#wr-date").value ? "" : "Choose a preferred date."
    };
    if (!ui.fieldErrors(form, errors)) { return; }
    client.requestWarranty(ui.$("#wr-booking").value, {
      description: ui.$("#wr-desc").value.trim(),
      photo_count: ui.$("#wr-photos").files.length,
      preferred_date: ui.$("#wr-date").value
    }).then(function (wr) {
      ui.showMessage(ui.$("#wr-msg"), "Warranty request " + wr.warranty_id + " sent to your original worker.", "success");
      form.reset();
      ui.$("#wr-photo-label").innerHTML = "<strong>Tap to upload</strong> or drag photos here";
      loadWarranty();
    }).catch(function (err) { ui.showMessage(ui.$("#wr-msg"), ui.errorText(err), "error"); });
  }

  root.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-wr]");
    if (!btn) { return; }
    var to = btn.getAttribute("data-to");
    var note = "";
    if (to === "DISPUTED") {
      note = window.prompt("Tell KAYA why you are escalating this warranty request:");
      if (!note || !note.trim()) { return; }
    }
    btn.disabled = true;
    client.updateWarranty(btn.getAttribute("data-wr"), { status: to, note: note }).then(function () {
      ui.toast(to === "CLOSED" ? "Thanks! The warranty request is closed." : "Escalated. KAYA’s team will review it.");
      loadWarranty();
    }).catch(function (err) { btn.disabled = false; ui.toast(ui.errorText(err)); });
  });

  /* ---------- Reviews ---------- */

  function reviews() {
    root.innerHTML = head("Reviews", "Your ratings build each worker’s Digital Work Passport.") +
      '<div class="card"><h2>Waiting for your review</h2><div id="rv-pending"><p class="muted">Loading…</p></div></div>' +
      '<div class="card"><h2>My reviews</h2><div id="rv-done"></div></div>';
    client.listMyBookings().then(function (res) {
      var done = res.data.filter(function (b) { return b.status === "COMPLETED"; });
      var pending = done.filter(function (b) { return !b.reviewed; });
      var reviewed = done.filter(function (b) { return b.reviewed; });
      ui.$("#rv-pending").innerHTML = pending.length ? pending.map(function (b) {
        return '<div class="list-row"><div><h3>' + bookingTitle(b) + '</h3><div class="small muted">' + ui.esc(b.booking_id) + " · " + ui.esc(ui.formatDate(b.schedule)) + "</div>" +
          '<form class="inline-form" data-review="' + ui.esc(b.booking_id) + '"><div class="field"><label class="small" for="rr-' + b.booking_id + '">Rating</label>' +
          '<select id="rr-' + b.booking_id + '"><option value="5">★★★★★ Excellent</option><option value="4">★★★★ Good</option><option value="3">★★★ Okay</option><option value="2">★★ Poor</option><option value="1">★ Very poor</option></select></div>' +
          '<div class="field" style="flex:3 1 220px"><label class="small" for="rc-' + b.booking_id + '">Comment (optional)</label><input id="rc-' + b.booking_id + '" type="text" maxlength="500"></div>' +
          '<button class="btn btn--primary btn--small" type="submit">Submit review</button></form></div></div>';
      }).join("") : '<div class="empty">You’re all caught up.</div>';
      ui.$("#rv-done").innerHTML = reviewed.length ? reviewed.map(function (b) {
        var r = b.review || {};
        return '<div class="review"><strong>' + bookingTitle(b) + "</strong> " + (r.rating ? ui.stars(r.rating) : "") +
          '<p class="small muted" style="margin:4px 0 0">' + ui.esc(r.comment || "(no comment)") + "</p></div>";
      }).join("") : '<div class="empty">No reviews yet.</div>';
    }).catch(loadError);
  }

  root.addEventListener("submit", function (e) {
    var form = e.target;
    var reviewId = form.getAttribute("data-review");
    var payId = form.getAttribute("data-pay");
    if (!reviewId && !payId) { return; }
    e.preventDefault();
    var btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    var call = reviewId
      ? client.submitReview(reviewId, { rating: Number(form.querySelector("select").value), comment: form.querySelector("input").value.trim() })
      : client.recordPayment(payId, { method: form.querySelector("select").value, reference: (form.querySelector("[data-field=reference]").value || "").trim() });
    call.then(function () {
      ui.toast(reviewId ? "Thank you! Your review was added to the worker’s Work Passport." : "Payment recorded. Your worker will confirm receipt.");
      render();
    }).catch(function (err) {
      btn.disabled = false;
      if (payId && err.details && err.details.length) {
        ui.fieldErrors(form, err.details.reduce(function (o, d) { o[d.field] = d.issue.charAt(0).toUpperCase() + d.issue.slice(1) + "."; return o; }, {}));
      } else {
        ui.toast(ui.errorText(err));
      }
    });
  });

  /* ---------- Profile ---------- */

  function profile() {
    var me = Auth.current();
    var addr = store.savedAddress();
    var tc = store.trustedContact();
    root.innerHTML = head("Profile", "Manage your account, saved address and emergency contact.") +
      '<div class="layout-2"><div>' +
      '<form class="card" id="pf-form" novalidate><h2>Account details</h2>' +
      '<div class="field"><label for="pf-email">Email (used to log in)</label><input id="pf-email" type="email" value="' + ui.esc(me.email) + '" disabled></div>' +
      '<div class="field"><label for="pf-name">Full name</label><input id="pf-name" data-field="full_name" type="text" value="' + ui.esc(me.full_name) + '"></div>' +
      '<div class="field-row"><div class="field"><label for="pf-phone">Mobile number</label><input id="pf-phone" data-field="phone" type="tel" value="' + ui.esc(me.phone) + '"></div>' +
      '<div class="field"><label for="pf-city">City</label><select id="pf-city"></select></div></div>' +
      '<button class="btn btn--primary" type="submit">Save changes</button><p id="pf-msg" class="notice" hidden></p></form>' +
      '<form class="card" id="ad-form" novalidate><h2>Saved address</h2><p class="small muted">Used to pre-fill the booking form. Shared only with the worker you book.</p>' +
      '<div class="field"><label for="ad-address">Address</label><input id="ad-address" data-field="address" type="text" value="' + ui.esc(addr.address) + '" placeholder="House no., street, barangay"></div>' +
      '<div class="field"><label for="ad-city">City</label><select id="ad-city"></select></div>' +
      '<button class="btn btn--primary" type="submit">Save address</button><p id="ad-msg" class="notice" hidden></p></form>' +
      "</div><div>" +
      '<form class="card" id="tc-form" novalidate><h2>Trusted contact</h2><p class="small muted">One tap away in Emergency Assistance while a worker is at your home. Never sent to workers.</p>' +
      '<div class="field"><label for="tc-name">Name</label><input id="tc-name" data-field="tc_name" type="text" value="' + ui.esc(tc.name) + '"></div>' +
      '<div class="field"><label for="tc-phone">Mobile number</label><input id="tc-phone" data-field="tc_phone" type="tel" value="' + ui.esc(tc.phone) + '" placeholder="09XX XXX XXXX"></div>' +
      '<button class="btn btn--primary" type="submit">Save contact</button><p id="tc-msg" class="notice" hidden></p></form>' +
      '<form class="card" id="pw-form" novalidate><h2>Change password</h2>' +
      '<div class="field"><label for="pw-old">Current password</label><div class="pw-wrap"><input id="pw-old" data-field="old" type="password" autocomplete="current-password"></div></div>' +
      '<div class="field"><label for="pw-new">New password</label><div class="pw-wrap"><input id="pw-new" data-field="new" type="password" autocomplete="new-password"></div><div data-strength-for="pw-new"></div></div>' +
      '<div class="field"><label for="pw-confirm">Confirm new password</label><div class="pw-wrap"><input id="pw-confirm" data-field="confirm" type="password" autocomplete="new-password"></div></div>' +
      '<button class="btn btn--primary" type="submit">Update password</button><p class="small muted mt">Changing your password signs you out on other devices.</p><p id="pw-msg" class="notice" hidden></p></form>' +
      '<div class="card"><h2>Session</h2><p class="small muted">Signed in as ' + ui.esc(me.email) + ". Always log out on shared devices.</p>" +
      '<button class="btn btn--danger" type="button" data-logout>Log Out</button></div>' +
      "</div></div>";
    ui.fillCitySelect(ui.$("#pf-city"), false);
    ui.fillCitySelect(ui.$("#ad-city"), false);
    ui.$("#pf-city").value = me.city || KAYA.CITIES[0];
    ui.$("#ad-city").value = addr.city || me.city || KAYA.CITIES[0];
    ui.initPasswordFields(root);

    ui.$("#pf-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var form = e.target;
      Promise.resolve(Auth.updateProfile({ full_name: ui.$("#pf-name").value, phone: ui.$("#pf-phone").value, city: ui.$("#pf-city").value })).then(function (res) {
        if (!res.ok) { ui.fieldErrors(form, res.errors || {}); if (res.error) { ui.showMessage(ui.$("#pf-msg"), res.error, "error"); } return; }
        ui.fieldErrors(form, {});
        Auth.renderNav();
        ui.showMessage(ui.$("#pf-msg"), "Account details saved.", "success");
      });
    });
    ui.$("#ad-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var a = ui.$("#ad-address").value.trim();
      if (!ui.fieldErrors(e.target, { address: a.length >= 6 ? "" : "Enter your house number, street and barangay." })) { return; }
      store.setSavedAddress(a, ui.$("#ad-city").value);
      ui.showMessage(ui.$("#ad-msg"), "Address saved.", "success");
    });
    ui.$("#tc-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var name = ui.$("#tc-name").value.trim(), phone = ui.$("#tc-phone").value.trim();
      if (!ui.fieldErrors(e.target, {
        tc_name: name ? "" : "Enter a name.",
        tc_phone: /^(09|\+639)\d{2}[\s-]?\d{3}[\s-]?\d{4}$/.test(phone) ? "" : "Use a PH mobile number, e.g. 0917 123 4567."
      })) { return; }
      store.setTrustedContact(name, phone);
      ui.showMessage(ui.$("#tc-msg"), "Trusted contact saved.", "success");
    });
    ui.$("#pw-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var nw = ui.$("#pw-new").value;
      var errors = {
        old: ui.$("#pw-old").value ? "" : "Enter your current password.",
        "new": Auth.passwordError(nw),
        confirm: ui.$("#pw-confirm").value === nw ? "" : "Passwords do not match."
      };
      if (!ui.fieldErrors(e.target, errors)) { return; }
      var form = e.target;
      Promise.resolve(Auth.changePassword(ui.$("#pw-old").value, nw)).then(function (res) {
        if (!res.ok) { ui.showMessage(ui.$("#pw-msg"), res.error, "error"); return; }
        form.reset();
        ui.showMessage(ui.$("#pw-msg"), "Password updated.", "success");
      });
    });
  }

  /* ---------- Router ---------- */

  var RENDER = { dashboard: dashboard, track: track, payments: payments, warranty: warranty, reviews: reviews, profile: profile };

  function render() {
    var view = (window.location.hash || "#dashboard").slice(1);
    if (VIEWS.indexOf(view) === -1) { view = "dashboard"; }
    document.title = { dashboard: "Dashboard", track: "Track Service", payments: "Payments", warranty: "Warranty Requests", reviews: "Reviews", profile: "Profile" }[view] + " — KAYA";
    RENDER[view]();
  }

  window.addEventListener("hashchange", function () { render(); window.scrollTo(0, 0); });
  render();
})();
