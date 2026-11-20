/* Log In, Create Customer Account, Register as a Worker and Admin Login screens. */
(function () {
  var ui = KAYA.ui;
  var Auth = KAYA.Auth;
  var page = document.body.getAttribute("data-page");
  var next = ui.param("next");
  var me = Auth.current();

  var SCENES = {
    login: ["plumbing", "electrical", "cleaning", "carpentry", "laundry", "gardening"],
    register: ["cleaning", "plumbing", "gardening", "electrical", "laundry", "carpentry"],
    "worker-register": ["carpentry", "electrical", "plumbing", "gardening", "cleaning", "laundry"],
    "admin-login": ["electrical", "carpentry", "plumbing"]
  };
  KAYA.Scenes.carousel(ui.$("#auth-bg"), SCENES[page], { interval: 5200 });
  ui.initPasswordFields();

  var REASONS = {
    login: ["Please log in to continue. That page is only available to signed-in users.", "info"],
    logout: ["You have been logged out securely.", "success"],
    expired: ["Your session expired. Please log in again.", "warn"],
    confirmed: ["Your email is confirmed. Log in to continue.", "success"]
  };

  function showReason() {
    var el = ui.$("#login-reason");
    var r = REASONS[ui.param("reason")];
    if (el && r) { ui.showMessage(el, r[0], r[1]); }
  }

  function withNext(href) {
    return next ? href + (href.indexOf("?") === -1 ? "?" : "&") + "next=" + encodeURIComponent(next) : href;
  }

  function blockedNotice(container, form, text) {
    container.hidden = false;
    container.innerHTML = '<p class="notice notice--warn">' + text + "</p>" +
      '<div class="btn-row"><a class="btn btn--primary" href="' + Auth.homeFor(me.role) + '">Go to my dashboard</a>' +
      '<button class="btn btn--ghost" type="button" data-logout>Log out</button></div>';
    form.hidden = true;
  }

  /* Supabase: the email must be verified with a 6-digit code before the sign-up form
     can be submitted. Adds a Verify button beside the email field and the code box
     under it. Returns { isVerified() }. */
  function emailVerifier(input) {
    var field = input.closest(".field");
    var row = document.createElement("div");
    row.className = "email-verify__row";
    input.parentNode.insertBefore(row, input);
    row.appendChild(input);
    var send = document.createElement("button");
    send.type = "button";
    send.className = "btn btn--ghost btn--small";
    send.textContent = "Verify";
    row.appendChild(send);

    var box = document.createElement("div");
    box.className = "email-verify";
    box.hidden = true;
    box.innerHTML =
      '<label for="' + input.id + '-code">Enter the 6-digit code we sent to your email</label>' +
      '<div class="email-verify__row"><input id="' + input.id + '-code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456">' +
      '<button type="button" class="btn btn--primary btn--small">Confirm</button></div>' +
      '<p class="small muted">Check your spam folder if it doesn’t arrive. <button type="button" class="linkish">Send a new code</button></p>';
    field.appendChild(box);
    var status = document.createElement("p");
    status.className = "email-verify__status small";
    status.setAttribute("aria-live", "polite");
    field.appendChild(status);

    var codeInput = box.querySelector("input");
    var confirmBtn = box.querySelector(".btn--primary");
    var resendBtn = box.querySelector(".linkish");
    var verified = "";

    function say(text, kind) {
      status.textContent = text;
      status.className = "email-verify__status small" + (kind ? " is-" + kind : "");
    }
    function markVerified(email) {
      verified = email;
      input.value = email;
      box.hidden = true;
      send.textContent = "Verified";
      send.disabled = true;
      say("✓ Email verified. You can finish signing up.", "ok");
    }
    function sendCode() {
      send.disabled = true;
      resendBtn.disabled = true;
      say("Sending a code…");
      Auth.sendEmailCode(input.value).then(function (res) {
        send.disabled = false;
        setTimeout(function () { resendBtn.disabled = false; }, 60000);
        if (!res.ok) { say(res.error, "error"); return; }
        box.hidden = false;
        codeInput.value = "";
        codeInput.focus();
        say("Code sent to " + input.value.trim() + ".", "");
      });
    }

    send.addEventListener("click", sendCode);
    resendBtn.addEventListener("click", sendCode);
    confirmBtn.addEventListener("click", function () {
      var code = codeInput.value.replace(/\s/g, "");
      if (!/^\d{6}$/.test(code)) { say("Enter the 6-digit code from the email.", "error"); codeInput.focus(); return; }
      confirmBtn.disabled = true;
      Auth.verifyEmailCode(input.value, code).then(function (res) {
        confirmBtn.disabled = false;
        if (!res.ok) { say(res.error, "error"); if (res.exists) { box.hidden = true; } return; }
        markVerified(res.email);
      });
    });
    codeInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); confirmBtn.click(); }
    });
    /* Changing the email after verifying means verifying again. */
    input.addEventListener("input", function () {
      if (verified && input.value.trim().toLowerCase() !== verified) {
        verified = "";
        send.textContent = "Verify";
        send.disabled = false;
        say("");
      }
    });
    Auth.verifiedEmail().then(function (email) { if (email) { markVerified(email); } });

    return { isVerified: function () { return !!verified && input.value.trim().toLowerCase() === verified; } };
  }

  /* Dates as YYYY-MM-DD in local time, for comparing with <input type="date"> values. */
  function isoDate(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function today() { return isoDate(new Date()); }
  function monthsAgo(n) { var d = new Date(); d.setMonth(d.getMonth() - n); return isoDate(d); }

  function fileName(sel) {
    var input = ui.$(sel);
    return input && input.files.length ? input.files[0].name : "";
  }

  function busy(form, on) {
    Array.prototype.forEach.call(form.querySelectorAll("button[type=submit]"), function (b) { b.disabled = on; });
  }

  /* ---------- Log in ---------- */

  if (page === "login") {
    if (me && me.role !== "admin" && !Auth.recovering) { window.location.replace(Auth.safeNext(next, me.role)); return; }
    showReason();

    /* Arriving from a Supabase password-reset email: ask for the new password. */
    function showRecovery() {
      if (ui.$("#recovery-form")) { return; }
      var view = ui.$("#login-view");
      ui.$("#forgot-view").hidden = true;
      view.hidden = true;
      var wrap = document.createElement("div");
      wrap.innerHTML =
        '<h1 class="auth__title">Set a new password</h1>' +
        '<form id="recovery-form" class="form" novalidate>' +
        '<div class="field"><label for="rc-password">New password</label>' +
        '<div class="pw-wrap"><input id="rc-password" type="password" data-field="password" autocomplete="new-password" required></div>' +
        '<div class="strength" data-strength-for="rc-password"></div></div>' +
        '<button class="btn btn--primary btn--block" type="submit">Save new password</button>' +
        '<div id="recovery-message" class="mt-2"></div></form>';
      view.parentNode.insertBefore(wrap, view);
      ui.initPasswordFields(wrap);
      ui.$("#recovery-form").addEventListener("submit", function (e) {
        e.preventDefault();
        var form = e.target;
        busy(form, true);
        Auth.setNewPassword(ui.$("#rc-password").value).then(function (res) {
          if (!res.ok) { busy(form, false); ui.fieldErrors(form, { password: res.error }); return; }
          window.location.replace("login.html?reason=reset-done");
        });
      });
    }
    REASONS["reset-done"] = ["Your password has been changed. Log in with your new password.", "success"];
    if (Auth.backend === "supabase") {
      Auth.onRecovery = showRecovery;
      if (Auth.recovering) { showRecovery(); }
    }
    ui.$("#to-register").href = withNext("register.html");

    ui.$("#login-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var form = e.target;
      var email = ui.$("#li-email").value.trim();
      var password = ui.$("#li-password").value;
      var ok = ui.fieldErrors(form, {
        email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? "" : "Enter the email address you registered with.",
        password: password ? "" : "Enter your password."
      });
      if (!ok) { return; }
      busy(form, true);
      Promise.resolve(Auth.login(email, password, { portal: "public", remember: ui.$("#li-remember").checked })).then(function (res) {
      if (!res.ok) {
        busy(form, false);
        ui.showMessage(ui.$("#login-message"), res.error, "error");
        ui.$("#li-password").value = "";
        ui.$("#li-password").focus();
        return;
      }
      ui.showMessage(ui.$("#login-message"), "Welcome back, " + res.user.full_name.split(" ")[0] + "! Redirecting…", "success");
      window.location.replace(Auth.safeNext(next, res.user.role));
      });
    });

    ui.$("#show-forgot").addEventListener("click", function () {
      ui.$("#login-view").hidden = true;
      ui.$("#forgot-view").hidden = false;
      ui.$("#fp-email").value = ui.$("#li-email").value;
      ui.$("#fp-email").focus();
    });
    ui.$("#back-login").addEventListener("click", function () {
      ui.$("#forgot-view").hidden = true;
      ui.$("#login-view").hidden = false;
    });
    ui.$("#forgot-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var form = e.target;
      var email = ui.$("#fp-email").value.trim();
      Promise.resolve(Auth.requestPasswordReset(email)).then(function (res) {
        if (!ui.fieldErrors(form, { email: res.ok ? "" : "Enter a valid email address." })) { return; }
        ui.showMessage(ui.$("#forgot-message"),
          "If an account exists for " + email + ", a password reset link is on its way. Check your inbox and spam folder." +
          (Auth.backend === "supabase" ? "" : " (Prototype: email delivery is not connected.)"), "success");
      });
    });
  }

  /* ---------- Create customer account ---------- */

  if (page === "register") {
    if (me) {
      if (me.role === "customer") { window.location.replace(Auth.safeNext(next || "book.html", "customer")); return; }
      blockedNotice(ui.$("#register-blocked"), ui.$("#register-form"),
        "You’re logged in with a " + Auth.ROLE_LABELS[me.role].toLowerCase() + " account. Log out first to create a customer account with a different email.");
    }
    ui.$("#to-login").href = withNext("login.html");
    ui.fillCitySelect(ui.$("#rg-city"), false);
    var rgVerifier = Auth.backend === "supabase" ? emailVerifier(ui.$("#rg-email")) : null;

    ui.$("#register-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var form = e.target;
      var fields = {
        full_name: ui.$("#rg-name").value,
        email: ui.$("#rg-email").value,
        phone: ui.$("#rg-phone").value,
        city: ui.$("#rg-city").value,
        password: ui.$("#rg-password").value,
        confirm: ui.$("#rg-confirm").value
      };
      var errors = Auth.validateAccount(fields);
      if (!errors.email && Auth.emailTaken(fields.email)) { errors.email = "An account with this email already exists. Try logging in."; }
      if (!errors.email && rgVerifier && !rgVerifier.isVerified()) { errors.email = "Verify your email address first."; }
      if (!ui.$("#rg-terms").checked) { errors.terms = "Please accept the Terms and Privacy Policy."; }
      if (!ui.fieldErrors(form, errors)) { return; }
      busy(form, true);
      Promise.resolve(Auth.registerCustomer(fields)).then(function (res) {
        if (!res.ok) {
          busy(form, false);
          ui.fieldErrors(form, res.errors);
          return;
        }
        ui.showMessage(ui.$("#register-message"), "Account created. Taking you to the booking form…", "success");
        window.location.replace(Auth.safeNext(next || "book.html", "customer"));
      });
    });
  }

  /* ---------- Register as a worker ---------- */

  if (page === "worker-register") {
    var form = ui.$("#worker-form");
    if (me) {
      if (me.role === "worker") { window.location.replace(Auth.homeFor("worker")); return; }
      blockedNotice(ui.$("#worker-blocked"), form,
        "You’re logged in with a " + Auth.ROLE_LABELS[me.role].toLowerCase() + " account. Worker accounts are separate: log out, then register with a different email.");
    }

    ui.fillCitySelect(ui.$("#wk-city"), false);
    var wkVerifier = Auth.backend === "supabase" ? emailVerifier(ui.$("#wk-email")) : null;
    ui.fillServiceSelect(ui.$("#wk-service"), false);
    var wanted = ui.param("service");
    if (wanted) { ui.$("#wk-service").value = wanted; }

    function renderSkills() {
      var service = KAYA.SERVICES.filter(function (s) { return s.id === ui.$("#wk-service").value; })[0];
      ui.$("#wk-skills").innerHTML = service.skills.map(function (sk, i) {
        return '<label class="chip" style="cursor:pointer"><input type="checkbox" value="' + sk + '"' + (i === 0 ? " checked" : "") + "> " + ui.esc(ui.skillLabel(sk)) + "</label>";
      }).join("");
    }
    ui.$("#wk-service").addEventListener("change", renderSkills);
    renderSkills();

    function account() {
      return {
        full_name: ui.$("#wk-name").value,
        email: ui.$("#wk-email").value,
        phone: ui.$("#wk-phone").value,
        password: ui.$("#wk-password").value,
        confirm: ui.$("#wk-confirm").value
      };
    }

    function goStep(n) {
      ui.$("#wk-step-1").hidden = n !== 1;
      ui.$("#wk-step-2").hidden = n !== 2;
      ui.$('[data-step-bar="2"]').classList.toggle("is-on", n === 2);
      (n === 1 ? ui.$("#wk-name") : ui.$("#wk-city")).focus();
    }

    ui.$("#wk-next").addEventListener("click", function () {
      var fields = account();
      var errors = Auth.validateAccount(fields);
      if (!errors.email && Auth.emailTaken(fields.email)) { errors.email = "An account with this email already exists. Try logging in."; }
      if (!errors.email && wkVerifier && !wkVerifier.isVerified()) { errors.email = "Verify your email address first."; }
      if (ui.fieldErrors(form, errors)) { goStep(2); }
    });
    ui.$("#wk-back").addEventListener("click", function () { goStep(1); });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var fields = account();
      var accountErrors = Auth.validateAccount(fields);
      if (!accountErrors.email && wkVerifier && !wkVerifier.isVerified()) { accountErrors.email = "Verify your email address first."; }
      if (Object.keys(accountErrors).length) { goStep(1); ui.fieldErrors(form, accountErrors); return; }

      var skills = Array.prototype.map.call(ui.$("#wk-skills").querySelectorAll("input:checked"), function (c) { return c.value; });
      var years = Number(ui.$("#wk-years").value);
      var errors = {
        skills: skills.length ? "" : "Choose at least one skill.",
        years_experience: years >= 0 && years <= 60 && ui.$("#wk-years").value !== "" ? "" : "Enter 0 to 60 years.",
        id_type: ui.$("#wk-idtype").value ? "" : "Choose the ID you will verify with.",
        id_file: ui.$("#wk-idfile").files.length ? "" : "Upload a photo of your ID.",
        nbi_number: /^[A-Za-z0-9-]{6,40}$/.test(ui.$("#wk-nbi-no").value.trim()) ? "" : "Enter the clearance number printed on your NBI clearance.",
        nbi_valid_until: !ui.$("#wk-nbi-until").value ? "Enter the validity date on your NBI clearance." :
          ui.$("#wk-nbi-until").value < today() ? "Your NBI clearance has expired. Renew it at clearance.nbi.gov.ph, then apply." : "",
        nbi_file: ui.$("#wk-nbi-file").files.length ? "" : "Upload a photo of your NBI clearance.",
        barangay_issued_on: !ui.$("#wk-brgy-date").value ? "Enter the date your barangay clearance was issued." :
          ui.$("#wk-brgy-date").value > today() ? "The issue date can't be in the future." :
          ui.$("#wk-brgy-date").value < monthsAgo(6) ? "Barangay clearance must be issued within the last 6 months." : "",
        barangay_file: ui.$("#wk-brgy-file").files.length ? "" : "Upload a photo of your barangay clearance.",
        consent: ui.$("#wk-consent").checked ? "" : "Please confirm to continue."
      };
      if (!ui.fieldErrors(form, errors)) { return; }

      busy(form, true);
      var out = ui.$("#worker-message");
      ui.showMessage(out, "Submitting your application…", "info");
      var application = {
        full_name: fields.full_name.trim(),
        city: ui.$("#wk-city").value,
        service_id: ui.$("#wk-service").value,
        skills: skills,
        years_experience: years,
        certificate: ui.$("#wk-cert").value.trim(),
        bio: ui.$("#wk-bio").value.trim(),
        id_type: ui.$("#wk-idtype").value,
        documents: {
          id_file_name: fileName("#wk-idfile"),
          nbi: { number: ui.$("#wk-nbi-no").value.trim().toUpperCase(), valid_until: ui.$("#wk-nbi-until").value, file_name: fileName("#wk-nbi-file") },
          barangay: { issued_on: ui.$("#wk-brgy-date").value, file_name: fileName("#wk-brgy-file") },
          tesda: fileName("#wk-tesda-file") ? { file_name: fileName("#wk-tesda-file") } : null,
          police: fileName("#wk-police-file") ? { file_name: fileName("#wk-police-file") } : null,
          medical: fileName("#wk-medical-file") ? { file_name: fileName("#wk-medical-file") } : null
        }
      };

      if (Auth.backend === "supabase") {
        fields.city = application.city;
        Auth.registerWorker(fields, null, application).then(function (res) {
          if (!res.ok) { busy(form, false); goStep(1); ui.fieldErrors(form, res.errors); ui.showMessage(out, "", "info"); return; }
          ui.showMessage(out, "Application submitted. Your account is Pending Verification. Opening your dashboard…", "success");
          window.location.replace("worker.html#dashboard");
        });
        return;
      }

      KAYA.PortalClient("worker", "").request("POST", "workers/applications", application).then(function (app) {
        fields.city = ui.$("#wk-city").value;
        return Promise.resolve(Auth.registerWorker(fields, app.worker_id)).then(function (res) {
        if (!res.ok) {
          busy(form, false);
          goStep(1);
          ui.fieldErrors(form, res.errors);
          ui.showMessage(out, "", "info");
          return;
        }
        ui.showMessage(out, "Application " + app.worker_id + " submitted. Your account is Pending Verification. Opening your dashboard…", "success");
        window.location.replace("worker.html#dashboard");
        });
      }).catch(function (err) {
        busy(form, false);
        ui.showMessage(out, ui.errorText(err), "error");
      });
    });
  }

  /* ---------- Admin login ---------- */

  if (page === "admin-login") {
    var adminForm = ui.$("#admin-form");
    if (me) {
      if (me.role === "admin") { window.location.replace(Auth.safeNext(next, "admin")); return; }
      blockedNotice(ui.$("#admin-blocked"), adminForm,
        "You’re logged in with a " + Auth.ROLE_LABELS[me.role].toLowerCase() + " account, which cannot access the Admin Console.");
    }
    showReason();

    adminForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = ui.$("#ad-email").value.trim();
      var password = ui.$("#ad-password").value;
      if (!ui.fieldErrors(adminForm, { email: email ? "" : "Enter your admin email.", password: password ? "" : "Enter your password." })) { return; }
      busy(adminForm, true);
      Promise.resolve(Auth.login(email, password, { portal: "admin" })).then(function (res) {
        if (!res.ok) {
          busy(adminForm, false);
          ui.showMessage(ui.$("#admin-message"), res.error, "error");
          ui.$("#ad-password").value = "";
          return;
        }
        window.location.replace(Auth.safeNext(next, "admin"));
      });
    });
  }
})();
