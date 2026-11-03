/* Customer and Booking System: integration client.
   All calls to the Worker Management API go through this module
   (Construction Standard: keep API-specific logic in one client module). */
KAYA.IntegrationClient = (function () {
  var CLIENT_KEY = "cb-system-key-v1";
  var REMOTE = KAYA.Auth && KAYA.Auth.backend === "supabase";
  var TIMEOUT_MS = REMOTE ? 15000 : 5000;
  var SIMULATED_LATENCY_MS = REMOTE ? 0 : 250;

  function ApiError(status, code, message, details) {
    this.status = status;
    this.code = code;
    this.message = message;
    this.details = details || [];
  }

  function newIdempotencyKey() {
    if (window.crypto && window.crypto.randomUUID) { return window.crypto.randomUUID(); }
    return "idem-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function request(method, path, body, extraHeaders) {
    var customer = KAYA.CustomerStore.customer();
    var headers = {
      "Content-Type": "application/json",
      "X-KAYA-Client-Key": CLIENT_KEY,
      "X-Customer-Id": customer.customer_id
    };
    for (var k in (extraHeaders || {})) { headers[k] = extraHeaders[k]; }

    var call = new Promise(function (resolve) {
      setTimeout(function () {
        /* JSON round-trip, like a real HTTP boundary. */
        Promise.resolve(KAYA.WorkerManagementAPI.handle({
          method: method,
          path: "/api/v1/" + path,
          headers: headers,
          body: body === undefined ? undefined : JSON.parse(JSON.stringify(body))
        })).then(function (res) { resolve(JSON.parse(JSON.stringify(res))); });
      }, SIMULATED_LATENCY_MS);
    });

    var timeout = new Promise(function (resolve) {
      setTimeout(function () { resolve({ status: 0, timedOut: true }); }, TIMEOUT_MS);
    });

    return Promise.race([call, timeout]).then(function (res) {
      if (res.timedOut) {
        throw new ApiError(0, "TIMEOUT", "Worker Management did not respond in time.");
      }
      if (res.status >= 200 && res.status < 300) { return res.body; }
      var e = res.body && res.body.error ? res.body.error : {};
      throw new ApiError(res.status, e.code || "UNKNOWN", e.message || "Unexpected error.", e.details);
    });
  }

  function query(params) {
    var parts = [];
    for (var k in params) {
      if (params[k]) { parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(params[k])); }
    }
    return parts.length ? "?" + parts.join("&") : "";
  }

  return {
    ApiError: ApiError,
    searchWorkers: function (params) { return request("GET", "workers" + query(params)); },
    getTrustProfile: function (workerId) { return request("GET", "workers/" + encodeURIComponent(workerId) + "/profile"); },
    reportWorker: function (workerId, payload) { return request("POST", "workers/" + encodeURIComponent(workerId) + "/reports", payload); },
    createBooking: function (payload, idempotencyKey) {
      return request("POST", "bookings", payload, { "Idempotency-Key": idempotencyKey });
    },
    newIdempotencyKey: newIdempotencyKey,
    listMyBookings: function () {
      return request("GET", "bookings" + query({ customer_id: KAYA.CustomerStore.customer().customer_id }));
    },
    getBooking: function (id) { return request("GET", "bookings/" + encodeURIComponent(id)); },
    cancelBooking: function (id) { return request("PATCH", "bookings/" + encodeURIComponent(id) + "/status", { status: "CANCELLED" }); },
    submitReview: function (id, payload) { return request("POST", "bookings/" + encodeURIComponent(id) + "/review", payload); },
    reportIncident: function (id, payload) { return request("POST", "bookings/" + encodeURIComponent(id) + "/incidents", payload); },
    decideEstimate: function (id, payload) { return request("POST", "bookings/" + encodeURIComponent(id) + "/estimate/decision", payload); },
    recordPayment: function (id, payload) { return request("POST", "bookings/" + encodeURIComponent(id) + "/payment", payload); },
    requestWarranty: function (id, payload) { return request("POST", "bookings/" + encodeURIComponent(id) + "/warranty", payload); },
    listMyWarranty: function () { return request("GET", "warranty"); },
    updateWarranty: function (id, payload) { return request("PATCH", "warranty/" + encodeURIComponent(id), payload); }
  };
})();
