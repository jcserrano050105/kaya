(function () {
  if (!KAYA.Auth.ok) { return; }
  var ui = KAYA.ui;
  var client = KAYA.IntegrationClient;
  var bookingId = ui.param("id");
  var POLL_MS = 5000;

  var pageMsg = ui.$("#page-message");
  var view = ui.$("#booking-view");
  var current = null;
  var timer = null;

  ui.$("#inc-type").innerHTML = '<option value="">Choose one</option>' +
    Object.keys(KAYA.INCIDENT_TYPES).map(function (k) {
      return '<option value="' + k + '">' + ui.esc(KAYA.INCIDENT_TYPES[k]) + "</option>";
    }).join("");

  var mapShown = false;

  function renderStepper(b) {
    var reached = b.status_history.map(function (h) { return h.status; });
    var html = KAYA.STATUS_FLOW.map(function (s) {
      var cls = "";
      if (s === b.status) { cls = s === "COMPLETED" ? "is-done" : "is-current"; }
      else if (reached.indexOf(s) !== -1) { cls = "is-done"; }
      return '<li class="' + cls + '">' + ui.esc(KAYA.STATUS_LABELS[s]) + "</li>";
    }).join("");
    ui.$("#stepper").innerHTML = html;
  }

  function renderEmergency(b) {
    var panel = ui.$("#emergency");
    var active = KAYA.EMERGENCY_STATUSES.indexOf(b.status) !== -1;
    panel.hidden = !active;
    if (!active) { return; }
    var contact = KAYA.CustomerStore.trustedContact();
    var trustedBtn = ui.$("#em-trusted");
    if (contact.phone) {
      trustedBtn.href = "tel:" + contact.phone.replace(/\s+/g, "");
      trustedBtn.textContent = "Call " + (contact.name || "trusted contact");
      trustedBtn.classList.remove("hidden");
      ui.$("#em-trusted-note").hidden = true;
    } else {
      trustedBtn.classList.add("hidden");
      ui.$("#em-trusted-note").hidden = false;
    }
  }

  /* Estimate: the worker submits it; only this customer can approve or ask for a revision. */
  function renderEstimate(b) {
    var card = ui.$("#estimate-card");
    var e = b.estimate;
    var expecting = KAYA.ESTIMATE_ALLOWED_STATUSES.indexOf(b.status) !== -1;
    card.hidden = !e && !expecting;
    if (card.hidden) { return; }
    ui.$("#est-waiting").hidden = !!e;
    ui.$("#est-body").hidden = !e;
    ui.$("#est-actions").hidden = !(e && e.status === "SUBMITTED");
    ui.$("#est-revise-form").hidden = true;
    if (!e) { ui.$("#est-badge").innerHTML = '<span class="badge badge--pending">Waiting for estimate</span>'; return; }
    var kind = e.status === "APPROVED" ? "completed" : e.status === "SUBMITTED" ? "pending" : "in_progress";
    ui.$("#est-badge").innerHTML = '<span class="badge badge--' + kind + '">' + ui.esc(KAYA.ESTIMATE_STATUS_LABELS[e.status]) + "</span>";
    ui.$("#est-labor").textContent = ui.peso(e.labor);
    ui.$("#est-materials").textContent = ui.peso(e.materials);
    ui.$("#est-fee").textContent = ui.peso(e.service_fee);
    ui.$("#est-total").textContent = ui.peso(e.total);
    ui.$("#est-note").textContent = (e.note ? "Worker note: " + e.note : "") +
      (e.status === "REVISION_REQUESTED" ? " Your revision request: " + e.revision_note : "");
  }

  function renderPayment(b) {
    var card = ui.$("#payment-card");
    card.hidden = KAYA.PAYABLE_STATUSES.indexOf(b.status) === -1;
    if (card.hidden) { return; }
    var p = b.payment;
    ui.$("#pay-badge").innerHTML = p
      ? '<span class="badge ' + (p.status === "PAID" ? "badge--completed" : "badge--pending") + '">' + ui.esc(KAYA.PAYMENT_STATUS_LABELS[p.status]) + "</span>"
      : '<span class="badge badge--rejected">Payment due</span>';
    ui.$("#pay-text").textContent = p
      ? KAYA.PAYMENT_METHODS[p.method] + " · " + ui.peso(p.amount) + (p.reference ? " · Ref " + p.reference : "") + " · Transaction " + p.transaction_id
      : "Amount due: " + ui.peso(b.estimate ? b.estimate.total : 0) + ". Pay by Cash, GCash or QR, then record it in Payments. " +
        "Your worker marks the job completed after confirming your payment.";
  }

  function decide(decision, note) {
    var out = ui.$("#est-msg");
    client.decideEstimate(bookingId, { decision: decision, note: note || "" }).then(function (b) {
      current = null;
      render(b);
      ui.showMessage(out, decision === "APPROVED" ? "Estimate approved. Your worker can now start the job." : "Revision requested. The worker will send an updated estimate.", "success");
    }).catch(function (err) { ui.showMessage(out, ui.errorText(err), "error"); });
  }

  ui.$("#est-approve").addEventListener("click", function () {
    if (window.confirm("Approve this estimate of " + ui.$("#est-total").textContent + "? The worker can start once you approve.")) { decide("APPROVED"); }
  });
  ui.$("#est-revise").addEventListener("click", function () {
    ui.$("#est-revise-form").hidden = false;
    ui.$("#est-revise-note").focus();
  });
  ui.$("#est-revise-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var note = ui.$("#est-revise-note").value.trim();
    if (!ui.fieldErrors(e.target, { note: note ? "" : "Tell the worker what to change." })) { return; }
    decide("REVISION_REQUESTED", note);
    e.target.reset();
  });

  function render(b) {
    var changed = !current || current.updated_at !== b.updated_at;
    current = b;
    view.hidden = false;
    ui.$("#bk-title").textContent = ui.serviceName(b.service_id) + " with " + b.worker_name;
    ui.$("#bk-sub").textContent = "Worker ID " + b.worker_id;
    ui.$("#bk-badge").innerHTML = ui.statusBadge(b.status);
    ui.$("#bk-id").textContent = b.booking_id;
    ui.$("#bk-schedule").textContent = ui.formatDate(b.schedule);
    ui.$("#bk-address").textContent = b.location.address + ", " + b.location.city;
    /* The tracker re-renders on every poll, so the map is drawn only once. */
    if (!mapShown && KAYA.MapPin && KAYA.MapPin.hasPin(b.location)) {
      mapShown = true;
      ui.$("#bk-map-wrap").hidden = false;
      KAYA.MapPin.view(ui.$("#bk-map"), b.location);
    }
    ui.$("#bk-problem").textContent = b.problem_description || "—";
    ui.$("#bk-updated").textContent = ui.formatDate(b.updated_at);

    if (!changed) { return; }

    renderStepper(b);
    renderEmergency(b);
    renderEstimate(b);
    renderPayment(b);

    var final = ui.$("#bk-final");
    if (b.status === "REJECTED") {
      ui.showMessage(final, "The worker declined this request. You can choose another worker.", "warn");
    } else if (b.status === "CANCELLED") {
      ui.showMessage(final, "You cancelled this booking.", "warn");
    } else if (b.status === "COMPLETED") {
      ui.showMessage(final, "Service completed. This job is now part of the worker's Work Passport.", "success");
    } else {
      ui.showMessage(final, "");
    }

    var cancellable = KAYA.TRANSITIONS[b.status] && KAYA.TRANSITIONS[b.status].CANCELLED === "customer";
    ui.$("#bk-cancel").hidden = !cancellable;
    ui.$("#review-card").hidden = !(b.status === "COMPLETED" && !b.reviewed);

    if (KAYA.FINAL_STATUSES.indexOf(b.status) !== -1) { stopPolling("Final status reached. Live updates stopped."); }
  }

  function stopPolling(text) {
    if (timer) { clearInterval(timer); timer = null; }
    ui.$("#live-dot").classList.add("hidden");
    ui.$("#live-text").textContent = text;
  }

  function poll() {
    client.getBooking(bookingId).then(function (b) {
      ui.showMessage(pageMsg, "");
      render(b);
    }).catch(function (err) {
      if (!current) {
        stopPolling("");
        ui.showMessage(pageMsg, err.code === "NOT_FOUND" ? "Booking not found." : ui.errorText(err), "error");
        return;
      }
      ui.showMessage(pageMsg, "Could not refresh the status. Showing the last known status. " + ui.errorText(err), "warn");
    });
  }

  ui.$("#bk-cancel").addEventListener("click", function () {
    if (!window.confirm("Cancel this booking?")) { return; }
    client.cancelBooking(bookingId).then(render).catch(function (err) {
      ui.showMessage(pageMsg, ui.errorText(err), "error");
    });
  });

  ui.$("#em-share").addEventListener("click", function () {
    var b = current;
    var text = "KAYA booking " + b.booking_id + ": " + ui.serviceName(b.service_id) + " with " + b.worker_name +
      " (worker " + b.worker_id + ") at " + b.location.address + ", " + b.location.city + ". Status: " + KAYA.STATUS_LABELS[b.status] + ".";
    var out = ui.$("#em-message");
    if (navigator.share) {
      navigator.share({ title: "KAYA booking details", text: text }).catch(function () { /* user closed the share sheet */ });
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () {
        ui.showMessage(out, "Booking details copied. Paste them into a message to someone you trust.", "success");
      }, function () {
        ui.showMessage(out, text, "info");
      });
    } else {
      ui.showMessage(out, text, "info");
    }
  });

  ui.$("#incident-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var out = ui.$("#em-message");
    client.reportIncident(bookingId, {
      incident_type: ui.$("#inc-type").value,
      description: ui.$("#inc-desc").value.trim(),
      location_shared: ui.$("#inc-location").checked
    }).then(function (inc) {
      ui.showMessage(out, "Incident " + inc.incident_id + " was sent to KAYA and linked to booking " + inc.booking_id + ".", "success");
      e.target.reset();
      ui.$("#incident-details").open = false;
    }).catch(function (err) {
      ui.showMessage(out, ui.errorText(err), "error");
    });
  });

  ui.$("#review-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var out = ui.$("#review-message");
    client.submitReview(bookingId, {
      rating: Number(ui.$("#rv-rating").value),
      comment: ui.$("#rv-comment").value.trim()
    }).then(function () {
      ui.$("#review-form").hidden = true;
      ui.showMessage(out, "Thank you. Your review was added to the worker's Work Passport.", "success");
    }).catch(function (err) {
      ui.showMessage(out, ui.errorText(err), "error");
    });
  });

  if (!bookingId) {
    ui.showMessage(pageMsg, "No booking selected.", "error");
    return;
  }

  poll();
  timer = setInterval(poll, POLL_MS);
})();
