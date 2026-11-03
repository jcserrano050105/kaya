/* Small UI helpers shared by all pages. */
KAYA.ui = (function () {
  function esc(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function $(sel, root) { return (root || document).querySelector(sel); }

  function param(name) { return new URLSearchParams(window.location.search).get(name); }

  function serviceName(id) {
    var s = KAYA.SERVICES.filter(function (x) { return x.id === id; })[0];
    return s ? s.name : id;
  }

  function skillLabel(skill) {
    return skill.replace(/_/g, " ").replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function formatDate(iso) {
    if (!iso) { return ""; }
    try {
      return new Date(iso).toLocaleString("en-PH", {
        timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit"
      });
    } catch (e) { return iso; }
  }

  /* "2026-11-10T09:00" (datetime-local, Manila time) -> "2026-11-10T09:00:00+08:00" */
  function toManilaIso(localValue) {
    if (!localValue) { return ""; }
    return localValue.length === 16 ? localValue + ":00+08:00" : localValue;
  }

  function statusBadge(status) {
    return '<span class="badge badge--' + esc(status.toLowerCase()) + '">' + esc(KAYA.STATUS_LABELS[status] || status) + "</span>";
  }

  function stars(rating) {
    var full = Math.round(rating);
    var out = "";
    for (var i = 1; i <= 5; i++) { out += i <= full ? "★" : "☆"; }
    return '<span class="stars" aria-label="' + esc(rating) + ' out of 5">' + out + "</span>";
  }

  function errorText(err) {
    if (!err) { return "Something went wrong."; }
    if (err.code === "TIMEOUT" || err.code === "SERVICE_UNAVAILABLE") {
      return "The worker system is not responding right now. Nothing was confirmed. Please try again in a moment.";
    }
    var msg = err.message || "Something went wrong.";
    if (err.details && err.details.length) {
      msg += " (" + err.details.map(function (d) { return d.field + ": " + d.issue; }).join("; ") + ")";
    }
    return msg;
  }

  function showMessage(el, text, kind) {
    el.textContent = text;
    el.className = "notice notice--" + (kind || "info");
    el.hidden = !text;
  }

  function fillServiceSelect(select, includeAny) {
    var html = includeAny ? '<option value="">Any service</option>' : "";
    KAYA.SERVICES.forEach(function (s) { html += '<option value="' + s.id + '">' + esc(s.name) + "</option>"; });
    select.innerHTML = html;
  }

  function fillCitySelect(select, includeAny) {
    var html = includeAny ? '<option value="">Any city</option>' : "";
    KAYA.CITIES.forEach(function (c) { html += '<option value="' + esc(c) + '">' + esc(c) + "</option>"; });
    select.innerHTML = html;
  }

  function initNavToggle() {
    var toggle = document.querySelector(".nav-toggle");
    var header = document.querySelector(".site-header");
    if (!toggle || !header) { return; }
    toggle.addEventListener("click", function () {
      var open = header.classList.toggle("nav-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    header.addEventListener("click", function (e) {
      if (e.target.closest(".nav a")) {
        header.classList.remove("nav-open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  document.addEventListener("DOMContentLoaded", initNavToggle);

  function peso(n) {
    return "₱" + Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  var toastTimer;
  function toast(text) {
    var el = document.getElementById("toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.className = "toast";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("is-show"); }, 3400);
  }

  /* Inputs carry data-field="email" etc.; errors is { email: "message" }. */
  function fieldErrors(form, errors) {
    errors = errors || {};
    var first = null;
    Array.prototype.forEach.call(form.querySelectorAll("[data-field]"), function (input) {
      var name = input.getAttribute("data-field");
      var msg = errors[name] || "";
      var holder = input.closest(".field");
      var out = holder && holder.querySelector(".field-error");
      if (!out && holder) {
        out = document.createElement("span");
        out.className = "field-error";
        out.id = (input.id || name) + "-error";
        holder.appendChild(out);
        input.setAttribute("aria-describedby", out.id);
      }
      if (out) { out.textContent = msg; }
      input.classList.toggle("is-invalid", !!msg);
      input.setAttribute("aria-invalid", msg ? "true" : "false");
      if (msg && !first) { first = input; }
    });
    if (first) { first.focus(); }
    return !first;
  }

  /* Adds a Show/Hide button to every .pw-wrap input, and a strength meter where
     an element [data-strength-for="inputId"] exists. */
  function initPasswordFields(root) {
    Array.prototype.forEach.call((root || document).querySelectorAll(".pw-wrap"), function (wrap) {
      var input = wrap.querySelector("input");
      if (!input || wrap.querySelector(".pw-toggle")) { return; }
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pw-toggle";
      btn.textContent = "Show";
      btn.setAttribute("aria-label", "Show password");
      btn.addEventListener("click", function () {
        var show = input.type === "password";
        input.type = show ? "text" : "password";
        btn.textContent = show ? "Hide" : "Show";
        btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
      });
      wrap.appendChild(btn);
    });
    Array.prototype.forEach.call((root || document).querySelectorAll("[data-strength-for]"), function (meter) {
      var input = document.getElementById(meter.getAttribute("data-strength-for"));
      meter.className = "strength";
      meter.innerHTML = '<div class="strength__bar" aria-hidden="true"><span></span><span></span><span></span><span></span></div>' +
        '<div class="strength__meta"><span class="strength__rules"><span data-rule="length">8+ characters</span><span data-rule="upper">Uppercase</span>' +
        '<span data-rule="lower">Lowercase</span><span data-rule="number">Number</span><span data-rule="symbol">Symbol</span></span>' +
        '<strong class="strength__label" aria-live="polite"></strong></div>';
      function update() {
        var s = KAYA.Auth.passwordStrength(input.value);
        meter.setAttribute("data-score", s.score);
        meter.querySelector(".strength__label").textContent = s.label ? "Strength: " + s.label : "";
        Array.prototype.forEach.call(meter.querySelectorAll("[data-rule]"), function (r) {
          r.classList.toggle("ok", !!s.checks[r.getAttribute("data-rule")]);
        });
      }
      input.addEventListener("input", update);
      update();
    });
  }

  /* Fade-in on scroll for .reveal elements, count-up for [data-count]. */
  function reveal() {
    function countUp(el) {
      var target = parseInt(el.getAttribute("data-count"), 10);
      var start = null;
      function tick(t) {
        if (!start) { start = t; }
        var p = Math.min(1, (t - start) / 1200);
        el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3)));
        if (p < 1) { requestAnimationFrame(tick); }
      }
      requestAnimationFrame(tick);
    }
    var els = document.querySelectorAll(".reveal:not(.is-visible), [data-count]");
    if (!("IntersectionObserver" in window)) {
      Array.prototype.forEach.call(els, function (el) {
        el.classList.add("is-visible");
        if (el.hasAttribute("data-count")) { el.textContent = el.getAttribute("data-count"); }
      });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) { return; }
        if (en.target.hasAttribute("data-count")) { countUp(en.target); } else { en.target.classList.add("is-visible"); }
        io.unobserve(en.target);
      });
    }, { threshold: 0.12 });
    Array.prototype.forEach.call(els, function (el) { io.observe(el); });
  }

  return {
    esc: esc, $: $, param: param, serviceName: serviceName, skillLabel: skillLabel,
    formatDate: formatDate, toManilaIso: toManilaIso, statusBadge: statusBadge, stars: stars,
    errorText: errorText, showMessage: showMessage, fillServiceSelect: fillServiceSelect,
    fillCitySelect: fillCitySelect, peso: peso, toast: toast, fieldErrors: fieldErrors,
    initPasswordFields: initPasswordFields, reveal: reveal
  };
})();
