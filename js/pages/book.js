/* Book a Service. Guests see Log In / Create Customer Account; workers and admins are
   denied; only a signed-in customer gets the booking form (built here, not in the HTML). */
(function () {
  var ui = KAYA.ui;
  var Auth = KAYA.Auth;
  var root = ui.$("#book-root");
  var me = Auth.current();

  var COLORS = { plumbing: "#2554e8", electrical: "#f59e0b", cleaning: "#10b981", laundry: "#6366f1", carpentry: "#b45309", gardening: "#22c55e" };

  /* ---------- Guest: login gate ---------- */

  if (!me) {
    var here = "book.html" + window.location.search;
    var nextParam = "?next=" + encodeURIComponent(here);
    root.innerHTML =
      '<section class="auth" style="min-height:calc(100vh - 68px)">' +
      '<div class="auth__bg" id="gate-bg" aria-hidden="true"></div><div class="auth__overlay"></div>' +
      '<div class="auth__intro"><div class="eyebrow">Book a Service</div>' +
      "<h1>One quick step before you book</h1>" +
      "<p>To protect you and our workers, bookings are tied to a customer account. Log in or create a free account — we’ll bring you straight back to the booking form.</p>" +
      '<ul class="auth__perks"><li><svg><use href="#i-lock"/></svg>Your address is shared only with the worker you book</li>' +
      '<li><svg><use href="#i-file"/></svg>Approve the estimate before any work starts</li>' +
      '<li><svg><use href="#i-route"/></svg>Track the service live and keep payment records</li></ul></div>' +
      '<div class="auth__panel"><div class="auth-card">' +
      "<h2>Continue to booking</h2>" +
      '<p class="sub">Choose how you’d like to continue.</p>' +
      '<div class="auth-choice">' +
      '<a class="is-primary" href="login.html' + nextParam + '"><svg><use href="#i-key"/></svg><strong>Log In</strong><small>I already have a KAYA account</small></a>' +
      '<a href="register.html' + nextParam + '"><svg><use href="#i-user-plus"/></svg><strong>Create Customer Account</strong><small>New to KAYA? It’s free</small></a>' +
      "</div>" +
      '<div class="auth-divider">Are you a skilled worker?</div>' +
      '<a class="btn btn--ghost btn--block" href="worker-register.html">Register as a Worker</a>' +
      "</div></div></section>";
    KAYA.Scenes.carousel(ui.$("#gate-bg"), ["plumbing", "cleaning", "electrical", "carpentry", "laundry", "gardening"], { interval: 5000 });
    return;
  }

  /* ---------- Wrong role: access denied ---------- */

  if (me.role !== "customer") {
    root.innerHTML = '<section class="page"><div class="container"><div class="denied card">' +
      '<div class="denied__icon"><svg><use href="#i-lock"/></svg></div><h1>Access denied</h1>' +
      "<p>Booking is available to customer accounts. You’re signed in as a <strong>" + Auth.ROLE_LABELS[me.role] + "</strong>.</p>" +
      '<div class="btn-row" style="justify-content:center"><a class="btn btn--primary" href="' + Auth.homeFor(me.role) + '">Go to my dashboard</a>' +
      '<button class="btn btn--ghost" type="button" data-logout>Log out</button></div></div></div></section>';
    return;
  }

  /* ---------- Customer: booking wizard ---------- */

  var client = KAYA.IntegrationClient;
  var store = KAYA.CustomerStore;
  var customer = store.customer();
  var saved = store.savedAddress();
  var idempotencyKey = client.newIdempotencyKey();
  var state = { step: 1, problem: ui.param("q") || "", service: ui.param("service") || "", worker: null, workers: [] };

  var STEP_NAMES = ["Describe problem", "Select service", "Choose worker", "Schedule & location", "Review & submit"];

  function manilaNowPlus(hours) {
    return new Date(Date.now() + (8 + hours) * 3600 * 1000).toISOString().slice(0, 16);
  }

  root.innerHTML =
    '<section class="page"><div class="container" style="max-width:920px">' +
    '<div class="portal-head"><div><span class="system-tag system-tag--customer">Book a Service</span>' +
    "<h1>What do you need help with, " + ui.esc(customer.full_name.split(" ")[0]) + "?</h1>" +
    "<p>Five quick steps. You’ll approve the worker’s estimate before any work begins.</p></div></div>" +
    '<ol class="wizard-steps" id="wz-steps">' + STEP_NAMES.map(function (n, i) { return '<li data-step="' + (i + 1) + '"><b>' + (i + 1) + "</b>" + n + "</li>"; }).join("") + "</ol>" +
    '<form id="wizard" class="card" novalidate>' +

    /* 1 problem */
    '<div class="wizard-panel" data-panel="1">' +
    '<div class="field"><label for="wz-problem">Describe your household problem</label>' +
    '<textarea id="wz-problem" data-field="problem" placeholder="e.g. My kitchen sink is leaking under the cabinet." maxlength="600"></textarea></div>' +
    '<p class="small muted">Tip: mention every problem — KAYA can suggest one worker for several tasks.</p>' +
    '<ul class="match-list" id="wz-matches" aria-live="polite" style="margin-top:8px"></ul>' +
    "</div>" +

    /* 2 service */
    '<div class="wizard-panel" data-panel="2">' +
    '<p class="field" style="font-weight:600;margin-bottom:12px" id="wz-service-label">Select a service</p>' +
    '<div class="pick-grid" id="wz-services" role="radiogroup" aria-labelledby="wz-service-label" data-field="service"></div>' +
    "</div>" +

    /* 3 worker */
    '<div class="wizard-panel" data-panel="3">' +
    '<div class="field-row"><div class="field"><label for="wz-city">City</label><select id="wz-city"></select></div></div>' +
    '<p id="wz-workers-msg" class="notice" hidden></p>' +
    '<div class="pick-grid pick-grid--2" id="wz-workers" role="radiogroup" aria-label="Choose a worker" data-field="worker"></div>' +
    "</div>" +

    /* 4 schedule & location */
    '<div class="wizard-panel" data-panel="4">' +
    '<div class="field"><label for="wz-schedule">Date and time (Philippine time)</label>' +
    '<input id="wz-schedule" data-field="schedule" type="datetime-local" required></div>' +
    '<div class="field"><label for="wz-address">Service address</label>' +
    '<input id="wz-address" data-field="address" type="text" placeholder="House no., street, barangay" autocomplete="street-address" required></div>' +
    '<div class="field-row"><div class="field"><label for="wz-loc-city">City</label><select id="wz-loc-city"></select></div></div>' +
    '<div class="field" data-field="pin"><span class="map-field__label">Pin your exact location</span>' +
    '<p class="small muted" style="margin:0 0 8px">Tap the map where the worker should go, then drag the pin to adjust. Use <strong>Satellite</strong> (top right of the map) to see your roof.</p>' +
    '<div class="map-field__tools"><button class="btn btn--ghost btn--small" type="button" id="wz-locate"><svg aria-hidden="true"><use href="#i-pin"/></svg> Use my current location</button>' +
    '<span class="small muted" id="wz-pin-status">No pin yet</span></div>' +
    '<div class="map-field" id="wz-map" role="application" aria-label="Map: tap to pin the service location"></div></div>' +
    '<label class="checkbox"><input id="wz-save" type="checkbox" checked> Save this address to my profile</label>' +
    '<p class="small muted mt">Your address is shared only with the worker you book.</p>' +
    "</div>" +

    /* 5 review */
    '<div class="wizard-panel" data-panel="5">' +
    '<ul class="summary-list" id="wz-summary"></ul>' +
    '<div class="lock-note"><svg><use href="#i-lock"/></svg><span><strong>No charge yet.</strong> The worker will inspect the job and send an itemized estimate. They can only start after you approve it.</span></div>' +
    '<p id="wz-message" class="notice" hidden></p>' +
    "</div>" +

    '<div class="wizard-nav"><button class="btn btn--ghost" type="button" id="wz-back">Back</button>' +
    '<button class="btn btn--primary" type="submit" id="wz-next">Continue</button></div>' +
    "</form></div></section>";

  var form = ui.$("#wizard");
  ui.$("#wz-problem").value = state.problem;
  ui.fillCitySelect(ui.$("#wz-city"), false);
  ui.fillCitySelect(ui.$("#wz-loc-city"), false);
  ui.$("#wz-city").value = saved.city || customer.city;
  ui.$("#wz-loc-city").value = saved.city || customer.city;
  ui.$("#wz-address").value = saved.address || "";

  /* Map pin: tapping or dragging the pin suggests an address if the field is empty. */
  var addressAuto = !ui.$("#wz-address").value;
  ui.$("#wz-address").addEventListener("input", function () { addressAuto = false; });
  var mapPin = KAYA.MapPin.picker(ui.$("#wz-map"), {
    city: ui.$("#wz-loc-city").value,
    onChange: function (loc) {
      ui.$("#wz-pin-status").textContent = "✓ Pinned at " + loc.lat.toFixed(5) + ", " + loc.lng.toFixed(5);
      ui.fieldErrors(form, {});
    },
    onAddress: function (text) { if (addressAuto || !ui.$("#wz-address").value.trim()) { ui.$("#wz-address").value = text; addressAuto = true; } },
    onError: function (text) { ui.$("#wz-pin-status").textContent = text; },
    onProgress: function (acc) { ui.$("#wz-pin-status").textContent = "Getting a precise location… (±" + Math.round(acc) + " m)"; }
  });
  ui.$("#wz-loc-city").addEventListener("change", function () { mapPin.setCity(ui.$("#wz-loc-city").value); });
  ui.$("#wz-locate").addEventListener("click", function () {
    ui.$("#wz-pin-status").textContent = "Finding your location…";
    mapPin.locate().then(function (r) {
      if (r.problem) { ui.$("#wz-pin-status").textContent = r.problem; return; }
      ui.$("#wz-pin-status").textContent = r.accuracy <= 30
        ? "✓ Pinned at your location (accurate to about " + Math.round(r.accuracy) + " m). Drag the pin if it's not exactly on your house."
        : "Pinned near you, but only accurate to about " + Math.round(r.accuracy) + " m. Switch to Satellite and drag the pin onto your house.";
    });
  });
  ui.$("#wz-schedule").min = manilaNowPlus(1);
  ui.$("#wz-schedule").value = manilaNowPlus(24).slice(0, 11) + "10:00";

  /* Step 1: live matching */
  function renderMatches() {
    var text = ui.$("#wz-problem").value;
    var found = KAYA.SkillMatcher.matchAll(text);
    var list = ui.$("#wz-matches");
    if (!found.length) {
      list.innerHTML = text.trim().length >= 8
        ? '<li class="match-empty small muted">No suggestion yet. Mention what is broken or what needs doing, e.g. “leaking faucet”, “outlet sparks”, “door won’t close”, “linis ng banyo”. You can also pick a service in the next step.</li>'
        : "";
      return;
    }
    if (!state.serviceChosen) { state.service = found[0].service; }
    list.innerHTML = found.slice(0, 3).map(function (f, i) {
      var s = KAYA.Catalog.get(f.service);
      var picked = state.service === f.service;
      return '<li><button type="button" class="match-item match-pick' + (picked ? " is-picked" : "") + '" data-match="' + f.service + '" aria-pressed="' + picked + '">' +
        '<span class="match-item__icon" style="background:' + COLORS[f.service] + '"><svg><use href="#i-' + f.service + '"/></svg></span>' +
        "<div><strong>" + ui.esc(s.name) + "</strong><small>" + (i === 0 ? "Best match for your description" : "Also mentioned") + "</small></div>" +
        '<span class="score">' + (picked ? "Selected ✓" : "Choose") + "</span></button></li>";
    }).join("");
  }

  ui.$("#wz-matches").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-match]");
    if (!btn) { return; }
    state.service = btn.getAttribute("data-match");
    state.serviceChosen = true;
    renderMatches();
  });

  ui.$("#wz-problem").addEventListener("input", renderMatches);

  /* Step 2: services */
  function renderServices() {
    ui.$("#wz-services").innerHTML = KAYA.Catalog.all().map(function (s) {
      return '<label class="pick"><input type="radio" name="wz-service" value="' + s.id + '"' + (s.id === state.service ? " checked" : "") + (s.active ? "" : " disabled") + ">" +
        '<span class="pick__card"><span class="svc__icon" style="background:' + COLORS[s.id] + '"><svg><use href="#i-' + s.id + '"/></svg></span>' +
        "<strong>" + ui.esc(s.name) + "</strong><small>" + (s.active ? "From " + ui.peso(s.price).replace(".00", "") : "Temporarily unavailable") + "</small></span></label>";
    }).join("");
  }
  ui.$("#wz-services").addEventListener("change", function (e) {
    state.service = e.target.value;
    state.serviceChosen = true;
    state.worker = null;
  });

  /* Step 3: workers from Worker Management (approved, verified, active only) */
  function loadWorkers() {
    var box = ui.$("#wz-workers");
    var msg = ui.$("#wz-workers-msg");
    box.innerHTML = '<p class="muted">Finding verified workers…</p>';
    ui.showMessage(msg, "");
    client.searchWorkers({ service: state.service, city: ui.$("#wz-city").value }).then(function (res) {
      state.workers = res.data;
      if (!res.count) {
        box.innerHTML = '<div class="empty" style="grid-column:1/-1">No verified ' + ui.esc(ui.serviceName(state.service).toLowerCase()) + " workers in this city right now. Try another city.</div>";
        return;
      }
      box.innerHTML = res.data.map(function (w) {
        var initials = w.full_name.split(" ").map(function (p) { return p.charAt(0); }).slice(0, 2).join("");
        return '<label class="pick pick--worker"><input type="radio" name="wz-worker" value="' + ui.esc(w.worker_id) + '"' + (state.worker === w.worker_id ? " checked" : "") + ">" +
          '<span class="pick__card"><span class="avatar">' + ui.esc(initials) + "</span>" +
          '<span style="flex:1;min-width:0"><strong>' + ui.esc(w.full_name) + "</strong><br>" +
          '<small>' + (w.identity_verified ? "✓ ID verified · " : "ID not yet verified · ") + w.years_experience + " yrs · " + w.completed_jobs + " jobs</small><br>" +
          "<small>" + (w.review_count ? ui.stars(w.rating) + " " + w.rating.toFixed(1) : "New on KAYA") + " · " + (w.availability === "available" ? "Available" : "Busy") + "</small><br>" +
          '<a class="small" href="profile.html?id=' + encodeURIComponent(w.worker_id) + "&service=" + state.service + '" target="_blank" rel="noopener">View Trust Profile ↗</a></span></span></label>';
      }).join("");
    }).catch(function (err) {
      box.innerHTML = "";
      ui.showMessage(msg, ui.errorText(err), "error");
    });
  }
  ui.$("#wz-city").addEventListener("change", function () {
    state.worker = null;
    ui.$("#wz-loc-city").value = ui.$("#wz-city").value;
    loadWorkers();
  });
  ui.$("#wz-workers").addEventListener("change", function (e) { state.worker = e.target.value; });

  /* Step 5: summary */
  function renderSummary() {
    var w = state.workers.filter(function (x) { return x.worker_id === state.worker; })[0];
    var rows = [
      ["Problem", ui.$("#wz-problem").value.trim()],
      ["Service", KAYA.Catalog.get(state.service).name],
      ["Worker", w ? w.full_name + " (" + w.worker_id + ")" : ""],
      ["Schedule", ui.formatDate(ui.toManilaIso(ui.$("#wz-schedule").value))],
      ["Location", ui.$("#wz-address").value.trim() + ", " + ui.$("#wz-loc-city").value],
      ["Map pin", mapPin.value() ? "Pinned ✓ " + mapPin.value().lat.toFixed(5) + ", " + mapPin.value().lng.toFixed(5) : "Not pinned"],
      ["Starting price", "From " + ui.peso(KAYA.Catalog.get(state.service).price) + " · final cost in the estimate"]
    ];
    ui.$("#wz-summary").innerHTML = rows.map(function (r) {
      return "<li><span>" + r[0] + "</span><strong>" + ui.esc(r[1]) + "</strong></li>";
    }).join("");
  }

  /* Validation per step */
  function validate(step) {
    var errors = {};
    if (step === 1 && ui.$("#wz-problem").value.trim().length < 8) { errors.problem = "Please describe the problem in a few words (at least 8 characters)."; }
    if (step === 2 && !state.service) { errors.service = "Choose a service to continue."; }
    if (step === 3 && !state.worker) { errors.worker = "Choose a worker to continue."; }
    if (step === 4) {
      var sched = ui.$("#wz-schedule").value;
      if (!sched) { errors.schedule = "Choose a date and time."; }
      else if (sched < manilaNowPlus(1)) { errors.schedule = "Choose a time at least 1 hour from now."; }
      if (ui.$("#wz-address").value.trim().length < 6) { errors.address = "Enter your house number, street and barangay."; }
      if (!mapPin.value() && mapPin.available()) { errors.pin = "Tap the map to pin your exact location."; }
    }
    return ui.fieldErrors(form, errors);
  }

  function go(step) {
    state.step = step;
    Array.prototype.forEach.call(document.querySelectorAll("[data-panel]"), function (p) {
      p.classList.toggle("is-active", Number(p.getAttribute("data-panel")) === step);
    });
    Array.prototype.forEach.call(document.querySelectorAll("#wz-steps li"), function (li) {
      var n = Number(li.getAttribute("data-step"));
      li.classList.toggle("is-current", n === step);
      li.classList.toggle("is-done", n < step);
      if (n === step) { li.setAttribute("aria-current", "step"); } else { li.removeAttribute("aria-current"); }
    });
    ui.$("#wz-back").style.visibility = step === 1 ? "hidden" : "visible";
    ui.$("#wz-next").textContent = step === 5 ? "Submit Booking" : "Continue";
    if (step === 2) { renderServices(); }
    if (step === 3) { loadWorkers(); }
    if (step === 4) { mapPin.refresh(); }
    if (step === 5) { renderSummary(); }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  ui.$("#wz-back").addEventListener("click", function () { if (state.step > 1) { go(state.step - 1); } });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (state.step < 5) {
      if (validate(state.step)) { go(state.step + 1); }
      return;
    }
    var btn = ui.$("#wz-next");
    var msg = ui.$("#wz-message");
    btn.disabled = true;
    ui.showMessage(msg, "Sending your request to the worker…", "info");
    var address = ui.$("#wz-address").value.trim();
    var city = ui.$("#wz-loc-city").value;
    client.createBooking({
      customer_id: customer.customer_id,
      customer_name: customer.full_name,
      worker_id: state.worker,
      service_id: state.service,
      schedule: ui.toManilaIso(ui.$("#wz-schedule").value),
      location: mapPin.value() ? { address: address, city: city, lat: mapPin.value().lat, lng: mapPin.value().lng } : { address: address, city: city },
      problem_description: ui.$("#wz-problem").value.trim()
    }, idempotencyKey).then(function (b) {
      if (ui.$("#wz-save").checked) { store.setSavedAddress(address, city); }
      ui.showMessage(msg, "Booking " + b.booking_id + " submitted. Opening live tracking…", "success");
      setTimeout(function () { window.location.href = "booking.html?id=" + encodeURIComponent(b.booking_id); }, 800);
    }).catch(function (err) {
      btn.disabled = false;
      if (err.code === "TIMEOUT" || err.code === "SERVICE_UNAVAILABLE") {
        ui.showMessage(msg, "We could not confirm your booking. " + ui.errorText(err), "error");
        return;
      }
      idempotencyKey = client.newIdempotencyKey();
      if (err.code === "WORKER_UNAVAILABLE") {
        ui.showMessage(msg, "That worker is already booked at this time. Go back to choose another time or worker.", "warn");
        return;
      }
      ui.showMessage(msg, ui.errorText(err), "error");
    });
  });

  renderMatches();
  if (ui.param("service")) { state.serviceChosen = true; state.service = ui.param("service"); }
  go(state.problem && state.service ? 2 : 1);
})();
