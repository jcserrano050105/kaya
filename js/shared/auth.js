/* KAYA Identity: accounts, sessions and role-based access control for every page.
   Load it in <head> right after contract.js, then call KAYA.Auth.guard(role) so a
   private page is never shown to the wrong person.

   Prototype note: this whole site runs in the browser, so these checks demonstrate
   the access rules. A production deployment must enforce them again on the server. */
KAYA.Auth = (function () {
  var DB_KEY = "kaya_auth_db";
  var SESSION_KEY = "kaya_session";
  var ATTEMPTS_KEY = "kaya_login_attempts";
  var SESSION_HOURS = { customer: 8, worker: 8, admin: 0.5 };
  var REMEMBER_DAYS = 14;
  var MAX_ATTEMPTS = 5;
  var LOCK_MINUTES = 5;
  var HASH_ROUNDS = 500;

  var HOME = {
    customer: "customer.html#dashboard",
    worker: "worker.html#dashboard",
    admin: "admin.html#dashboard"
  };

  var LOGIN_PAGE = { customer: "login.html", worker: "login.html", admin: "admin-login.html" };

  /* Which role owns each private page (used for guards and for safe ?next= redirects). */
  var PAGE_ROLES = {
    "customer.html": "customer", "book.html": "customer", "bookings.html": "customer",
    "booking.html": "customer", "search.html": "customer", "profile.html": "customer",
    "worker.html": "worker", "admin.html": "admin"
  };

  var ROLE_LABELS = { customer: "Customer", worker: "Worker", admin: "Admin" };

  var NAV = {
    public: [
      ["Home", "index.html"], ["Services", "services.html"], ["How It Works", "how-it-works.html"],
      ["Book a Service", "book.html"], ["Log In", "login.html"], ["Create Account", "register.html", "cta"]
    ],
    customer: [
      ["Dashboard", "customer.html#dashboard"], ["Book a Service", "book.html"], ["My Bookings", "bookings.html"],
      ["Track Service", "customer.html#track"], ["Payments", "customer.html#payments"],
      ["Warranty Requests", "customer.html#warranty"], ["Reviews", "customer.html#reviews"], ["Profile", "customer.html#profile"]
    ],
    worker: [
      ["Worker Dashboard", "worker.html#dashboard"], ["Booking Requests", "worker.html#requests"], ["My Schedule", "worker.html#schedule"],
      ["Estimates", "worker.html#estimates"], ["Service Progress", "worker.html#progress"], ["Payments", "worker.html#payments"],
      ["Warranty Requests", "worker.html#warranty"], ["Digital Work Passport", "worker.html#passport"], ["Profile", "worker.html#profile"]
    ],
    admin: [
      ["Admin Dashboard", "admin.html#dashboard"], ["Worker Applications", "admin.html#applications"], ["Users", "admin.html#users"],
      ["Services", "admin.html#services"], ["Bookings", "admin.html#bookings"], ["Complaints and Incidents", "admin.html#incidents"],
      ["Warranty Disputes", "admin.html#warranty"], ["Reports", "admin.html#reports"], ["Settings", "admin.html#settings"]
    ]
  };

  /* Pages that highlight another nav item. */
  var NAV_ALIASES = { "booking.html": "customer.html#track", "search.html": "book.html", "profile.html": "book.html" };

  var api = { ok: false, denied: false, required: null };

  /* ---------- SHA-256 (sync, for salted password hashes) ---------- */

  function sha256(ascii) {
    function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
    var maxWord = Math.pow(2, 32), i, j, result = "";
    var words = [], bitLength = ascii.length * 8;
    var hash = sha256.h = sha256.h || [];
    var k = sha256.k = sha256.k || [];
    var primeCounter = k.length;
    var isComposite = {};
    for (var candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (i = 0; i < 313; i += candidate) { isComposite[i] = candidate; }
        hash[primeCounter] = (Math.pow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    ascii += "\x80";
    while (ascii.length % 64 - 56) { ascii += "\x00"; }
    for (i = 0; i < ascii.length; i++) {
      j = ascii.charCodeAt(i);
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words.length] = (bitLength / maxWord) | 0;
    words[words.length] = bitLength;
    for (j = 0; j < words.length;) {
      var w = words.slice(j, j += 16);
      var oldHash = hash;
      hash = hash.slice(0, 8);
      for (i = 0; i < 64; i++) {
        var w15 = w[i - 15], w2 = w[i - 2];
        var a = hash[0], e = hash[4];
        var t1 = hash[7] + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & hash[5]) ^ ((~e) & hash[6])) + k[i] +
          (w[i] = (i < 16) ? w[i] : (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
        var t2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(t1 + t2) | 0].concat(hash);
        hash[4] = (hash[4] + t1) | 0;
      }
      for (i = 0; i < 8; i++) { hash[i] = (hash[i] + oldHash[i]) | 0; }
    }
    for (i = 0; i < 8; i++) {
      for (j = 3; j + 1; j--) {
        var b = (hash[i] >> (j * 8)) & 255;
        result += (b < 16 ? "0" : "") + b.toString(16);
      }
    }
    return result;
  }

  function utf8(s) { return unescape(encodeURIComponent(s)); }

  function hashPassword(password, salt) {
    var h = utf8(salt + ":" + password);
    for (var i = 0; i < HASH_ROUNDS; i++) { h = sha256(h + salt); }
    return h;
  }

  function randomHex(bytes) {
    var arr = new Uint8Array(bytes);
    if (window.crypto && window.crypto.getRandomValues) { window.crypto.getRandomValues(arr); }
    else { for (var i = 0; i < bytes; i++) { arr[i] = Math.floor(Math.random() * 256); } }
    return Array.prototype.map.call(arr, function (b) { return (b < 16 ? "0" : "") + b.toString(16); }).join("");
  }

  /* ---------- Storage ---------- */

  function nowIso() { return new Date().toISOString(); }

  function seedUser(db, role, email, name, phone, city, password, linkedId) {
    db.counters.user += 1;
    var salt = randomHex(16);
    db.users.push({
      user_id: "U" + String(db.counters.user).padStart(4, "0"),
      role: role, email: email, full_name: name, phone: phone, city: city,
      status: "ACTIVE", salt: salt, password_hash: hashPassword(password, salt),
      linked_id: linkedId, created_at: nowIso(), tokens: []
    });
  }

  function seed() {
    var db = { users: [], counters: { user: 0, customer: 1 } };
    seedUser(db, "customer", "maria@kaya.ph", "Maria Santos", "0917 555 0101", "Quezon City", "Customer@123", "C001");
    seedUser(db, "worker", "juan@kaya.ph", "Juan Dela Cruz", "0918 555 0114", "Quezon City", "Worker@123", "W014");
    seedUser(db, "worker", "ana@kaya.ph", "Ana Reyes", "0918 555 0121", "Quezon City", "Worker@123", "W021");
    seedUser(db, "worker", "ramon@kaya.ph", "Ramon Santos", "0918 555 0133", "Manila", "Worker@123", "W033");
    seedUser(db, "worker", "mark@kaya.ph", "Mark Aquino", "0918 555 0160", "Quezon City", "Worker@123", "W060");
    seedUser(db, "admin", "admin@kaya.ph", "KAYA Administrator", "", "", "Admin@2026!", "ADMIN01");
    return db;
  }

  function load() {
    try {
      var raw = localStorage.getItem(DB_KEY);
      if (raw) { return JSON.parse(raw); }
    } catch (e) { /* storage blocked or corrupted: reseed */ }
    var db = seed();
    save(db);
    return db;
  }

  function save(db) {
    try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (e) { /* storage blocked */ }
  }

  function readSession() {
    var raw = null;
    try { raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY); } catch (e) { return null; }
    if (!raw) { return null; }
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function writeSession(sess, remember) {
    try {
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(SESSION_KEY);
      (remember ? localStorage : sessionStorage).setItem(SESSION_KEY, JSON.stringify(sess));
    } catch (e) { /* storage blocked */ }
  }

  function clearSession() {
    try { sessionStorage.removeItem(SESSION_KEY); localStorage.removeItem(SESSION_KEY); } catch (e) { /* storage blocked */ }
  }

  function findUser(db, predicate) {
    for (var i = 0; i < db.users.length; i++) { if (predicate(db.users[i])) { return db.users[i]; } }
    return null;
  }

  function publicUser(u) {
    return {
      user_id: u.user_id, role: u.role, email: u.email, full_name: u.full_name,
      phone: u.phone, city: u.city, status: u.status, linked_id: u.linked_id, created_at: u.created_at
    };
  }

  /* The role always comes from the account record, never from the session object,
     so editing the session cannot grant another role. */
  function sessionUser() {
    if (SB) { return sbSessionUser(); }
    var sess = readSession();
    if (!sess || !sess.user_id || !sess.token) { return null; }
    if (Date.now() > sess.expires_at) { clearSession(); return null; }
    var db = load();
    var u = findUser(db, function (x) { return x.user_id === sess.user_id; });
    if (!u || u.status !== "ACTIVE" || u.tokens.indexOf(sess.token) === -1) { clearSession(); return null; }
    return u;
  }

  function current() {
    var u = sessionUser();
    return u ? publicUser(u) : null;
  }

  /* ---------- Validation helpers ---------- */

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var PHONE_RE = /^(09|\+639)\d{2}[\s-]?\d{3}[\s-]?\d{4}$/;

  function passwordStrength(pw) {
    pw = pw || "";
    var checks = {
      length: pw.length >= 8,
      upper: /[A-Z]/.test(pw),
      lower: /[a-z]/.test(pw),
      number: /\d/.test(pw),
      symbol: /[^A-Za-z0-9]/.test(pw)
    };
    var passed = Object.keys(checks).filter(function (k) { return checks[k]; }).length;
    var score = !pw ? 0 : pw.length < 8 ? 1 : passed <= 3 ? 2 : passed === 4 ? 3 : 4;
    if (score === 4 && pw.length >= 12) { score = 4; }
    return { score: score, label: ["", "Weak", "Fair", "Good", "Strong"][score], checks: checks };
  }

  function passwordError(pw) {
    var s = passwordStrength(pw);
    if (!s.checks.length) { return "Use at least 8 characters."; }
    if (!(s.checks.upper && s.checks.lower && s.checks.number)) { return "Include uppercase, lowercase and a number."; }
    return "";
  }

  function validateAccount(fields) {
    var errors = {};
    if (!fields.full_name || fields.full_name.trim().length < 2) { errors.full_name = "Enter your full name."; }
    if (!EMAIL_RE.test(fields.email || "")) { errors.email = "Enter a valid email address."; }
    if (fields.phone !== undefined && !PHONE_RE.test((fields.phone || "").trim())) { errors.phone = "Use a PH mobile number, e.g. 0917 123 4567."; }
    var pwErr = passwordError(fields.password);
    if (pwErr) { errors.password = pwErr; }
    if (fields.confirm !== undefined && fields.confirm !== fields.password) { errors.confirm = "Passwords do not match."; }
    return errors;
  }

  function emailTaken(email) {
    var e = (email || "").trim().toLowerCase();
    return !!findUser(load(), function (u) { return u.email === e; });
  }

  /* ---------- Login attempts (lockout) ---------- */

  function attempts() {
    try { return JSON.parse(localStorage.getItem(ATTEMPTS_KEY)) || {}; } catch (e) { return {}; }
  }

  function setAttempts(a) {
    try { localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(a)); } catch (e) { /* storage blocked */ }
  }

  function lockedError(key) {
    var rec = attempts()[key];
    if (rec && rec.lockedUntil && Date.now() < rec.lockedUntil) {
      var mins = Math.ceil((rec.lockedUntil - Date.now()) / 60000);
      return { ok: false, error: "Too many failed attempts. Try again in " + mins + " minute" + (mins > 1 ? "s" : "") + "." };
    }
    return null;
  }

  function failLogin(key) {
    var a = attempts();
    var rec = a[key];
    rec = rec && (!rec.lockedUntil || Date.now() >= rec.lockedUntil) ? rec : { count: 0 };
    rec.count = (rec.count || 0) + 1;
    if (rec.count >= MAX_ATTEMPTS) { rec.lockedUntil = Date.now() + LOCK_MINUTES * 60000; rec.count = 0; }
    a[key] = rec;
    setAttempts(a);
    var left = MAX_ATTEMPTS - (rec.count || MAX_ATTEMPTS);
    return { ok: false, error: rec.lockedUntil ? "Too many failed attempts. Try again in " + LOCK_MINUTES + " minutes." :
      "Incorrect email or password." + (left > 0 && left <= 2 ? " " + left + " attempt" + (left > 1 ? "s" : "") + " left." : "") };
  }

  function clearFailures(key) {
    var a = attempts();
    delete a[key];
    setAttempts(a);
  }

  /* ---------- Account actions ---------- */

  function startSession(db, u, remember) {
    var token = randomHex(24);
    u.tokens = (u.tokens || []).concat(token).slice(-5);
    u.last_login_at = nowIso();
    save(db);
    var hours = remember && u.role !== "admin" ? REMEMBER_DAYS * 24 : SESSION_HOURS[u.role];
    writeSession({ user_id: u.user_id, token: token, expires_at: Date.now() + hours * 3600 * 1000 }, remember && u.role !== "admin");
  }

  /* portal: "public" (customers and workers) or "admin". Errors stay generic so the
     form never reveals whether an email is registered or which portal it belongs to. */
  function login(email, password, opts) {
    opts = opts || {};
    var key = (email || "").trim().toLowerCase();
    var locked = lockedError(key);
    if (locked) { return locked; }
    var db = load();
    var u = findUser(db, function (x) { return x.email === key; });
    var portalOk = u && (opts.portal === "admin" ? u.role === "admin" : u.role !== "admin");
    var good = u && portalOk && hashPassword(password || "", u.salt) === u.password_hash;
    if (!good) { return failLogin(key); }
    if (u.status !== "ACTIVE") {
      return { ok: false, error: "This account is " + u.status.toLowerCase() + ". Please contact KAYA support." };
    }
    clearFailures(key);
    startSession(db, u, !!opts.remember);
    return { ok: true, user: publicUser(u) };
  }

  function createAccount(role, fields, linkedId) {
    var errors = validateAccount(fields);
    if (emailTaken(fields.email)) { errors.email = "An account with this email already exists. Try logging in."; }
    if (Object.keys(errors).length) { return { ok: false, errors: errors }; }
    var db = load();
    if (role === "customer") {
      db.counters.customer += 1;
      linkedId = "C" + String(db.counters.customer).padStart(3, "0");
    }
    db.counters.user += 1;
    var salt = randomHex(16);
    var u = {
      user_id: "U" + String(db.counters.user).padStart(4, "0"),
      role: role, email: fields.email.trim().toLowerCase(), full_name: fields.full_name.trim(),
      phone: (fields.phone || "").trim(), city: fields.city || "", status: "ACTIVE",
      salt: salt, password_hash: hashPassword(fields.password, salt),
      linked_id: linkedId, created_at: nowIso(), tokens: []
    };
    db.users.push(u);
    startSession(db, u, false);
    return { ok: true, user: publicUser(u) };
  }

  function logout(redirectTo) {
    var sess = readSession();
    if (sess) {
      var db = load();
      var u = findUser(db, function (x) { return x.user_id === sess.user_id; });
      if (u) { u.tokens = u.tokens.filter(function (t) { return t !== sess.token; }); save(db); }
    }
    clearSession();
    /* replace() keeps the private page out of the back-button history. */
    window.location.replace(redirectTo || "login.html?reason=logout");
  }

  function updateProfile(fields) {
    var me = sessionUser();
    if (!me) { return { ok: false, error: "Please log in again." }; }
    var errors = {};
    if (fields.full_name !== undefined && fields.full_name.trim().length < 2) { errors.full_name = "Enter your full name."; }
    if (fields.phone !== undefined && fields.phone && !PHONE_RE.test(fields.phone.trim())) { errors.phone = "Use a PH mobile number, e.g. 0917 123 4567."; }
    if (Object.keys(errors).length) { return { ok: false, errors: errors }; }
    var db = load();
    var u = findUser(db, function (x) { return x.user_id === me.user_id; });
    ["full_name", "phone", "city"].forEach(function (f) { if (fields[f] !== undefined) { u[f] = fields[f].trim(); } });
    save(db);
    return { ok: true, user: publicUser(u) };
  }

  function changePassword(oldPw, newPw) {
    var me = sessionUser();
    if (!me) { return { ok: false, error: "Please log in again." }; }
    if (hashPassword(oldPw || "", me.salt) !== me.password_hash) { return { ok: false, error: "Your current password is incorrect." }; }
    var err = passwordError(newPw);
    if (err) { return { ok: false, error: err }; }
    var db = load();
    var u = findUser(db, function (x) { return x.user_id === me.user_id; });
    var sess = readSession();
    u.salt = randomHex(16);
    u.password_hash = hashPassword(newPw, u.salt);
    u.tokens = u.tokens.filter(function (t) { return t === sess.token; }); /* sign out other devices */
    save(db);
    return { ok: true };
  }

  /* Prototype: no email service is connected. The reply is the same whether or not
     the account exists, so the form cannot be used to discover registered emails. */
  function requestPasswordReset(email) {
    return { ok: EMAIL_RE.test((email || "").trim()) };
  }

  /* ---------- Admin-only account management ---------- */

  function requireAdmin() {
    var me = sessionUser();
    return me && me.role === "admin" ? me : null;
  }

  function listUsers() {
    if (!requireAdmin()) { return []; }
    return load().users.map(publicUser);
  }

  function setUserStatus(userId, status) {
    var me = requireAdmin();
    if (!me) { return { ok: false, error: "Admin role required." }; }
    if (["ACTIVE", "SUSPENDED", "DEACTIVATED"].indexOf(status) === -1) { return { ok: false, error: "Unknown status." }; }
    if (userId === me.user_id) { return { ok: false, error: "You cannot change the status of your own account." }; }
    var db = load();
    var u = findUser(db, function (x) { return x.user_id === userId; });
    if (!u) { return { ok: false, error: "Account not found." }; }
    u.status = status;
    if (status !== "ACTIVE") { u.tokens = []; } /* ends every session of that account */
    save(db);
    return { ok: true, user: publicUser(u) };
  }

  function findByLinkedId(linkedId) {
    var u = findUser(load(), function (x) { return x.linked_id === linkedId; });
    return u ? publicUser(u) : null;
  }

  function reset() {
    clearSession();
    try { localStorage.removeItem(DB_KEY); localStorage.removeItem(ATTEMPTS_KEY); } catch (e) { /* storage blocked */ }
  }

  /* ---------- Supabase backend ----------
     Used when js/shared/supabase-config.js has created KAYA.supabase. Supabase holds
     the accounts and passwords; row-level security protects the data. The profile
     (role, status) is cached so guard() can run before the page renders, then
     re-checked against the database on every page load. */

  var SB = KAYA.supabase || null;
  var PROFILE_KEY = "kaya_sb_profile";
  var TAB_KEY = "kaya_sb_tab";

  function sbTokenUserId() {
    try {
      var t = JSON.parse(localStorage.getItem(KAYA.supabaseStorageKey));
      return t && t.user && t.user.id;
    } catch (e) { return null; }
  }

  function readCache() {
    try { return JSON.parse(localStorage.getItem(PROFILE_KEY)); } catch (e) { return null; }
  }

  function writeCache(user, remember) {
    remember = !!remember && user.role !== "admin";
    var hours = remember ? REMEMBER_DAYS * 24 : SESSION_HOURS[user.role];
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify({ user: user, remember: remember, expires_at: Date.now() + hours * 3600 * 1000 }));
      sessionStorage.setItem(TAB_KEY, "1");
    } catch (e) { /* storage blocked */ }
  }

  function updateCachedUser(user) {
    var c = readCache();
    if (!c) { return; }
    c.user = user;
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(c)); } catch (e) { /* storage blocked */ }
  }

  function clearCache() {
    try { localStorage.removeItem(PROFILE_KEY); sessionStorage.removeItem(TAB_KEY); } catch (e) { /* storage blocked */ }
  }

  function sbSessionUser() {
    var c = readCache();
    if (!c || !c.user) { return null; }
    var tabOk = c.remember || (function () { try { return !!sessionStorage.getItem(TAB_KEY); } catch (e) { return false; } })();
    if (Date.now() > c.expires_at || !tabOk || sbTokenUserId() !== c.user.user_id || c.user.status !== "ACTIVE") {
      clearCache();
      SB.auth.signOut({ scope: "local" });
      return null;
    }
    return c.user;
  }

  function toUser(row) {
    return {
      user_id: row.id, role: row.role, email: row.email || "", full_name: row.full_name || "",
      phone: row.phone || "", city: row.city || "", status: row.status,
      linked_id: row.linked_id || (row.role === "worker" ? "" : row.id), created_at: row.created_at
    };
  }

  function fetchProfile(id) {
    return SB.from("profiles").select("*").eq("id", id).single().then(function (r) {
      return r.data ? toUser(r.data) : null;
    });
  }

  /* Folder of the current page, for links in Supabase emails. */
  function siteBase() {
    return window.location.origin + window.location.pathname.replace(/[^/]*$/, "");
  }

  function sbLogin(email, password, opts) {
    opts = opts || {};
    var key = (email || "").trim().toLowerCase();
    var locked = lockedError(key);
    if (locked) { return Promise.resolve(locked); }
    return SB.auth.signInWithPassword({ email: key, password: password || "" }).then(function (r) {
      if (r.error) {
        if (/confirm/i.test(r.error.message)) {
          return { ok: false, error: "Please confirm your email first. Check your inbox for the link from KAYA." };
        }
        return failLogin(key);
      }
      return fetchProfile(r.data.user.id).then(function (u) {
        var portalOk = u && (opts.portal === "admin" ? u.role === "admin" : u.role !== "admin");
        if (!portalOk) { return SB.auth.signOut({ scope: "local" }).then(function () { return failLogin(key); }); }
        if (u.status !== "ACTIVE") {
          return SB.auth.signOut({ scope: "local" }).then(function () {
            return { ok: false, error: "This account is " + u.status.toLowerCase() + ". Please contact KAYA support." };
          });
        }
        clearFailures(key);
        writeCache(u, opts.remember);
        return { ok: true, user: u };
      });
    }).catch(function () {
      return { ok: false, error: "Can't reach the KAYA server. Check your connection and try again." };
    });
  }

  /* Sign-up verifies the email first (supabase/004_verify_email_first.sql):
     1. sbSendEmailCode emails a 6-digit code and creates an unfinished account
        (status INCOMPLETE, no password) if the email is new.
     2. sbVerifyEmailCode checks the code, which signs that unfinished account in.
     3. sbCreateAccount sets the password and calls complete_signup() to save the details. */

  var NET_ERROR = "Can't reach the KAYA server. Check your connection and try again.";

  function sbSendEmailCode(email) {
    var e = (email || "").trim().toLowerCase();
    if (!EMAIL_RE.test(e)) { return Promise.resolve({ ok: false, error: "Enter a valid email address." }); }
    return SB.auth.signInWithOtp({ email: e, options: { shouldCreateUser: true, data: { pending: true } } }).then(function (r) {
      if (!r.error) { return { ok: true }; }
      if (/rate|seconds|security purposes/i.test(r.error.message)) { return { ok: false, error: "Please wait a minute before asking for another code." }; }
      return { ok: false, error: r.error.message };
    }, function () { return { ok: false, error: NET_ERROR }; });
  }

  function sbVerifyEmailCode(email, code) {
    var e = (email || "").trim().toLowerCase();
    return SB.auth.verifyOtp({ email: e, token: code, type: "email" }).then(function (r) {
      if (r.error || !r.data.user) { return { ok: false, error: "That code is wrong or has expired. Check the email or send a new code." }; }
      return fetchProfile(r.data.user.id).then(function (u) {
        if (u && u.status !== "INCOMPLETE") {
          return SB.auth.signOut({ scope: "local" }).then(function () {
            return { ok: false, exists: true, error: "An account with this email already exists. Log in instead." };
          });
        }
        return { ok: true, email: e };
      });
    }, function () { return { ok: false, error: NET_ERROR }; });
  }

  /* The email already verified in this browser for an unfinished sign-up, or null. */
  function sbVerifiedEmail() {
    return SB.auth.getSession().then(function (r) {
      var session = r.data && r.data.session;
      if (!session) { return null; }
      return fetchProfile(session.user.id).then(function (u) {
        return u && u.status === "INCOMPLETE" ? session.user.email : null;
      });
    }, function () { return null; });
  }

  function sbCreateAccount(role, fields, linkedId, application) {
    var errors = validateAccount(fields);
    if (Object.keys(errors).length) { return Promise.resolve({ ok: false, errors: errors }); }
    var email = fields.email.trim().toLowerCase();
    var notVerified = { ok: false, errors: { email: "Verify your email address first." } };
    return SB.auth.getSession().then(function (r) {
      var session = r.data && r.data.session;
      if (!session || (session.user.email || "").toLowerCase() !== email) { return notVerified; }
      return SB.auth.updateUser({ password: fields.password }).then(function (pw) {
        if (pw.error) { return { ok: false, errors: { password: pw.error.message } }; }
        return SB.rpc("complete_signup", {
          p_role: role, p_full_name: fields.full_name.trim(), p_phone: (fields.phone || "").trim(),
          p_city: fields.city || "", p_application: application || null
        }).then(function (done) {
          if (done.error) {
            if (/ALREADY_COMPLETE/.test(done.error.message)) { return { ok: false, errors: { email: "An account with this email already exists. Try logging in." } }; }
            return { ok: false, errors: { email: done.error.message } };
          }
          var u = toUser(done.data);
          writeCache(u, false);
          return { ok: true, user: u };
        });
      });
    }).catch(function () {
      return { ok: false, errors: { email: NET_ERROR } };
    });
  }

  function sbLogout(redirectTo) {
    clearCache();
    var go = function () { window.location.replace(redirectTo || "login.html?reason=logout"); };
    SB.auth.signOut({ scope: "local" }).then(go, go);
  }

  function sbUpdateProfile(fields) {
    var me = sbSessionUser();
    if (!me) { return Promise.resolve({ ok: false, error: "Please log in again." }); }
    var errors = {};
    if (fields.full_name !== undefined && fields.full_name.trim().length < 2) { errors.full_name = "Enter your full name."; }
    if (fields.phone !== undefined && fields.phone && !PHONE_RE.test(fields.phone.trim())) { errors.phone = "Use a PH mobile number, e.g. 0917 123 4567."; }
    if (Object.keys(errors).length) { return Promise.resolve({ ok: false, errors: errors }); }
    var patch = {};
    ["full_name", "phone", "city"].forEach(function (f) { if (fields[f] !== undefined) { patch[f] = fields[f].trim(); } });
    return SB.from("profiles").update(patch).eq("id", me.user_id).select().single().then(function (r) {
      if (r.error) { return { ok: false, error: "Couldn't save your profile. Try again." }; }
      var u = toUser(r.data);
      updateCachedUser(u);
      return { ok: true, user: u };
    });
  }

  function sbChangePassword(oldPw, newPw) {
    var me = sbSessionUser();
    if (!me) { return Promise.resolve({ ok: false, error: "Please log in again." }); }
    var err = passwordError(newPw);
    if (err) { return Promise.resolve({ ok: false, error: err }); }
    return SB.auth.signInWithPassword({ email: me.email, password: oldPw || "" }).then(function (r) {
      if (r.error) { return { ok: false, error: "Your current password is incorrect." }; }
      return SB.auth.updateUser({ password: newPw }).then(function (u) {
        if (u.error) { return { ok: false, error: u.error.message }; }
        return SB.auth.signOut({ scope: "others" }).then(function () { return { ok: true }; });
      });
    });
  }

  /* Same reply whether or not the account exists. */
  function sbRequestPasswordReset(email) {
    var e = (email || "").trim();
    if (!EMAIL_RE.test(e)) { return Promise.resolve({ ok: false }); }
    return SB.auth.resetPasswordForEmail(e, { redirectTo: siteBase() + "login.html?reason=reset" })
      .then(function () { return { ok: true }; }, function () { return { ok: true }; });
  }

  function sbSetNewPassword(pw) {
    var err = passwordError(pw);
    if (err) { return Promise.resolve({ ok: false, error: err }); }
    return SB.auth.updateUser({ password: pw }).then(function (r) {
      if (r.error) { return { ok: false, error: r.error.message }; }
      return SB.auth.signOut({ scope: "global" }).then(function () { clearCache(); return { ok: true }; });
    });
  }

  function sbListUsers() {
    var me = sbSessionUser();
    if (!me || me.role !== "admin") { return Promise.resolve([]); }
    return SB.from("profiles").select("*").order("created_at").then(function (r) {
      return (r.data || []).map(toUser);
    });
  }

  function sbSetUserStatus(userId, status) {
    var me = sbSessionUser();
    if (!me || me.role !== "admin") { return Promise.resolve({ ok: false, error: "Admin role required." }); }
    if (["ACTIVE", "SUSPENDED", "DEACTIVATED"].indexOf(status) === -1) { return Promise.resolve({ ok: false, error: "Unknown status." }); }
    if (userId === me.user_id) { return Promise.resolve({ ok: false, error: "You cannot change the status of your own account." }); }
    return SB.from("profiles").update({ status: status }).eq("id", userId).select().single().then(function (r) {
      if (r.error || !r.data) { return { ok: false, error: "Account not found." }; }
      return { ok: true, user: toUser(r.data) };
    });
  }

  /* Admin "reset all data" clears the local demo data but keeps the Supabase sign-in. */
  function sbReset() {
    try { localStorage.removeItem(DB_KEY); localStorage.removeItem(ATTEMPTS_KEY); } catch (e) { /* storage blocked */ }
  }

  /* Re-check the cached profile against Supabase. Picks up a sign-in from an email
     link, a role or status change by an admin, and sessions ended elsewhere. */
  function sbVerify() {
    var cached = readCache();
    SB.auth.getSession().then(function (r) {
      var session = r.data && r.data.session;
      if (!session) {
        if (cached) { clearCache(); if (api.required && !api.soft) { window.location.replace(loginUrl(api.required, "expired")); } else { renderNav(); } }
        return;
      }
      fetchProfile(session.user.id).then(function (u) {
        if (!u) { return; }
        if (u.status === "INCOMPLETE") { return; } /* email verified, sign-up form not finished yet */
        if (u.status !== "ACTIVE") { sbLogout(loginUrl(u.role, "login")); return; }
        if (!cached || !cached.user || cached.user.user_id !== u.user_id) {
          if (api.recovering) { return; }
          writeCache(u, false);
          var page = pageName();
          if (page === "login.html" || page === "register.html" || page === "worker-register.html") {
            window.location.replace(homeFor(u.role));
          } else {
            window.location.reload();
          }
          return;
        }
        if (cached.user.role !== u.role) { updateCachedUser(u); window.location.reload(); return; }
        updateCachedUser(u);
        renderNav();
      });
    });
  }

  if (SB) {
    api.recovering = /type=recovery/.test(window.location.hash) || /reason=reset/.test(window.location.search);
    SB.auth.onAuthStateChange(function (event) {
      if (event === "PASSWORD_RECOVERY") {
        api.recovering = true;
        if (typeof api.onRecovery === "function") { api.onRecovery(); }
      }
    });
  }

  /* ---------- Routing ---------- */

  function pageName(path) {
    var p = (path || window.location.pathname).split("?")[0].split("#")[0];
    return p.substring(p.lastIndexOf("/") + 1) || "index.html";
  }

  function here() {
    return pageName() + window.location.search + window.location.hash;
  }

  /* Only same-site relative pages that belong to the user's role are accepted. */
  function safeNext(next, role) {
    if (!next || typeof next !== "string") { return HOME[role]; }
    if (!/^[a-z0-9-]+\.html([?#][^\s]*)?$/i.test(next)) { return HOME[role]; }
    var owner = PAGE_ROLES[pageName(next)];
    return owner === role ? next : HOME[role];
  }

  function homeFor(role) { return HOME[role] || "index.html"; }

  function loginUrl(role, reason) {
    return (LOGIN_PAGE[role] || "login.html") + "?next=" + encodeURIComponent(here()) + (reason ? "&reason=" + reason : "");
  }

  /* guard(role)            private page: redirect to login if signed out, deny other roles
     guard(role, {soft})    public page with a private part: never redirects (book.html)
     guard(null)            public page */
  function guard(role, opts) {
    opts = opts || {};
    api.required = role || null;
    api.soft = !!opts.soft;
    var root = document.documentElement;
    var user = sessionUser();
    if (!role) { api.ok = true; return true; }
    if (!user) {
      api.ok = false;
      if (opts.soft) { return false; }
      root.classList.add("auth-redirect");
      window.location.replace(loginUrl(role, "login"));
      return false;
    }
    if (user.role !== role) {
      api.ok = false;
      api.denied = true;
      root.classList.add("auth-denied");
      document.addEventListener("DOMContentLoaded", renderDenied);
      return false;
    }
    api.ok = true;
    return true;
  }

  function renderDenied() {
    var me = current();
    var main = document.querySelector("main");
    if (!main) { return; }
    var home = me ? HOME[me.role] : "index.html";
    main.innerHTML =
      '<section class="page"><div class="container"><div class="denied card">' +
      '<div class="denied__icon" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg></div>' +
      "<h1>Access denied</h1>" +
      "<p>You're signed in as a <strong>" + (me ? ROLE_LABELS[me.role] : "guest") + "</strong>. This page is only available to " +
      (api.required ? ROLE_LABELS[api.required].toLowerCase() + " accounts" : "authorized accounts") + ".</p>" +
      '<div class="btn-row" style="justify-content:center"><a class="btn btn--primary" href="' + home + '">Go to my dashboard</a>' +
      '<button class="btn btn--ghost" type="button" data-logout>Log out</button></div>' +
      "</div></div></section>";
    document.documentElement.classList.remove("auth-denied");
  }

  /* Re-check when the page comes back from the back/forward cache, when another tab
     logs out, and periodically for session expiry. */
  function watchSession() {
    if (!api.required || api.soft) { return; }
    function recheck(reason) {
      var u = sessionUser();
      if (!u) { window.location.replace(loginUrl(api.required, reason)); }
    }
    window.addEventListener("pageshow", function (e) { if (e.persisted) { recheck("login"); } });
    window.addEventListener("storage", function (e) {
      if (e.key === SESSION_KEY || e.key === DB_KEY || e.key === PROFILE_KEY || (SB && e.key === KAYA.supabaseStorageKey)) { recheck("logout"); }
    });
    setInterval(function () { recheck("expired"); }, 60000);
  }

  /* ---------- Navigation ---------- */

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function activeHref(items) {
    var page = pageName();
    var withHash = page + (window.location.hash || "");
    var alias = NAV_ALIASES[page];
    var hrefs = items.map(function (i) { return i[1]; });
    if (hrefs.indexOf(withHash) !== -1) { return withHash; }
    if (alias && hrefs.indexOf(alias) !== -1) { return alias; }
    if (hrefs.indexOf(page) !== -1) { return page; }
    for (var i = 0; i < hrefs.length; i++) { if (hrefs[i].split("#")[0] === page) { return hrefs[i]; } }
    return "";
  }

  function renderNav() {
    var nav = document.getElementById("main-nav");
    var header = document.querySelector(".site-header");
    if (!nav || !header) { return; }
    var me = current();
    var role = me ? me.role : "public";
    var items = NAV[role];
    var active = activeHref(items);

    var html = items.map(function (i) {
      var cls = (i[2] === "cta" ? "nav__cta" : "") + (i[1] === active ? " is-active" : "");
      return '<a href="' + i[1] + '"' + (cls.trim() ? ' class="' + cls.trim() + '"' : "") +
        (i[1] === active ? ' aria-current="page"' : "") + ">" + esc(i[0]) + "</a>";
    }).join("");
    if (me) { html += '<button class="nav__logout" type="button" data-logout>Log Out</button>'; }
    nav.innerHTML = html;

    header.classList.toggle("site-header--app", !!me);
    var chip = header.querySelector(".user-chip");
    if (me && !chip) {
      chip = document.createElement("div");
      chip.className = "user-chip";
      header.querySelector(".site-header__inner").insertBefore(chip, header.querySelector(".nav-toggle"));
    }
    if (me) {
      chip.innerHTML = '<span class="user-chip__avatar">' + esc(me.full_name.charAt(0)) + "</span>" +
        '<span class="user-chip__text"><strong>' + esc(me.full_name) + "</strong><small>" + ROLE_LABELS[me.role] + " account</small></span>";
    } else if (chip) {
      chip.remove();
    }
    var logo = header.querySelector(".logo");
    if (logo && me) { logo.setAttribute("href", HOME[me.role]); }
  }

  document.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest("[data-logout]");
    if (!btn) { return; }
    e.preventDefault();
    var me = current();
    api.logout(me && me.role === "admin" ? "admin-login.html?reason=logout" : "login.html?reason=logout");
  });

  document.addEventListener("DOMContentLoaded", function () {
    renderNav();
    watchSession();
    if (SB) { sbVerify(); }
  });
  window.addEventListener("hashchange", renderNav);

  api.guard = guard;
  api.current = current;
  api.backend = SB ? "supabase" : "local";
  api.login = SB ? sbLogin : login;
  api.logout = SB ? sbLogout : logout;
  api.registerCustomer = function (fields) { return (SB ? sbCreateAccount : createAccount)("customer", fields); };
  /* Supabase: the application travels with the sign-up and the database creates the worker record. */
  api.registerWorker = function (fields, workerId, application) { return (SB ? sbCreateAccount : createAccount)("worker", fields, workerId, application); };
  api.validateAccount = validateAccount;
  api.emailTaken = SB ? function () { return false; } : emailTaken;
  api.passwordStrength = passwordStrength;
  api.passwordError = passwordError;
  api.updateProfile = SB ? sbUpdateProfile : updateProfile;
  api.changePassword = SB ? sbChangePassword : changePassword;
  api.requestPasswordReset = SB ? sbRequestPasswordReset : requestPasswordReset;
  api.setNewPassword = sbSetNewPassword;
  api.sendEmailCode = sbSendEmailCode;
  api.verifyEmailCode = sbVerifyEmailCode;
  api.verifiedEmail = sbVerifiedEmail;
  api.listUsers = SB ? sbListUsers : listUsers;
  api.setUserStatus = SB ? sbSetUserStatus : setUserStatus;
  api.findByLinkedId = findByLinkedId;
  api.safeNext = safeNext;
  api.homeFor = homeFor;
  api.renderNav = renderNav;
  api.reset = SB ? sbReset : reset;
  api.ROLE_LABELS = ROLE_LABELS;
  api._sha256 = sha256;
  return api;
})();
