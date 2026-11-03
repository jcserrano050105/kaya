(function () {
  if (!KAYA.Auth.ok) { return; }
  var ui = KAYA.ui;
  var client = KAYA.IntegrationClient;
  var workerId = ui.param("id");
  var customer = KAYA.CustomerStore.customer();

  var message = ui.$("#profile-message");
  var layout = ui.$("#profile-layout");
  var bookingMsg = ui.$("#booking-message");
  var submitBtn = ui.$("#b-submit");

  /* One idempotency key per booking attempt: a resend after a timeout reuses it,
     so Worker Management never creates the same booking twice. */
  var idempotencyKey = client.newIdempotencyKey();

  function check(label, ok, okText, noText) {
    return "<li><span>" + ui.esc(label) + "</span>" +
      (ok ? '<span class="chip chip--ok">&#10003; ' + ui.esc(okText) + "</span>"
          : '<span class="chip chip--warn">' + ui.esc(noText) + "</span>") + "</li>";
  }

  function render(p) {
    document.title = p.full_name + " — KAYA";
    ui.$("#p-avatar").textContent = p.full_name.split(" ").map(function (x) { return x.charAt(0); }).slice(0, 2).join("");
    ui.$("#p-name").textContent = p.full_name;
    ui.$("#p-meta").textContent = p.city + " · On KAYA since " + ui.formatDate(p.member_since).split(",").slice(0, 2).join(",");
    ui.$("#p-bio").textContent = p.bio || "";
    ui.$("#p-rating").innerHTML = p.review_count ? p.rating.toFixed(1) + " / 5" : "New";
    ui.$("#p-jobs").textContent = p.completed_jobs;
    ui.$("#p-years").textContent = p.years_experience;

    ui.$("#p-checks").innerHTML =
      check("Application", p.approved, "Approved by KAYA admin", "Not approved") +
      check("Identity", p.identity_verified, "Verified", "Not yet verified") +
      check("Availability", p.availability === "available", "Available", p.availability === "busy" ? "Busy" : "Offline");

    ui.$("#p-skills").innerHTML = p.verified_skills.map(function (s) {
      return '<span class="chip chip--ok">' + ui.esc(ui.skillLabel(s)) + "</span>";
    }).join("");

    ui.$("#p-certs").innerHTML = p.certificates.length
      ? p.certificates.map(function (c) { return '<span class="chip">' + ui.esc(c) + "</span>"; }).join("")
      : '<span class="muted small">No certificates on file.</span>';

    ui.$("#p-reviews").innerHTML = p.recent_reviews.length
      ? p.recent_reviews.map(function (r) {
          return '<div class="review">' + ui.stars(r.rating) + ' <span class="small muted">' + ui.esc(ui.formatDate(r.created_at)) + "</span>" +
            "<p>" + ui.esc(r.comment || "(no comment)") + "</p></div>";
        }).join("")
      : '<p class="muted">No reviews yet.</p>';

    var serviceSelect = ui.$("#b-service");
    serviceSelect.innerHTML = p.service_categories.map(function (s) {
      return '<option value="' + ui.esc(s) + '">' + ui.esc(ui.serviceName(s)) + "</option>";
    }).join("");
    var wanted = ui.param("service");
    if (wanted && p.service_categories.indexOf(wanted) !== -1) { serviceSelect.value = wanted; }

    ui.fillCitySelect(ui.$("#b-city"), false);
    ui.$("#b-city").value = customer.city;
    if (ui.param("q")) { ui.$("#b-problem").value = ui.param("q"); }
    if (ui.param("schedule")) { ui.$("#b-schedule").value = ui.param("schedule"); }

    layout.hidden = false;
  }

  ui.$("#booking-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var payload = {
      customer_id: customer.customer_id,
      customer_name: customer.full_name,
      worker_id: workerId,
      service_id: ui.$("#b-service").value,
      schedule: ui.toManilaIso(ui.$("#b-schedule").value),
      location: { address: ui.$("#b-address").value.trim(), city: ui.$("#b-city").value },
      problem_description: ui.$("#b-problem").value.trim()
    };
    submitBtn.disabled = true;
    ui.showMessage(bookingMsg, "Sending your request to the worker system...", "info");

    client.createBooking(payload, idempotencyKey).then(function (booking) {
      ui.showMessage(bookingMsg, "Booking " + booking.booking_id + " created. Status: Pending. Opening tracking...", "success");
      setTimeout(function () {
        window.location.href = "booking.html?id=" + encodeURIComponent(booking.booking_id);
      }, 900);
    }).catch(function (err) {
      submitBtn.disabled = false;
      if (err.code === "TIMEOUT" || err.code === "SERVICE_UNAVAILABLE") {
        ui.showMessage(bookingMsg, "We could not confirm your booking. " + ui.errorText(err), "error");
        return;
      }
      /* A validation error means this attempt is finished; the next one is a new booking. */
      idempotencyKey = client.newIdempotencyKey();
      ui.showMessage(bookingMsg, ui.errorText(err), "error");
    });
  });

  ui.$("#report-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var out = ui.$("#report-message");
    client.reportWorker(workerId, {
      reason: ui.$("#report-reason").value,
      description: ui.$("#report-description").value.trim()
    }).then(function (rep) {
      ui.showMessage(out, "Report " + rep.report_id + " sent. A KAYA admin will review it.", "success");
      e.target.reset();
    }).catch(function (err) {
      ui.showMessage(out, ui.errorText(err), "error");
    });
  });

  if (!workerId) {
    ui.showMessage(message, "No worker selected.", "error");
    return;
  }

  client.getTrustProfile(workerId).then(render).catch(function (err) {
    ui.showMessage(message, err.code === "NOT_FOUND" ? "This worker is not available on KAYA." : ui.errorText(err), "error");
  });
})();
