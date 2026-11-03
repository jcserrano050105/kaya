/* Worker Management System: simulated REST API (/api/v1).
   It owns workers, applications, bookings, reviews and incidents, and keeps
   its own storage. Other systems only reach it through handle(). */
KAYA.WorkerManagementAPI = (function () {
  var DB_KEY = "kaya_wm_db";
  var OUTAGE_KEY = "kaya_wm_down";
  var CLIENT_KEYS = { "cb-system-key-v1": "customer-booking" };

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(DB_KEY); } catch (e) { /* storage blocked */ }
    if (raw) {
      try {
        var stored = JSON.parse(raw);
        if (stored.schema === 2) { return stored; } /* older demo data is replaced */
      } catch (e) { /* corrupted, reseed */ }
    }
    var db = KAYA.seedWorkerManagement();
    save(db);
    return db;
  }

  function save(db) {
    try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) { /* storage blocked */ }
  }

  function nowIso() {
    /* Current time expressed in +08:00 (Asia/Manila). */
    var d = new Date(Date.now() + 8 * 3600 * 1000);
    return d.toISOString().slice(0, 19) + "+08:00";
  }

  function requestId() {
    return "req_" + Math.random().toString(16).slice(2, 8);
  }

  function ok(status, body) {
    return { status: status, body: body };
  }

  function fail(status, code, message, details) {
    return {
      status: status,
      body: {
        error: { code: code, message: message, details: details || [] },
        request_id: requestId()
      }
    };
  }

  function pad(n, width) {
    var s = String(n);
    while (s.length < width) { s = "0" + s; }
    return s;
  }

  function rating(w) {
    return w.rating_count ? Math.round((w.rating_total / w.rating_count) * 10) / 10 : 0;
  }

  function findWorker(db, id) {
    for (var i = 0; i < db.workers.length; i++) {
      if (db.workers[i].worker_id === id) { return db.workers[i]; }
    }
    return null;
  }

  function findBooking(db, id) {
    for (var i = 0; i < db.bookings.length; i++) {
      if (db.bookings[i].booking_id === id) { return db.bookings[i]; }
    }
    return null;
  }

  function workerSummary(w) {
    return {
      worker_id: w.worker_id,
      full_name: w.full_name,
      city: w.city,
      service_categories: w.service_categories,
      verified_skills: w.verified_skills,
      identity_verified: w.identity_verified,
      years_experience: w.years_experience,
      completed_jobs: w.completed_jobs,
      rating: rating(w),
      review_count: w.rating_count,
      availability: w.availability
    };
  }

  function trustProfile(db, w) {
    var reviews = db.reviews
      .filter(function (r) { return r.worker_id === w.worker_id; })
      .sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; })
      .slice(0, 3)
      .map(function (r) { return { rating: r.rating, comment: r.comment, created_at: r.created_at }; });
    var p = workerSummary(w);
    p.approved = w.application_status === "APPROVED";
    p.certificates = w.certificates;
    p.bio = w.bio;
    p.recent_reviews = reviews;
    p.member_since = w.applied_at;
    return p;
  }

  function overlaps(db, workerId, schedule, ignoreId) {
    var start = new Date(schedule).getTime();
    var len = KAYA.JOB_LENGTH_HOURS * 3600 * 1000;
    return db.bookings.some(function (b) {
      if (b.worker_id !== workerId || b.booking_id === ignoreId) { return false; }
      if (KAYA.ACTIVE_STATUSES.indexOf(b.status) === -1) { return false; }
      var s = new Date(b.schedule).getTime();
      return start < s + len && s < start + len;
    });
  }

  function hasSkillFor(w, serviceId) {
    return w.service_categories.indexOf(serviceId) !== -1;
  }

  /* Who is calling: the Customer and Booking system (client key) or an internal portal role. */
  function caller(headers) {
    headers = headers || {};
    var key = headers["X-KAYA-Client-Key"];
    if (key) {
      if (!CLIENT_KEYS[key]) { return null; }
      return { role: "customer", id: headers["X-Customer-Id"] || null };
    }
    if (headers["X-Role"] === "worker" || headers["X-Role"] === "admin") {
      return { role: headers["X-Role"], id: headers["X-User-Id"] || null };
    }
    return null;
  }

  function parsePath(path) {
    var parts = path.split("?");
    var query = {};
    if (parts[1]) {
      parts[1].split("&").forEach(function (pair) {
        var kv = pair.split("=");
        if (kv[0]) { query[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || ""); }
      });
    }
    return { segments: parts[0].replace(/^\/api\/v1\//, "").split("/"), query: query };
  }

  /* ---------- Route handlers ---------- */

  function searchWorkers(db, query) {
    if (query.schedule && !KAYA.ISO_PATTERN.test(query.schedule)) {
      return fail(400, "VALIDATION_ERROR", "Request has invalid fields.",
        [{ field: "schedule", issue: "must be ISO 8601 with +08:00 offset" }]);
    }
    var list = db.workers.filter(function (w) {
      if (w.application_status !== "APPROVED") { return false; }
      if (w.account_status !== "ACTIVE") { return false; }
      if (w.availability === "offline") { return false; }
      if (query.service && !hasSkillFor(w, query.service)) { return false; }
      if (query.city && w.city !== query.city) { return false; }
      if (query.schedule && overlaps(db, w.worker_id, query.schedule)) { return false; }
      return true;
    }).map(workerSummary);
    list.sort(function (a, b) { return b.rating - a.rating; });
    return ok(200, { data: list, count: list.length });
  }

  /* Keeps the map pin only when it is a valid point in the Philippines. */
  function pinnedLocation(loc) {
    var out = { address: loc.address, city: loc.city };
    var lat = Number(loc.lat), lng = Number(loc.lng);
    if (loc.lat !== undefined && lat >= 4.5 && lat <= 21.5 && lng >= 116 && lng <= 127) {
      out.lat = Math.round(lat * 1e6) / 1e6;
      out.lng = Math.round(lng * 1e6) / 1e6;
    }
    return out;
  }

  function createBooking(db, who, headers, body) {
    var idemKey = headers["Idempotency-Key"];
    if (idemKey && db.idempotency[idemKey]) {
      return ok(200, findBooking(db, db.idempotency[idemKey]));
    }
    body = body || {};
    var details = [];
    ["customer_id", "worker_id", "service_id", "schedule", "location"].forEach(function (f) {
      if (!body[f]) { details.push({ field: f, issue: "required" }); }
    });
    if (body.schedule && !KAYA.ISO_PATTERN.test(body.schedule)) {
      details.push({ field: "schedule", issue: "must be ISO 8601 with +08:00 offset" });
    } else if (body.schedule && new Date(body.schedule).getTime() <= Date.now()) {
      details.push({ field: "schedule", issue: "must be in the future" });
    }
    if (body.location && (!body.location.address || !body.location.city)) {
      details.push({ field: "location", issue: "address and city are required" });
    }
    if (details.length) { return fail(400, "VALIDATION_ERROR", "Request has invalid fields.", details); }
    if (body.customer_id !== who.id) { return fail(403, "FORBIDDEN", "You can only book for your own account."); }

    var w = findWorker(db, body.worker_id);
    if (!w) { return fail(404, "NOT_FOUND", "Worker not found."); }
    if (w.application_status !== "APPROVED" || w.account_status !== "ACTIVE") { return fail(422, "WORKER_NOT_APPROVED", "This worker is not approved for bookings."); }
    if (!hasSkillFor(w, body.service_id)) { return fail(422, "SKILL_MISMATCH", "This worker does not offer the selected service."); }
    if (w.availability === "offline" || overlaps(db, w.worker_id, body.schedule)) {
      return fail(409, "WORKER_UNAVAILABLE", "This worker is not available at the selected time.");
    }

    db.counters.booking += 1;
    var at = nowIso();
    var booking = {
      booking_id: "BK-" + pad(db.counters.booking, 6),
      customer_id: body.customer_id,
      customer_name: body.customer_name || "",
      worker_id: w.worker_id,
      worker_name: w.full_name,
      service_id: body.service_id,
      schedule: body.schedule,
      location: pinnedLocation(body.location),
      problem_description: body.problem_description || "",
      status: "PENDING",
      status_history: [{ status: "PENDING", at: at }],
      estimate: null,
      payment: null,
      reviewed: false,
      review: null,
      created_at: at,
      updated_at: at
    };
    db.bookings.push(booking);
    if (idemKey) { db.idempotency[idemKey] = booking.booking_id; }
    save(db);
    return ok(201, booking);
  }

  function getBooking(db, who, id) {
    var b = findBooking(db, id);
    if (!b) { return fail(404, "NOT_FOUND", "Booking not found."); }
    if (who.role === "customer" && b.customer_id !== who.id) { return fail(403, "FORBIDDEN", "Not your booking."); }
    if (who.role === "worker" && b.worker_id !== who.id) { return fail(403, "FORBIDDEN", "Not your assigned booking."); }
    return ok(200, b);
  }

  function changeStatus(db, who, id, body) {
    var b = findBooking(db, id);
    if (!b) { return fail(404, "NOT_FOUND", "Booking not found."); }
    if (who.role === "customer" && b.customer_id !== who.id) { return fail(403, "FORBIDDEN", "Not your booking."); }
    if (who.role === "worker" && b.worker_id !== who.id) { return fail(403, "FORBIDDEN", "Not your assigned booking."); }
    var to = body && body.status;
    var allowed = KAYA.TRANSITIONS[b.status] || {};
    if (!allowed[to]) {
      return fail(409, "INVALID_TRANSITION", "Cannot change status from " + b.status + " to " + to + ".");
    }
    if (allowed[to] !== who.role) {
      return fail(403, "FORBIDDEN", "Your role cannot set status " + to + ".");
    }
    if (to === "IN_PROGRESS" && !(b.estimate && b.estimate.status === "APPROVED")) {
      return fail(409, "ESTIMATE_NOT_APPROVED", "Work can only start after the customer approves the estimate.");
    }
    if (to === "COMPLETED" && !(b.payment && b.payment.status === "PAID")) {
      return fail(409, "PAYMENT_REQUIRED", "Confirm the customer's payment before marking the job completed.");
    }
    var at = nowIso();
    b.status = to;
    b.status_history.push({ status: to, at: at });
    b.updated_at = at;
    if (to === "COMPLETED") {
      var w = findWorker(db, b.worker_id);
      if (w) { w.completed_jobs += 1; }
    }
    save(db);
    return ok(200, b);
  }

  function submitReview(db, who, id, body) {
    var b = findBooking(db, id);
    if (!b) { return fail(404, "NOT_FOUND", "Booking not found."); }
    if (b.customer_id !== who.id) { return fail(403, "FORBIDDEN", "Not your booking."); }
    if (b.status !== "COMPLETED") { return fail(409, "INVALID_TRANSITION", "Only completed bookings can be reviewed."); }
    if (b.reviewed) { return fail(409, "ALREADY_REVIEWED", "This booking already has a review."); }
    var r = Number(body && body.rating);
    if (!(r >= 1 && r <= 5) || Math.round(r) !== r) {
      return fail(400, "VALIDATION_ERROR", "Request has invalid fields.", [{ field: "rating", issue: "must be an integer 1-5" }]);
    }
    var review = { booking_id: id, worker_id: b.worker_id, rating: r, comment: (body.comment || "").slice(0, 500), created_at: nowIso() };
    db.reviews.push(review);
    b.reviewed = true;
    b.review = { rating: r, comment: review.comment, created_at: review.created_at };
    var w = findWorker(db, b.worker_id);
    if (w) { w.rating_total += r; w.rating_count += 1; }
    save(db);
    return ok(201, review);
  }

  function reportIncident(db, who, id, body) {
    var b = findBooking(db, id);
    if (!b) { return fail(404, "NOT_FOUND", "Booking not found."); }
    if (b.customer_id !== who.id) { return fail(403, "FORBIDDEN", "Not your booking."); }
    if (KAYA.EMERGENCY_STATUSES.indexOf(b.status) === -1) {
      return fail(409, "BOOKING_NOT_ACTIVE", "Incidents can only be reported while the worker is at your location.");
    }
    body = body || {};
    var details = [];
    if (!KAYA.INCIDENT_TYPES[body.incident_type]) { details.push({ field: "incident_type", issue: "unknown value" }); }
    if (!body.description) { details.push({ field: "description", issue: "required" }); }
    if (typeof body.location_shared !== "boolean") { details.push({ field: "location_shared", issue: "must be true or false" }); }
    if (details.length) { return fail(400, "VALIDATION_ERROR", "Request has invalid fields.", details); }
    db.counters.incident += 1;
    var inc = {
      incident_id: "INC-" + pad(db.counters.incident, 6),
      booking_id: id,
      worker_id: b.worker_id,
      customer_id: b.customer_id,
      booking_status_at_report: b.status,
      incident_type: body.incident_type,
      description: body.description.slice(0, 1000),
      location_shared: body.location_shared,
      status: "OPEN",
      created_at: nowIso()
    };
    db.incidents.push(inc);
    save(db);
    return ok(201, inc);
  }

  function reportWorker(db, who, workerId, body) {
    if (!findWorker(db, workerId)) { return fail(404, "NOT_FOUND", "Worker not found."); }
    body = body || {};
    if (!body.reason || !body.description) {
      return fail(400, "VALIDATION_ERROR", "Request has invalid fields.", [{ field: "reason", issue: "reason and description are required" }]);
    }
    db.counters.report += 1;
    var rep = {
      report_id: "RPT-" + pad(db.counters.report, 6),
      worker_id: workerId,
      customer_id: who.id,
      reason: body.reason,
      description: body.description.slice(0, 1000),
      status: "OPEN",
      created_at: nowIso()
    };
    db.worker_reports.push(rep);
    save(db);
    return ok(201, rep);
  }

  function submitApplication(db, body) {
    body = body || {};
    var details = [];
    ["full_name", "city", "service_id"].forEach(function (f) {
      if (!body[f]) { details.push({ field: f, issue: "required" }); }
    });
    var yrs = Number(body.years_experience);
    if (!(yrs >= 0 && yrs <= 60)) { details.push({ field: "years_experience", issue: "must be 0-60" }); }
    if (details.length) { return fail(400, "VALIDATION_ERROR", "Request has invalid fields.", details); }
    var service = KAYA.SERVICES.filter(function (s) { return s.id === body.service_id; })[0];
    if (!service) { return fail(400, "VALIDATION_ERROR", "Request has invalid fields.", [{ field: "service_id", issue: "unknown service" }]); }
    db.counters.worker += 1;
    var w = {
      worker_id: "W" + pad(db.counters.worker, 3),
      full_name: body.full_name,
      city: body.city,
      service_categories: [service.id],
      verified_skills: [service.id],
      certificates: body.certificate ? [body.certificate] : [],
      years_experience: yrs,
      bio: body.bio || "",
      identity_verified: false,
      application_status: "PENDING",
      availability: "available",
      completed_jobs: 0,
      rating_total: 0,
      rating_count: 0,
      applied_at: nowIso(),
      review_note: "",
      account_status: "ACTIVE",
      requested_skills: (body.skills || []).filter(function (sk) { return service.skills.indexOf(sk) !== -1; }),
      id_type: body.id_type || "",
      documents: body.documents || {}
    };
    db.workers.push(w);
    save(db);
    return ok(201, { worker_id: w.worker_id, application_status: w.application_status });
  }

  function reviewApplication(db, id, body) {
    var w = findWorker(db, id);
    if (!w) { return fail(404, "NOT_FOUND", "Application not found."); }
    var decision = body && body.decision;
    if (decision !== "APPROVED" && decision !== "REJECTED") {
      return fail(400, "VALIDATION_ERROR", "Request has invalid fields.", [{ field: "decision", issue: "must be APPROVED or REJECTED" }]);
    }
    if (w.application_status !== "PENDING") {
      return fail(409, "INVALID_TRANSITION", "This application was already reviewed.");
    }
    w.application_status = decision;
    w.identity_verified = !!(body.identity_verified);
    w.review_note = body.note || "";
    save(db);
    return ok(200, w);
  }

  function setAvailability(db, id, body) {
    var w = findWorker(db, id);
    if (!w) { return fail(404, "NOT_FOUND", "Worker not found."); }
    var v = body && body.availability;
    if (["available", "busy", "offline"].indexOf(v) === -1) {
      return fail(400, "VALIDATION_ERROR", "Request has invalid fields.", [{ field: "availability", issue: "must be available, busy or offline" }]);
    }
    w.availability = v;
    save(db);
    return ok(200, workerSummary(w));
  }

  /* ---------- Estimates ---------- */

  function money(v) { return Math.round(Number(v) * 100) / 100; }

  function submitEstimate(db, who, id, body) {
    var b = findBooking(db, id);
    if (!b) { return fail(404, "NOT_FOUND", "Booking not found."); }
    if (b.worker_id !== who.id) { return fail(403, "FORBIDDEN", "Not your assigned booking."); }
    if (KAYA.ESTIMATE_ALLOWED_STATUSES.indexOf(b.status) === -1) {
      return fail(409, "INVALID_TRANSITION", "Estimates can be sent after accepting and before work starts.");
    }
    if (b.estimate && b.estimate.status === "APPROVED") {
      return fail(409, "ESTIMATE_LOCKED", "The customer already approved this estimate.");
    }
    body = body || {};
    var labor = money(body.labor), materials = money(body.materials);
    var details = [];
    if (!(labor > 0 && labor <= 100000)) { details.push({ field: "labor", issue: "must be between 1 and 100,000" }); }
    if (!(materials >= 0 && materials <= 100000)) { details.push({ field: "materials", issue: "must be between 0 and 100,000" }); }
    if (details.length) { return fail(400, "VALIDATION_ERROR", "Request has invalid fields.", details); }
    var at = nowIso();
    b.estimate = {
      labor: labor, materials: materials, service_fee: KAYA.SERVICE_FEE, total: money(labor + materials + KAYA.SERVICE_FEE),
      note: (body.note || "").slice(0, 500), status: "SUBMITTED", submitted_at: at, decided_at: null,
      revision_note: b.estimate ? b.estimate.revision_note : ""
    };
    b.updated_at = at;
    save(db);
    return ok(200, b);
  }

  function decideEstimate(db, who, id, body) {
    var b = findBooking(db, id);
    if (!b) { return fail(404, "NOT_FOUND", "Booking not found."); }
    if (b.customer_id !== who.id) { return fail(403, "FORBIDDEN", "Not your booking."); }
    if (!b.estimate || b.estimate.status !== "SUBMITTED") {
      return fail(409, "NO_PENDING_ESTIMATE", "There is no estimate waiting for your decision.");
    }
    var decision = body && body.decision;
    if (decision !== "APPROVED" && decision !== "REVISION_REQUESTED") {
      return fail(400, "VALIDATION_ERROR", "Request has invalid fields.", [{ field: "decision", issue: "must be APPROVED or REVISION_REQUESTED" }]);
    }
    if (decision === "REVISION_REQUESTED" && !(body.note || "").trim()) {
      return fail(400, "VALIDATION_ERROR", "Request has invalid fields.", [{ field: "note", issue: "tell the worker what to change" }]);
    }
    var at = nowIso();
    b.estimate.status = decision;
    b.estimate.decided_at = at;
    b.estimate.revision_note = decision === "REVISION_REQUESTED" ? body.note.slice(0, 500) : b.estimate.revision_note;
    b.updated_at = at;
    save(db);
    return ok(200, b);
  }

  /* ---------- Payments ---------- */

  function recordPayment(db, who, id, body) {
    var b = findBooking(db, id);
    if (!b) { return fail(404, "NOT_FOUND", "Booking not found."); }
    if (b.customer_id !== who.id) { return fail(403, "FORBIDDEN", "Not your booking."); }
    if (KAYA.PAYABLE_STATUSES.indexOf(b.status) === -1) { return fail(409, "INVALID_TRANSITION", "Payment is recorded once the worker has started the job."); }
    if (b.payment && b.payment.status === "PAID") { return fail(409, "ALREADY_PAID", "This booking is already paid."); }
    body = body || {};
    var details = [];
    if (!KAYA.PAYMENT_METHODS[body.method]) { details.push({ field: "method", issue: "must be CASH, GCASH or QR" }); }
    var ref = (body.reference || "").trim().toUpperCase();
    if (body.method !== "CASH" && !/^[A-Z0-9-]{6,24}$/.test(ref)) {
      details.push({ field: "reference", issue: "enter the 6-24 character transaction reference" });
    }
    if (details.length) { return fail(400, "VALIDATION_ERROR", "Request has invalid fields.", details); }
    db.counters.payment = (db.counters.payment || 0) + 1;
    var at = nowIso();
    b.payment = {
      transaction_id: "PAY-" + pad(db.counters.payment, 6), method: body.method, reference: body.method === "CASH" ? "" : ref,
      amount: b.estimate ? b.estimate.total : 0, status: "PENDING_CONFIRMATION", recorded_at: at, confirmed_at: null
    };
    b.updated_at = at;
    save(db);
    return ok(200, b);
  }

  function confirmPayment(db, who, id) {
    var b = findBooking(db, id);
    if (!b) { return fail(404, "NOT_FOUND", "Booking not found."); }
    if (b.worker_id !== who.id) { return fail(403, "FORBIDDEN", "Not your assigned booking."); }
    if (!b.payment || b.payment.status !== "PENDING_CONFIRMATION") {
      return fail(409, "NO_PENDING_PAYMENT", "There is no payment waiting for confirmation.");
    }
    var at = nowIso();
    b.payment.status = "PAID";
    b.payment.confirmed_at = at;
    b.updated_at = at;
    save(db);
    return ok(200, b);
  }

  /* ---------- Warranty and rework ---------- */

  function findWarranty(db, id) {
    return db.warranty_requests.filter(function (x) { return x.warranty_id === id; })[0] || null;
  }

  function completedAt(b) {
    var h = b.status_history.filter(function (x) { return x.status === "COMPLETED"; })[0];
    return h ? new Date(h.at).getTime() : 0;
  }

  function createWarranty(db, who, id, body) {
    var b = findBooking(db, id);
    if (!b) { return fail(404, "NOT_FOUND", "Booking not found."); }
    if (b.customer_id !== who.id) { return fail(403, "FORBIDDEN", "Not your booking."); }
    if (b.status !== "COMPLETED") { return fail(409, "INVALID_TRANSITION", "Warranty applies to completed bookings only."); }
    if (Date.now() - completedAt(b) > KAYA.WARRANTY_DAYS * 864e5) {
      return fail(409, "WARRANTY_EXPIRED", "The " + KAYA.WARRANTY_DAYS + "-day warranty period for this booking has ended.");
    }
    var open = db.warranty_requests.some(function (x) { return x.booking_id === id && x.status !== "CLOSED"; });
    if (open) { return fail(409, "WARRANTY_OPEN", "This booking already has an open warranty request."); }
    body = body || {};
    var details = [];
    if (!(body.description || "").trim()) { details.push({ field: "description", issue: "required" }); }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.preferred_date || "")) { details.push({ field: "preferred_date", issue: "required (YYYY-MM-DD)" }); }
    if (details.length) { return fail(400, "VALIDATION_ERROR", "Request has invalid fields.", details); }
    db.counters.warranty = (db.counters.warranty || 0) + 1;
    var at = nowIso();
    var wr = {
      warranty_id: "WR-" + pad(db.counters.warranty, 6), booking_id: id, customer_id: b.customer_id, worker_id: b.worker_id,
      service_id: b.service_id, description: body.description.slice(0, 1000), photo_count: Math.min(Number(body.photo_count) || 0, 10),
      preferred_date: body.preferred_date, status: "OPEN", visit_date: "", resolution_note: "", dispute_reason: "", admin_note: "",
      history: [{ status: "OPEN", at: at, by: "customer" }], created_at: at, updated_at: at
    };
    db.warranty_requests.push(wr);
    save(db);
    return ok(201, wr);
  }

  /* Who may move a warranty request where:
     worker:   OPEN/SCHEDULED -> SCHEDULED (visit_date), SCHEDULED -> RESOLVED
     customer: OPEN/SCHEDULED/RESOLVED -> DISPUTED (reason), RESOLVED -> CLOSED
     admin:    DISPUTED -> SCHEDULED (rework ordered) or CLOSED (decision note) */
  var WARRANTY_MOVES = {
    worker:   { OPEN: ["SCHEDULED"], SCHEDULED: ["SCHEDULED", "RESOLVED"] },
    customer: { OPEN: ["DISPUTED"], SCHEDULED: ["DISPUTED"], RESOLVED: ["DISPUTED", "CLOSED"] },
    admin:    { DISPUTED: ["SCHEDULED", "CLOSED"] }
  };

  function updateWarranty(db, who, id, body) {
    var wr = findWarranty(db, id);
    if (!wr) { return fail(404, "NOT_FOUND", "Warranty request not found."); }
    if (who.role === "customer" && wr.customer_id !== who.id) { return fail(403, "FORBIDDEN", "Not your warranty request."); }
    if (who.role === "worker" && wr.worker_id !== who.id) { return fail(403, "FORBIDDEN", "Not your warranty request."); }
    body = body || {};
    var to = body.status;
    var moves = (WARRANTY_MOVES[who.role] || {})[wr.status] || [];
    if (moves.indexOf(to) === -1) {
      return fail(409, "INVALID_TRANSITION", "Cannot change warranty status from " + wr.status + " to " + to + ".");
    }
    if (to === "SCHEDULED" && !/^\d{4}-\d{2}-\d{2}/.test(body.visit_date || wr.visit_date || "")) {
      return fail(400, "VALIDATION_ERROR", "Request has invalid fields.", [{ field: "visit_date", issue: "required" }]);
    }
    if (to === "DISPUTED" && !(body.note || "").trim()) {
      return fail(400, "VALIDATION_ERROR", "Request has invalid fields.", [{ field: "note", issue: "explain why you are escalating" }]);
    }
    if (who.role === "admin" && !(body.note || "").trim()) {
      return fail(400, "VALIDATION_ERROR", "Request has invalid fields.", [{ field: "note", issue: "a decision note is required" }]);
    }
    var at = nowIso();
    if (body.visit_date) { wr.visit_date = body.visit_date; }
    if (to === "RESOLVED") { wr.resolution_note = (body.note || "").slice(0, 500); }
    if (to === "DISPUTED") { wr.dispute_reason = body.note.slice(0, 500); }
    if (who.role === "admin") { wr.admin_note = body.note.slice(0, 500); }
    wr.status = to;
    wr.history.push({ status: to, at: at, by: who.role });
    wr.updated_at = at;
    save(db);
    return ok(200, wr);
  }

  /* ---------- Admin tools ---------- */

  function setAccountStatus(db, id, body) {
    var w = findWorker(db, id);
    if (!w) { return fail(404, "NOT_FOUND", "Worker not found."); }
    var v = body && body.account_status;
    if (["ACTIVE", "SUSPENDED", "DEACTIVATED"].indexOf(v) === -1) {
      return fail(400, "VALIDATION_ERROR", "Request has invalid fields.", [{ field: "account_status", issue: "must be ACTIVE, SUSPENDED or DEACTIVATED" }]);
    }
    w.account_status = v;
    save(db);
    return ok(200, w);
  }

  function setSkills(db, id, body) {
    var w = findWorker(db, id);
    if (!w) { return fail(404, "NOT_FOUND", "Worker not found."); }
    var skills = (body && body.verified_skills) || [];
    var known = [];
    KAYA.SERVICES.forEach(function (s) { known = known.concat(s.skills); });
    var bad = skills.filter(function (sk) { return known.indexOf(sk) === -1; });
    if (!skills.length || bad.length) {
      return fail(400, "VALIDATION_ERROR", "Request has invalid fields.", [{ field: "verified_skills", issue: bad.length ? "unknown: " + bad.join(", ") : "at least one skill" }]);
    }
    w.verified_skills = skills;
    w.service_categories = KAYA.SERVICES.filter(function (s) {
      return s.skills.some(function (sk) { return skills.indexOf(sk) !== -1; });
    }).map(function (s) { return s.id; });
    save(db);
    return ok(200, w);
  }

  function setCaseStatus(list, idField, id, body) {
    var item = list.filter(function (x) { return x[idField] === id; })[0];
    if (!item) { return null; }
    item.status = body.status;
    item.admin_note = (body.note || "").slice(0, 500);
    item.updated_at = nowIso();
    return item;
  }

  function reports(db) {
    var byService = {};
    KAYA.SERVICES.forEach(function (s) { byService[s.id] = 0; });
    var byStatus = {};
    var revenue = 0, fees = 0;
    db.bookings.forEach(function (b) {
      byService[b.service_id] = (byService[b.service_id] || 0) + 1;
      byStatus[b.status] = (byStatus[b.status] || 0) + 1;
      if (b.payment && b.payment.status === "PAID") { revenue += b.payment.amount; fees += b.estimate ? b.estimate.service_fee : 0; }
    });
    var workers = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
    db.workers.forEach(function (w) { workers[w.application_status] += 1; });
    var finished = (byStatus.COMPLETED || 0) + (byStatus.REJECTED || 0) + (byStatus.CANCELLED || 0);
    var rated = db.workers.filter(function (w) { return w.rating_count; });
    return ok(200, {
      bookings_total: db.bookings.length,
      bookings_by_status: byStatus,
      bookings_by_service: byService,
      completion_rate: finished ? Math.round((byStatus.COMPLETED || 0) / finished * 100) : 0,
      revenue_paid: revenue,
      service_fees: fees,
      workers_by_application: workers,
      average_rating: rated.length ? Math.round(rated.reduce(function (t, w) { return t + rating(w); }, 0) / rated.length * 10) / 10 : 0,
      open_incidents: db.incidents.filter(function (x) { return (x.status || "OPEN") !== "RESOLVED"; }).length,
      open_disputes: db.warranty_requests.filter(function (x) { return x.status === "DISPUTED"; }).length,
      warranty_total: db.warranty_requests.length
    });
  }

  /* ---------- Supabase ----------
     With Supabase connected, the same routes run in the database function wm_api()
     (supabase/003_worker_management.sql). It identifies the caller from their
     Supabase login, so the X-Customer-Id / X-Role headers are not trusted there. */

  function remote(req) {
    var p = parsePath(req.path);
    var down = function () { return fail(503, "SERVICE_UNAVAILABLE", "Can't reach the KAYA server. Check your connection and try again."); };
    return KAYA.supabase.rpc("wm_api", {
      p_method: req.method,
      p_segments: p.segments,
      p_query: p.query,
      p_body: req.body === undefined ? null : req.body,
      p_idem: (req.headers || {})["Idempotency-Key"] || null
    }).then(function (r) { return r.error || !r.data ? down() : r.data; }, down);
  }

  /* ---------- Router ---------- */

  /* Returns the response, or a Promise of it when Supabase is connected. */
  function handle(req) {
    if (isDown()) { return fail(503, "SERVICE_UNAVAILABLE", "Worker Management is temporarily unavailable."); }
    if (KAYA.Auth && KAYA.Auth.backend === "supabase") { return remote(req); }
    var who = caller(req.headers);
    if (!who) { return fail(401, "INVALID_CLIENT", "Missing or invalid client credentials."); }

    var db = load();
    var p = parsePath(req.path);
    var s = p.segments;
    var m = req.method;
    var headers = req.headers || {};
    var body = req.body;

    if (s[0] === "workers") {
      if (m === "GET" && s.length === 1) { return searchWorkers(db, p.query); }
      if (m === "POST" && s[1] === "applications") {
        if (who.role !== "worker") { return fail(403, "FORBIDDEN", "Only the worker portal can submit applications."); }
        return submitApplication(db, body);
      }
      if (m === "GET" && s[2] === "profile") {
        var w = findWorker(db, s[1]);
        if (!w) { return fail(404, "NOT_FOUND", "Worker not found."); }
        if (who.role === "customer" && w.application_status !== "APPROVED") { return fail(404, "NOT_FOUND", "Worker not found."); }
        if (who.role === "worker" && who.id !== w.worker_id) { return fail(403, "FORBIDDEN", "Not your account."); }
        var prof = trustProfile(db, w);
        if (who.role !== "customer") {
          prof.application_status = w.application_status;
          prof.review_note = w.review_note;
          prof.account_status = w.account_status;
          prof.requested_skills = w.requested_skills || [];
        }
        return ok(200, prof);
      }
      if (m === "POST" && s[2] === "reports") {
        if (who.role !== "customer") { return fail(403, "FORBIDDEN", "Only customers can report workers."); }
        return reportWorker(db, who, s[1], body);
      }
      if (m === "GET" && s[2] === "bookings") {
        if (who.role !== "admin" && !(who.role === "worker" && who.id === s[1])) { return fail(403, "FORBIDDEN", "Not your bookings."); }
        var mine = db.bookings.filter(function (b) { return b.worker_id === s[1]; })
          .sort(function (a, b) { return a.schedule < b.schedule ? -1 : 1; });
        return ok(200, { data: mine, count: mine.length });
      }
      if (m === "PATCH" && s[2] === "availability") {
        if (!(who.role === "worker" && who.id === s[1])) { return fail(403, "FORBIDDEN", "Not your account."); }
        return setAvailability(db, s[1], body);
      }
    }

    if (s[0] === "bookings") {
      if (s.length === 1 && m === "POST") {
        if (who.role !== "customer") { return fail(403, "FORBIDDEN", "Only customers can create bookings."); }
        return createBooking(db, who, headers, body);
      }
      if (s.length === 1 && m === "GET") {
        if (who.role !== "customer" || p.query.customer_id !== who.id) { return fail(403, "FORBIDDEN", "You can only list your own bookings."); }
        var list = db.bookings.filter(function (b) { return b.customer_id === who.id; })
          .sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });
        return ok(200, { data: list, count: list.length });
      }
      if (s.length === 2 && m === "GET") { return getBooking(db, who, s[1]); }
      if (s[2] === "status" && m === "PATCH") { return changeStatus(db, who, s[1], body); }
      if (s[2] === "review" && m === "POST") {
        if (who.role !== "customer") { return fail(403, "FORBIDDEN", "Only customers can review."); }
        return submitReview(db, who, s[1], body);
      }
      if (s[2] === "incidents" && m === "POST") {
        if (who.role !== "customer") { return fail(403, "FORBIDDEN", "Only customers can report incidents."); }
        return reportIncident(db, who, s[1], body);
      }
      if (s[2] === "estimate" && s.length === 3 && m === "PATCH") {
        if (who.role !== "worker") { return fail(403, "FORBIDDEN", "Only the assigned worker can send an estimate."); }
        return submitEstimate(db, who, s[1], body);
      }
      if (s[2] === "estimate" && s[3] === "decision" && m === "POST") {
        if (who.role !== "customer") { return fail(403, "FORBIDDEN", "Only the customer can approve an estimate."); }
        return decideEstimate(db, who, s[1], body);
      }
      if (s[2] === "payment" && s.length === 3 && m === "POST") {
        if (who.role !== "customer") { return fail(403, "FORBIDDEN", "Only the customer can record a payment."); }
        return recordPayment(db, who, s[1], body);
      }
      if (s[2] === "payment" && s[3] === "confirm" && m === "POST") {
        if (who.role !== "worker") { return fail(403, "FORBIDDEN", "Only the assigned worker can confirm payment."); }
        return confirmPayment(db, who, s[1]);
      }
      if (s[2] === "warranty" && m === "POST") {
        if (who.role !== "customer") { return fail(403, "FORBIDDEN", "Only customers can request warranty service."); }
        return createWarranty(db, who, s[1], body);
      }
    }

    if (s[0] === "warranty") {
      if (s.length === 1 && m === "GET") {
        var wl = db.warranty_requests.filter(function (x) {
          if (who.role === "customer") { return x.customer_id === who.id; }
          if (who.role === "worker") { return x.worker_id === who.id; }
          return !p.query.status || x.status === p.query.status;
        }).sort(function (a, b) { return a.updated_at < b.updated_at ? 1 : -1; });
        return ok(200, { data: wl, count: wl.length });
      }
      if (s.length === 2 && m === "PATCH") { return updateWarranty(db, who, s[1], body); }
    }

    if (s[0] === "admin") {
      if (who.role !== "admin") { return fail(403, "FORBIDDEN", "Admin role required."); }
      if (s[1] === "applications" && s.length === 2 && m === "GET") {
        var apps = db.workers.filter(function (w) { return !p.query.status || w.application_status === p.query.status; })
          .sort(function (a, b) { return a.applied_at < b.applied_at ? 1 : -1; });
        return ok(200, { data: apps, count: apps.length });
      }
      if (s[1] === "applications" && s.length === 3 && m === "PATCH") { return reviewApplication(db, s[2], body); }
      if (s[1] === "incidents" && s.length === 2 && m === "GET") {
        return ok(200, { incidents: db.incidents.slice().reverse(), worker_reports: db.worker_reports.slice().reverse() });
      }
      if ((s[1] === "incidents" || s[1] === "worker-reports") && s.length === 3 && m === "PATCH") {
        if (!KAYA.CASE_STATUS_LABELS[body && body.status]) {
          return fail(400, "VALIDATION_ERROR", "Request has invalid fields.", [{ field: "status", issue: "must be OPEN, INVESTIGATING or RESOLVED" }]);
        }
        var item = s[1] === "incidents"
          ? setCaseStatus(db.incidents, "incident_id", s[2], body)
          : setCaseStatus(db.worker_reports, "report_id", s[2], body);
        if (!item) { return fail(404, "NOT_FOUND", "Case not found."); }
        save(db);
        return ok(200, item);
      }
      if (s[1] === "bookings" && m === "GET") {
        var all = db.bookings.filter(function (b) { return !p.query.status || b.status === p.query.status; })
          .sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });
        return ok(200, { data: all, count: all.length });
      }
      if (s[1] === "workers" && s[3] === "account" && m === "PATCH") { return setAccountStatus(db, s[2], body); }
      if (s[1] === "workers" && s[3] === "skills" && m === "PATCH") { return setSkills(db, s[2], body); }
      if (s[1] === "reports" && m === "GET") { return reports(db); }
    }

    return fail(404, "NOT_FOUND", "No route for " + m + " " + req.path);
  }

  /* ---------- Demo controls (not part of the public API) ---------- */

  function isDown() {
    try { return localStorage.getItem(OUTAGE_KEY) === "1"; } catch (e) { return false; }
  }

  function setDown(down) {
    try {
      if (down) { localStorage.setItem(OUTAGE_KEY, "1"); } else { localStorage.removeItem(OUTAGE_KEY); }
    } catch (e) { /* storage blocked */ }
  }

  function reset() {
    save(KAYA.seedWorkerManagement());
  }

  function listWorkerIds() {
    return load().workers.map(function (w) {
      return { worker_id: w.worker_id, full_name: w.full_name, application_status: w.application_status };
    });
  }

  return { handle: handle, isDown: isDown, setDown: setDown, reset: reset, listWorkerIds: listWorkerIds };
})();
