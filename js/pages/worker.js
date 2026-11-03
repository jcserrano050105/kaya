/* Worker Dashboard: worker.html#dashboard | #requests | #schedule | #estimates | #progress |
   #payments | #warranty | #passport | #profile. The worker id comes from the login session,
   and Worker Management rejects any request for another worker's data. */
(function () {
  if (!KAYA.Auth.ok) { return; }
  var ui = KAYA.ui;
  var Auth = KAYA.Auth;
  var me = Auth.current();
  var workerId = me.linked_id;
  var api = KAYA.PortalClient("worker", workerId);
  var root = ui.$("#view-root");
  var POLL_MS = 5000;
  var LOCKED_UNTIL_APPROVED = ["requests", "schedule", "estimates", "progress", "payments", "warranty", "passport"];
  var TITLES = {
    dashboard: "Worker Dashboard", requests: "Booking Requests", schedule: "My Schedule", estimates: "Estimates",
    progress: "Service Progress", payments: "Payments", warranty: "Warranty Requests", passport: "Digital Work Passport", profile: "Profile"
  };
  var ACTION_LABELS = { ACCEPTED: "Accept", REJECTED: "Reject", ON_THE_WAY: "I’m on my way", ARRIVED: "I’ve arrived", IN_PROGRESS: "Start work", COMPLETED: "Mark completed" };
  var profile = null;
  var view = "dashboard";

  function icon(name) { return '<svg><use href="#i-' + name + '"/></svg>'; }

  function head(title, sub, action) {
    return '<div class="portal-head"><div><span class="system-tag system-tag--worker">Worker Dashboard</span>' +
      "<h1>" + title + "</h1><p>" + sub + "</p></div>" + (action || "") + "</div>";
  }

  function kpi(iconName, value, label, mod) {
    return '<div class="kpi' + (mod ? " kpi--" + mod : "") + '"><span class="kpi__icon">' + icon(iconName) + "</span><div><strong>" + value + "</strong><small>" + label + "</small></div></div>";
  }

  function approved() { return profile && profile.application_status === "APPROVED"; }

  function statusBanner() {
    if (!profile) { return ""; }
    if (profile.application_status === "PENDING") {
      return '<div class="status-banner"><span class="status-banner__icon">' + icon("clock") + "</span><div>" +
        "<h2>Pending Verification</h2><p>Thanks for applying! A KAYA admin is reviewing your ID and skills. You’ll be able to receive booking requests once your application is approved.</p></div></div>";
    }
    if (profile.application_status === "REJECTED") {
      return '<div class="status-banner status-banner--bad"><span class="status-banner__icon">' + icon("x") + "</span><div>" +
        "<h2>Application not approved</h2><p>" + (profile.review_note ? "Admin note: " + ui.esc(profile.review_note) + " " : "") + "Contact support@kaya.ph if you have questions.</p></div></div>";
    }
    return '<div class="status-banner status-banner--ok"><span class="status-banner__icon">' + icon("shield") + "</span><div>" +
      "<h2>Verified worker</h2><p>Your application is approved" + (profile.identity_verified ? " and your identity is verified" : "") + ". Customers can find and book you.</p></div></div>";
  }

  function lockedView() {
    return head(TITLES[view], "Available after verification.") + statusBanner() +
      '<div class="card locked-view">' + icon("lock") + "<h2>This section unlocks after approval</h2>" +
      '<p class="muted">Booking requests, schedules, estimates and payments appear here once a KAYA admin approves your application.</p>' +
      '<a class="btn btn--primary" href="#dashboard">Back to dashboard</a></div>';
  }

  function loadError(err) {
    root.insertAdjacentHTML("beforeend", '<p class="notice notice--error">' + ui.esc(ui.errorText(err)) + "</p>");
  }

  function bookings() {
    return api.request("GET", "workers/" + encodeURIComponent(workerId) + "/bookings").then(function (r) { return r.data; });
  }

  function jobHead(b) {
    return "<h3>" + ui.esc(ui.serviceName(b.service_id)) + " for " + ui.esc(b.customer_name || b.customer_id) + "</h3>" +
      '<div class="small muted">' + ui.esc(b.booking_id) + " · " + ui.esc(ui.formatDate(b.schedule)) + "</div>";
  }

  function jobDetails(b) {
    var pin = KAYA.MapPin && KAYA.MapPin.hasPin(b.location)
      ? ' · <a href="' + KAYA.MapPin.directionsUrl(b.location) + '" target="_blank" rel="noopener">Open pinned location on the map</a>' : "";
    return '<p class="small" style="margin:6px 0 0"><strong>Address:</strong> ' + ui.esc(b.location.address + ", " + b.location.city) + pin + "<br>" +
      "<strong>Problem:</strong> " + ui.esc(b.problem_description || "—") + "</p>";
  }

  /* ---------- Dashboard ---------- */

  function dashboard() {
    root.innerHTML = head("Hi, " + ui.esc(me.full_name.split(" ")[0]) + "!", "Your requests, jobs and verification status.") + statusBanner() + '<div id="dash-body"></div>';
    if (!approved()) {
      ui.$("#dash-body").innerHTML = '<div class="card"><h2>What happens next</h2><ol class="flow">' +
        "<li><div><strong>Application submitted</strong><small>Worker ID " + ui.esc(workerId) + "</small></div></li>" +
        "<li><div><strong>Identity and skill verification</strong><small>An admin checks your ID and the skills you listed.</small></div></li>" +
        "<li><div><strong>Start receiving requests</strong><small>Booking requests appear in this dashboard.</small></div></li></ol>" +
        '<a class="btn btn--ghost" href="#profile">View my application</a></div>';
      return;
    }
    bookings().then(function (list) {
      var pending = list.filter(function (b) { return b.status === "PENDING"; });
      var active = list.filter(function (b) { return ["ACCEPTED", "ON_THE_WAY", "ARRIVED", "IN_PROGRESS"].indexOf(b.status) !== -1; });
      var toConfirm = list.filter(function (b) { return b.payment && b.payment.status === "PENDING_CONFIRMATION"; });
      ui.$("#dash-body").innerHTML =
        '<div class="kpis">' + kpi("list", pending.length, "New booking requests", pending.length ? "accent" : "") + kpi("calendar", active.length, "Active jobs") +
        kpi("check", profile.completed_jobs, "Completed jobs", "success") + kpi("star", profile.review_count ? profile.rating.toFixed(1) + " / 5" : "New", "Customer rating") + "</div>" +
        '<div class="card"><div class="card__head"><h2>Availability</h2></div><div class="field-row"><div class="field" style="margin:0">' +
        '<label for="availability">Customers can book me when I’m</label><select id="availability"><option value="available">Available</option><option value="busy">Busy</option><option value="offline">Offline (hidden from search)</option></select></div></div></div>' +
        (toConfirm.length ? '<div class="status-banner"><span class="status-banner__icon">' + icon("wallet") + '</span><div style="flex:1"><h2>' + toConfirm.length +
          " payment(s) to confirm</h2><p>Customers recorded a payment. Confirm once you’ve received it.</p></div><a class=\"btn btn--primary btn--small\" href=\"#payments\">Review</a></div>" : "") +
        '<div class="card"><div class="card__head"><h2>New requests</h2><a class="btn btn--ghost btn--small" href="#requests">All requests</a></div>' +
        (pending.length ? pending.slice(0, 3).map(function (b) { return '<div class="list-row"><div>' + jobHead(b) + "</div>" + ui.statusBadge(b.status) + "</div>"; }).join("") : '<div class="empty">No new requests right now.</div>') + "</div>" +
        '<div class="card"><div class="card__head"><h2>Upcoming jobs</h2><a class="btn btn--ghost btn--small" href="#schedule">My schedule</a></div>' +
        (active.length ? active.slice(0, 4).map(function (b) { return '<div class="list-row"><div>' + jobHead(b) + "</div>" + ui.statusBadge(b.status) + "</div>"; }).join("") : '<div class="empty">No upcoming jobs.</div>') + "</div>";
      ui.$("#availability").value = profile.availability;
      ui.$("#availability").addEventListener("change", function (e) {
        api.request("PATCH", "workers/" + encodeURIComponent(workerId) + "/availability", { availability: e.target.value })
          .then(function () { profile.availability = e.target.value; ui.toast("Availability updated."); })
          .catch(function (err) { ui.toast(ui.errorText(err)); });
      });
    }).catch(loadError);
  }

  /* ---------- Requests ---------- */

  function requests() {
    root.innerHTML = head("Booking Requests", "Accept or decline new requests. Customers see your answer immediately.") + '<div class="card" id="req-body"><p class="muted">Loading…</p></div>';
    bookings().then(function (list) {
      var pending = list.filter(function (b) { return b.status === "PENDING"; });
      ui.$("#req-body").innerHTML = pending.length ? pending.map(function (b) {
        return '<div class="list-row"><div>' + jobHead(b) + jobDetails(b) + "</div>" +
          '<div class="btn-row"><button class="btn btn--primary btn--small" type="button" data-booking="' + ui.esc(b.booking_id) + '" data-status="ACCEPTED">Accept</button>' +
          '<button class="btn btn--ghost btn--small" type="button" data-booking="' + ui.esc(b.booking_id) + '" data-status="REJECTED">Reject</button></div></div>';
      }).join("") : '<div class="empty">No pending requests. New requests appear here automatically.</div>';
    }).catch(loadError);
  }

  /* ---------- Schedule ---------- */

  function schedule() {
    root.innerHTML = head("My Schedule", "Accepted jobs, in date order.") + '<div id="sch-body"><p class="muted">Loading…</p></div>';
    bookings().then(function (list) {
      var jobs = list.filter(function (b) { return ["ACCEPTED", "ON_THE_WAY", "ARRIVED", "IN_PROGRESS"].indexOf(b.status) !== -1; });
      if (!jobs.length) { ui.$("#sch-body").innerHTML = '<div class="card empty">No scheduled jobs yet.</div>'; return; }
      var groups = {};
      jobs.forEach(function (b) {
        var day = new Date(b.schedule).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", weekday: "long", month: "long", day: "numeric" });
        (groups[day] = groups[day] || []).push(b);
      });
      ui.$("#sch-body").innerHTML = Object.keys(groups).map(function (day) {
        return '<div class="card"><h2>' + ui.esc(day) + "</h2>" + groups[day].map(function (b) {
          return '<div class="list-row"><div>' + jobHead(b) + jobDetails(b) + "</div>" + ui.statusBadge(b.status) + "</div>";
        }).join("") + "</div>";
      }).join("");
    }).catch(loadError);
  }

  /* ---------- Estimates ---------- */

  function estimates() {
    root.innerHTML = head("Estimates", "Inspect the job, then send an itemized estimate. You can only start work after the customer approves it.") +
      '<div class="card" id="est-body"><p class="muted">Loading…</p></div>';
    bookings().then(function (list) {
      var open = list.filter(function (b) { return KAYA.ESTIMATE_ALLOWED_STATUSES.indexOf(b.status) !== -1; });
      var past = list.filter(function (b) { return b.estimate && KAYA.ESTIMATE_ALLOWED_STATUSES.indexOf(b.status) === -1; });
      ui.$("#est-body").innerHTML = (open.length ? open.map(function (b) {
        var e = b.estimate;
        var locked = e && e.status === "APPROVED";
        var status = e ? '<span class="badge badge--' + (locked ? "completed" : e.status === "SUBMITTED" ? "pending" : "in_progress") + '">' + ui.esc(KAYA.ESTIMATE_STATUS_LABELS[e.status]) + "</span>"
          : '<span class="badge badge--pending">Not sent</span>';
        var body = locked
          ? '<p class="small"><strong>Approved total:</strong> ' + ui.peso(e.total) + " — you can start work from Service Progress.</p>"
          : (e && e.status === "REVISION_REQUESTED" ? '<p class="notice notice--warn small">Customer asked: ' + ui.esc(e.revision_note) + "</p>" : "") +
            '<form class="inline-form" data-estimate="' + ui.esc(b.booking_id) + '" novalidate>' +
            '<div class="field"><label class="small">Labor (₱)</label><input data-field="labor" type="number" min="1" step="10" value="' + (e ? e.labor : "") + '"></div>' +
            '<div class="field"><label class="small">Materials (₱)</label><input data-field="materials" type="number" min="0" step="10" value="' + (e ? e.materials : "0") + '"></div>' +
            '<div class="field" style="flex:2 1 220px"><label class="small">Note to customer</label><input data-field="note" type="text" maxlength="500" value="' + ui.esc(e ? e.note : "") + '"></div>' +
            '<button class="btn btn--primary btn--small" type="submit">' + (e ? "Send updated estimate" : "Send estimate") + "</button></form>" +
            '<p class="small muted" style="margin:6px 0 0">A ' + ui.peso(KAYA.SERVICE_FEE) + " KAYA service fee is added automatically.</p>";
        return '<div class="list-row"><div>' + jobHead(b) + jobDetails(b) + body + "</div>" + status + "</div>";
      }).join("") : '<div class="empty">No jobs need an estimate right now. Accept a request first.</div>') +
      (past.length ? '<h3 class="mt-lg">Past estimates</h3>' + past.map(function (b) {
        return '<div class="list-row"><div>' + jobHead(b) + "</div><span>" + ui.peso(b.estimate.total) + " · " + ui.esc(KAYA.ESTIMATE_STATUS_LABELS[b.estimate.status]) + "</span></div>";
      }).join("") : "");
    }).catch(loadError);
  }

  /* ---------- Service progress ---------- */

  function progress() {
    root.innerHTML = head("Service Progress", "Update the job status so the customer can track you live.") + '<div class="card" id="prog-body"><p class="muted">Loading…</p></div>';
    bookings().then(function (list) {
      var active = list.filter(function (b) { return ["ACCEPTED", "ON_THE_WAY", "ARRIVED", "IN_PROGRESS"].indexOf(b.status) !== -1; });
      ui.$("#prog-body").innerHTML = active.length ? active.map(function (b) {
        var allowed = KAYA.TRANSITIONS[b.status] || {};
        var canStart = b.estimate && b.estimate.status === "APPROVED";
        var paid = b.payment && b.payment.status === "PAID";
        var buttons = Object.keys(allowed).filter(function (to) { return allowed[to] === "worker"; }).map(function (to) {
          var blocked = (to === "IN_PROGRESS" && !canStart) || (to === "COMPLETED" && !paid);
          return '<button class="btn btn--primary btn--small" type="button" data-booking="' + ui.esc(b.booking_id) + '" data-status="' + to + '"' + (blocked ? " disabled" : "") + ">" + ACTION_LABELS[to] + "</button>";
        }).join("");
        var hint = b.status === "ARRIVED" && !canStart
          ? '<p class="small notice notice--warn" style="margin:8px 0 0">Waiting for the customer to approve your estimate. <a href="#estimates">' + (b.estimate ? "View estimate" : "Send an estimate") + "</a></p>" : "";
        if (b.status === "IN_PROGRESS") { hint = paymentStep(b); }
        return '<div class="list-row"><div>' + jobHead(b) + jobDetails(b) + hint + "</div>" +
          '<div class="btn-row">' + ui.statusBadge(b.status) + buttons + "</div></div>";
      }).join("") : '<div class="empty">No active jobs.</div>';
    }).catch(loadError);
  }

  /* Before "Mark completed": the customer pays, then the worker confirms receiving it. */
  function paymentStep(b) {
    var p = b.payment;
    var total = b.estimate ? ui.peso(b.estimate.total) : "the agreed amount";
    if (!p) {
      return '<p class="small notice notice--warn" style="margin:8px 0 0"><strong>Collect payment first.</strong> Ask the customer to pay ' + total +
        " (Cash, GCash or QR) and record it in their KAYA app. You can mark the job completed after you confirm it.</p>";
    }
    if (p.status === "PENDING_CONFIRMATION") {
      return '<div class="notice" style="margin:8px 0 0"><p class="small" style="margin:0 0 6px"><strong>The customer recorded a payment:</strong> ' +
        ui.esc(KAYA.PAYMENT_METHODS[p.method]) + " · " + ui.peso(p.amount) + (p.reference ? " · Ref " + ui.esc(p.reference) : "") +
        ". Confirm only after you've received it.</p>" +
        '<button class="btn btn--primary btn--small" type="button" data-confirm-pay="' + ui.esc(b.booking_id) + '">Confirm payment received</button></div>';
    }
    return '<p class="small notice notice--success" style="margin:8px 0 0">✓ Payment received (' + ui.esc(KAYA.PAYMENT_METHODS[p.method]) + " · " + ui.peso(p.amount) +
      "). You can now mark the job completed.</p>";
  }

  /* ---------- Payments ---------- */

  function payments() {
    root.innerHTML = head("Payments", "Confirm payments once you receive them. KAYA records the method and reference.") + '<div id="pay-kpis"></div><div class="card" id="pay-body"><p class="muted">Loading…</p></div>';
    bookings().then(function (list) {
      var done = list.filter(function (b) { return KAYA.PAYABLE_STATUSES.indexOf(b.status) !== -1; });
      var paid = done.filter(function (b) { return b.payment && b.payment.status === "PAID"; });
      var earned = paid.reduce(function (t, b) { return t + b.payment.amount - (b.estimate ? b.estimate.service_fee : 0); }, 0);
      ui.$("#pay-kpis").innerHTML = '<div class="kpis">' + kpi("wallet", ui.peso(earned), "Earnings received", "success") +
        kpi("clock", done.filter(function (b) { return b.payment && b.payment.status === "PENDING_CONFIRMATION"; }).length, "To confirm", "accent") +
        kpi("alert", done.filter(function (b) { return !b.payment; }).length, "Awaiting customer payment") + kpi("receipt", paid.length, "Paid jobs") + "</div>";
      ui.$("#pay-body").innerHTML = done.length ? done.map(function (b) {
        var p = b.payment;
        var right = !p ? '<span class="badge badge--pending">Awaiting customer</span>'
          : p.status === "PAID" ? '<span class="badge badge--completed">Paid</span>'
          : '<button class="btn btn--primary btn--small" type="button" data-confirm-pay="' + ui.esc(b.booking_id) + '">Confirm received</button>';
        return '<div class="list-row"><div>' + jobHead(b) + '<div class="small">' +
          (b.estimate ? "Total " + ui.peso(b.estimate.total) : "") + (p ? " · " + ui.esc(KAYA.PAYMENT_METHODS[p.method]) + (p.reference ? " · Ref " + ui.esc(p.reference) : "") + " · " + ui.esc(p.transaction_id) : "") +
          "</div></div>" + right + "</div>";
      }).join("") : '<div class="empty">No payments yet. Customers pay once you start the job.</div>';
    }).catch(loadError);
  }

  /* ---------- Warranty ---------- */

  function warranty() {
    root.innerHTML = head("Warranty Requests", "Follow-up requests from customers on your completed jobs.") + '<div class="card" id="wr-body"><p class="muted">Loading…</p></div>';
    api.request("GET", "warranty").then(function (res) {
      var today = new Date().toISOString().slice(0, 10);
      ui.$("#wr-body").innerHTML = res.count ? res.data.map(function (w) {
        var actions = "";
        if (w.status === "OPEN" || w.status === "SCHEDULED") {
          actions += '<form class="inline-form" data-wr-schedule="' + w.warranty_id + '"><div class="field"><label class="small">Visit date</label><input type="date" min="' + today + '" value="' + ui.esc(w.visit_date || w.preferred_date) + '"></div>' +
            '<button class="btn btn--primary btn--small" type="submit">' + (w.status === "OPEN" ? "Schedule visit" : "Reschedule") + "</button></form>";
        }
        if (w.status === "SCHEDULED") {
          actions += '<form class="inline-form" data-wr-resolve="' + w.warranty_id + '"><div class="field" style="flex:3 1 220px"><label class="small">What did you fix?</label><input type="text" maxlength="500"></div>' +
            '<button class="btn btn--ghost btn--small" type="submit">Mark resolved</button></form>';
        }
        return '<div class="list-row"><div><h3>' + ui.esc(w.warranty_id) + " · " + ui.esc(ui.serviceName(w.service_id)) + "</h3>" +
          '<div class="small muted">Booking ' + ui.esc(w.booking_id) + " · Preferred " + ui.esc(w.preferred_date) + " · " + w.photo_count + " photo(s)</div>" +
          '<p class="small" style="margin:6px 0 0">' + ui.esc(w.description) + "</p>" +
          (w.dispute_reason ? '<p class="small notice notice--warn" style="margin:6px 0 0">Escalated to KAYA: ' + ui.esc(w.dispute_reason) + "</p>" : "") +
          (w.admin_note ? '<p class="small" style="margin:4px 0 0"><strong>KAYA decision:</strong> ' + ui.esc(w.admin_note) + "</p>" : "") + actions + "</div>" +
          '<span class="badge ' + (w.status === "CLOSED" ? "badge--completed" : w.status === "DISPUTED" ? "badge--rejected" : "badge--pending") + '">' + ui.esc(KAYA.WARRANTY_STATUS_LABELS[w.status]) + "</span></div>";
      }).join("") : '<div class="empty">No warranty requests. Great work!</div>';
    }).catch(loadError);
  }

  /* ---------- Passport ---------- */

  function passport() {
    var p = profile;
    root.innerHTML = head("Digital Work Passport", "Your verified work history. Customers see this on your Trust Profile.") +
      '<div class="passport-wrap"><div class="passport"><div class="passport__top"><span>KAYA · Digital Work Passport</span><span>' + ui.esc(workerId) + "</span></div>" +
      '<div class="passport__id"><span class="avatar avatar--lg">' + ui.esc(p.full_name.charAt(0)) + "</span><div><h3>" + ui.esc(p.full_name) + "</h3>" +
      (p.identity_verified ? '<span class="verified-badge" style="margin:6px 0 0"><svg><use href="#i-shield"/></svg>Identity Verified</span>' : '<span class="chip chip--warn">ID not yet verified</span>') + "</div></div>" +
      '<div class="small" style="color:#b8c4e6;margin-bottom:8px">Verified Skills</div><div class="chips" style="margin-bottom:18px">' +
      p.verified_skills.map(function (s) { return '<span class="chip chip--blue">' + ui.esc(ui.skillLabel(s)) + "</span>"; }).join("") + "</div>" +
      '<div class="passport__grid"><div><strong>' + p.completed_jobs + "</strong><small>Completed jobs</small></div>" +
      "<div><strong>" + (p.review_count ? p.rating.toFixed(1) : "—") + "</strong><small>Rating (" + p.review_count + ")</small></div>" +
      "<div><strong>" + p.years_experience + "</strong><small>Years experience</small></div></div></div>" +
      '<div class="card" style="margin:0"><h2>Certificates</h2><div class="chips">' +
      (p.certificates.length ? p.certificates.map(function (c) { return '<span class="chip">' + ui.esc(c) + "</span>"; }).join("") : '<span class="muted small">No certificates on file.</span>') + "</div>" +
      '<h2 class="mt">Recent reviews</h2>' + (p.recent_reviews.length ? p.recent_reviews.map(function (r) {
        return '<div class="review">' + ui.stars(r.rating) + ' <span class="small muted">' + ui.esc(ui.formatDate(r.created_at)) + "</span><p class=\"small\" style=\"margin:4px 0 0\">" + ui.esc(r.comment || "(no comment)") + "</p></div>";
      }).join("") : '<p class="muted">No reviews yet.</p>') + "</div></div>";
  }

  /* ---------- Profile ---------- */

  /* GCash details and QR code shown to customers who pay this worker. */
  var payoutQr = "";

  function showQr(src) {
    payoutQr = src || "";
    var box = ui.$("#po-qr-preview");
    box.hidden = !payoutQr;
    box.querySelector("img").src = payoutQr || "";
  }

  /* Shrinks the QR photo to at most 600 px so it saves quickly and still scans. */
  function readQr(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = reject;
      reader.onload = function () {
        var img = new Image();
        img.onerror = reject;
        img.onload = function () {
          var scale = Math.min(1, 600 / Math.max(img.width, img.height));
          var canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          var ctx = canvas.getContext("2d");
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          var png = canvas.toDataURL("image/png");
          resolve(png.length <= 650000 ? png : canvas.toDataURL("image/jpeg", 0.9));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function initPayoutForm() {
    var form = ui.$("#payout-form");
    var msg = ui.$("#po-msg");
    api.request("GET", "workers/" + encodeURIComponent(workerId) + "/payout").then(function (p) {
      ui.$("#po-name").value = p.gcash_name || "";
      ui.$("#po-number").value = p.gcash_number || "";
      showQr(p.qr_image);
    }).catch(function (err) { ui.showMessage(msg, ui.errorText(err), "error"); });

    ui.$("#po-qr").addEventListener("change", function () {
      var file = this.files[0];
      if (!file) { return; }
      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { ui.fieldErrors(form, { qr_image: "Choose a PNG or JPG image." }); return; }
      readQr(file).then(function (src) { ui.fieldErrors(form, {}); showQr(src); })
        .catch(function () { ui.fieldErrors(form, { qr_image: "That image couldn't be read. Try another file." }); });
    });
    ui.$("#po-qr-remove").addEventListener("click", function () { ui.$("#po-qr").value = ""; showQr(""); });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      api.request("PATCH", "workers/" + encodeURIComponent(workerId) + "/payout", {
        gcash_name: ui.$("#po-name").value, gcash_number: ui.$("#po-number").value, qr_image: payoutQr
      }).then(function () {
        btn.disabled = false;
        ui.fieldErrors(form, {});
        ui.showMessage(msg, "Payment details saved. Customers will see them when they pay you.", "success");
      }).catch(function (err) {
        btn.disabled = false;
        var errors = {};
        (err.details || []).forEach(function (d) { errors[d.field] = d.issue.charAt(0).toUpperCase() + d.issue.slice(1) + "."; });
        if (!ui.fieldErrors(form, errors)) { return; }
        ui.showMessage(msg, ui.errorText(err), "error");
      });
    });
  }

  function profileView() {
    var p = profile;
    root.innerHTML = head("Profile", "Your account and application.") + statusBanner() +
      '<div class="layout-2"><div class="card"><h2>Application</h2><ul class="checklist">' +
      "<li><span>Worker ID</span><strong>" + ui.esc(workerId) + "</strong></li>" +
      "<li><span>Status</span><strong>" + ui.esc(p.application_status === "PENDING" ? "Pending Verification" : p.application_status === "APPROVED" ? "Approved" : "Rejected") + "</strong></li>" +
      "<li><span>Identity</span><span>" + (p.identity_verified ? '<span class="chip chip--ok">✓ Verified</span>' : '<span class="chip chip--warn">Not yet verified</span>') + "</span></li>" +
      "<li><span>City</span><span>" + ui.esc(p.city) + "</span></li>" +
      "<li><span>Experience</span><span>" + p.years_experience + " years</span></li>" +
      "<li><span>Verified skills</span><span>" + ui.esc(p.verified_skills.map(ui.skillLabel).join(", ")) + "</span></li>" +
      (p.requested_skills.length ? "<li><span>Skills submitted</span><span>" + ui.esc(p.requested_skills.map(ui.skillLabel).join(", ")) + "</span></li>" : "") +
      "<li><span>Certificates</span><span>" + ui.esc(p.certificates.join(", ") || "None") + "</span></li></ul>" +
      (p.bio ? '<p class="small muted">' + ui.esc(p.bio) + "</p>" : "") + "</div>" +
      '<div><div class="card"><h2>Account</h2><ul class="checklist"><li><span>Name</span><strong>' + ui.esc(me.full_name) + "</strong></li>" +
      "<li><span>Email</span><span>" + ui.esc(me.email) + "</span></li><li><span>Mobile</span><span>" + ui.esc(me.phone || "—") + "</span></li></ul></div>" +
      '<form class="card" id="pw-form" novalidate><h2>Change password</h2>' +
      '<div class="field"><label for="pw-old">Current password</label><div class="pw-wrap"><input id="pw-old" data-field="old" type="password" autocomplete="current-password"></div></div>' +
      '<div class="field"><label for="pw-new">New password</label><div class="pw-wrap"><input id="pw-new" data-field="new" type="password" autocomplete="new-password"></div><div data-strength-for="pw-new"></div></div>' +
      '<button class="btn btn--primary" type="submit">Update password</button><p id="pw-msg" class="notice" hidden></p></form>' +
      '<div class="card"><h2>Session</h2><button class="btn btn--danger" type="button" data-logout>Log Out</button></div></div></div>' +
      '<form class="card" id="payout-form" novalidate><h2>Payment details</h2>' +
      '<p class="small muted">Customers see these when they pay you by GCash or QR. Only customers with a booking assigned to you can see them, once payment is due.</p>' +
      '<div class="field-row"><div class="field"><label for="po-name">GCash account name</label><input id="po-name" data-field="gcash_name" type="text" maxlength="80" placeholder="e.g. Juan D."></div>' +
      '<div class="field"><label for="po-number">GCash number</label><input id="po-number" data-field="gcash_number" type="tel" inputmode="tel" placeholder="0917 123 4567"></div></div>' +
      '<div class="field" data-field="qr_image"><label for="po-qr">GCash / QR Ph code</label>' +
      '<p class="small muted" style="margin:0 0 6px">In GCash, open <strong>Receive → Receive via QR</strong>, save the image, then upload it here.</p>' +
      '<input id="po-qr" type="file" accept="image/png,image/jpeg,image/webp">' +
      '<div class="qr-preview" id="po-qr-preview" hidden><img alt="Your payment QR code"><button class="linkish" type="button" id="po-qr-remove">Remove QR code</button></div></div>' +
      '<button class="btn btn--primary" type="submit">Save payment details</button><p id="po-msg" class="notice" hidden></p></form>';
    ui.initPasswordFields(root);
    initPayoutForm();
    ui.$("#pw-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var nw = ui.$("#pw-new").value;
      if (!ui.fieldErrors(e.target, { old: ui.$("#pw-old").value ? "" : "Enter your current password.", "new": Auth.passwordError(nw) })) { return; }
      var form = e.target;
      Promise.resolve(Auth.changePassword(ui.$("#pw-old").value, nw)).then(function (res) {
        ui.showMessage(ui.$("#pw-msg"), res.ok ? "Password updated." : res.error, res.ok ? "success" : "error");
        if (res.ok) { form.reset(); }
      });
    });
  }

  /* ---------- Actions ---------- */

  root.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-status]");
    if (btn) {
      btn.disabled = true;
      api.request("PATCH", "bookings/" + encodeURIComponent(btn.getAttribute("data-booking")) + "/status", { status: btn.getAttribute("data-status") })
        .then(function (b) { ui.toast("Status updated: " + KAYA.STATUS_LABELS[b.status] + "."); refresh(); })
        .catch(function (err) { btn.disabled = false; ui.toast(ui.errorText(err)); });
      return;
    }
    var pay = e.target.closest("[data-confirm-pay]");
    if (pay) {
      pay.disabled = true;
      api.request("POST", "bookings/" + encodeURIComponent(pay.getAttribute("data-confirm-pay")) + "/payment/confirm")
        .then(function () { ui.toast("Payment confirmed. You can now mark the job completed."); refresh(); })
        .catch(function (err) { pay.disabled = false; ui.toast(ui.errorText(err)); });
    }
  });

  root.addEventListener("submit", function (e) {
    var form = e.target;
    var estId = form.getAttribute("data-estimate");
    var schedId = form.getAttribute("data-wr-schedule");
    var resolveId = form.getAttribute("data-wr-resolve");
    if (!estId && !schedId && !resolveId) { return; }
    e.preventDefault();
    var call;
    if (estId) {
      var labor = Number(form.querySelector("[data-field=labor]").value);
      var materials = Number(form.querySelector("[data-field=materials]").value);
      if (!ui.fieldErrors(form, {
        labor: labor > 0 ? "" : "Enter the labor cost.",
        materials: materials >= 0 && form.querySelector("[data-field=materials]").value !== "" ? "" : "Enter 0 or more."
      })) { return; }
      call = api.request("PATCH", "bookings/" + encodeURIComponent(estId) + "/estimate", { labor: labor, materials: materials, note: form.querySelector("[data-field=note]").value.trim() });
    } else if (schedId) {
      var date = form.querySelector("input").value;
      if (!date) { ui.toast("Choose a visit date."); return; }
      call = api.request("PATCH", "warranty/" + schedId, { status: "SCHEDULED", visit_date: date });
    } else {
      call = api.request("PATCH", "warranty/" + resolveId, { status: "RESOLVED", note: form.querySelector("input").value.trim() });
    }
    form.querySelector("button[type=submit]").disabled = true;
    call.then(function () {
      ui.toast(estId ? "Estimate sent. The customer has been asked to approve it." : schedId ? "Follow-up visit scheduled." : "Marked as resolved. The customer will confirm.");
      refresh();
    }).catch(function (err) {
      form.querySelector("button[type=submit]").disabled = false;
      ui.toast(ui.errorText(err));
    });
  });

  /* ---------- Router ---------- */

  var RENDER = { dashboard: dashboard, requests: requests, schedule: schedule, estimates: estimates, progress: progress,
    payments: payments, warranty: warranty, passport: passport, profile: profileView };

  function render() {
    view = (window.location.hash || "#dashboard").slice(1);
    if (!RENDER[view]) { view = "dashboard"; }
    document.title = TITLES[view] + " — KAYA";
    if (!approved() && LOCKED_UNTIL_APPROVED.indexOf(view) !== -1) { root.innerHTML = lockedView(); return; }
    RENDER[view]();
  }

  /* Reload the profile first so approval by an admin takes effect without logging out. */
  function refresh() {
    return api.request("GET", "workers/" + encodeURIComponent(workerId) + "/profile").then(function (p) {
      profile = p;
      render();
    }).catch(function (err) {
      root.innerHTML = '<p class="notice notice--error">' + ui.esc(ui.errorText(err)) + "</p>";
    });
  }

  window.addEventListener("hashchange", function () { render(); window.scrollTo(0, 0); });
  refresh();

  /* Live updates for list views without inputs. */
  setInterval(function () {
    if (document.hidden || ["dashboard", "requests", "progress", "schedule"].indexOf(view) === -1) { return; }
    if (root.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { return; }
    refresh();
  }, POLL_MS);
})();
