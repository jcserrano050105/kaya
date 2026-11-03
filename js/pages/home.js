/* Public homepage: scene carousel, service preview, problem matching, sample profiles,
   tracker preview and emergency button. Nothing here reads private data. */
(function () {
  var ui = KAYA.ui;

  var ICON_BG = {
    plumbing: "#2554e8", electrical: "#f59e0b", cleaning: "#10b981",
    laundry: "#6366f1", carpentry: "#b45309", gardening: "#22c55e"
  };

  /* ---------- Illustrated avatars: data-avatar="bg,skin,hair,style" ---------- */

  function avatarSvg(spec) {
    var p = spec.split(",");
    var bg = p[0], skin = p[1], hair = p[2], style = p[3];
    var hairShape = {
      short: '<path d="M20 30c0-12 9-19 20-19s20 7 20 19c-4-6-11-9-20-9s-16 3-20 9z" fill="' + hair + '"/>',
      cap:   '<path d="M19 29c1-12 10-19 21-19s20 7 21 17z" fill="#ff9f1c"/><rect x="17" y="26" width="46" height="5" rx="2.5" fill="#e8860a"/>',
      long:  '<path d="M18 52V31c0-13 9-21 22-21s22 8 22 21v21l-6-4V30c-4-5-9-7-16-7s-12 2-16 7v18z" fill="' + hair + '"/>',
      bun:   '<circle cx="40" cy="9" r="7" fill="' + hair + '"/><path d="M20 31c0-12 9-19 20-19s20 7 20 19c-5-5-12-8-20-8s-15 3-20 8z" fill="' + hair + '"/>'
    }[style] || "";
    return '<svg viewBox="0 0 80 80" aria-hidden="true"><rect width="80" height="80" fill="' + bg + '"/>' +
      '<path d="M12 80c2-16 14-24 28-24s26 8 28 24z" fill="#2554e8"/>' +
      '<rect x="34" y="46" width="12" height="12" rx="4" fill="' + skin + '"/>' +
      '<circle cx="40" cy="34" r="17" fill="' + skin + '"/>' + hairShape +
      '<circle cx="34" cy="35" r="1.8" fill="#1f1a17"/><circle cx="46" cy="35" r="1.8" fill="#1f1a17"/>' +
      '<path d="M35 42c3 2.5 7 2.5 10 0" stroke="#5a3520" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';
  }

  function paintAvatars(root) {
    var els = (root || document).querySelectorAll("[data-avatar]");
    for (var i = 0; i < els.length; i++) {
      if (!els[i].querySelector(":scope > svg")) {
        els[i].insertAdjacentHTML("afterbegin", avatarSvg(els[i].getAttribute("data-avatar")));
      }
    }
  }

  /* ---------- Hero carousel + marquee ---------- */

  var caption = ui.$("#hero-caption");
  KAYA.Scenes.carousel(ui.$("#hero-bg"), ["hero"].concat(KAYA.Scenes.NAMES), {
    interval: 4800,
    onChange: function (name, label) { caption.textContent = label + " on KAYA"; }
  });

  var marqueeItems = KAYA.Catalog.all().map(function (s) {
    return '<a class="marquee__item" href="services.html#' + s.id + '"><span class="marquee__thumb">' + KAYA.Scenes.svg(s.id) + "</span>" +
      ui.esc(s.name) + " · from " + ui.peso(s.price).replace(".00", "") + "</a>";
  }).join("");
  ui.$("#marquee").innerHTML = marqueeItems + marqueeItems; /* duplicated for a seamless loop */
  Array.prototype.forEach.call(ui.$("#marquee").children, function (a, i) {
    if (i >= KAYA.SERVICES.length) { a.setAttribute("aria-hidden", "true"); a.tabIndex = -1; }
  });

  /* ---------- Services preview (from the admin-managed catalog) ---------- */

  ui.$("#service-grid").innerHTML = KAYA.Catalog.all().map(function (s) {
    return '<article class="service-card reveal">' +
      '<div class="service-card__art" style="height:150px">' + KAYA.Scenes.svg(s.id) + "</div>" +
      '<div class="service-card__body"><h3>' + ui.esc(s.name) + "</h3><p>" + ui.esc(s.description) + "</p>" +
      '<div class="service-card__foot"><div class="price"><small>Starts at</small><strong>' + ui.peso(s.price).replace(".00", "") + "</strong></div>" +
      (s.active
        ? '<a class="btn btn--ghost btn--small" href="book.html?service=' + s.id + '">Book this</a>'
        : '<span class="chip chip--warn">Temporarily unavailable</span>') +
      "</div></div></article>";
  }).join("");

  /* ---------- Problem-to-service matching ---------- */

  var SUGGESTIONS = {
    plumbing: "Faucet Repair", electrical: "Light Switch Replacement", cleaning: "Deep Cleaning",
    laundry: "Wash, Dry & Fold", carpentry: "Furniture & Shelf Repair", gardening: "Lawn & Plant Care"
  };

  function matchItem(icon, color, title, sub, score, extra) {
    return '<li class="match-item' + (extra || "") + '">' +
      '<span class="match-item__icon" style="background:' + color + '"><svg><use href="#i-' + icon + '"/></svg></span>' +
      "<div><strong>" + ui.esc(title) + "</strong><small>" + ui.esc(sub) + "</small></div>" +
      '<span class="score">' + ui.esc(score) + "</span></li>";
  }

  function runMatch(text) {
    var list = ui.$("#match-list");
    var cta = ui.$("#match-cta");
    var found = KAYA.SkillMatcher.matchAll(text);
    cta.href = "book.html?q=" + encodeURIComponent(text) + (found[0] ? "&service=" + found[0].service : "");
    if (!found.length) {
      list.innerHTML = matchItem("search", "#64748b", "No clear match yet", "Try words like leak, outlet, door, linis or labada.", "");
      return;
    }
    var html = found.slice(0, 3).map(function (f) {
      var name = KAYA.Catalog.get(f.service).name;
      return matchItem(f.service, ICON_BG[f.service], name.replace(" Work", "") + " – " + SUGGESTIONS[f.service],
        "Verified " + name.toLowerCase() + " workers available", f.score > 1 ? "Strong match" : "Match");
    }).join("");
    if (found.length > 1) {
      html += matchItem("aio", "#ff9f1c", "All-in-One Home Repair", "One multi-skilled worker for every task", "Recommended", " match-item--combo");
    }
    list.innerHTML = html;
  }

  ui.$("#match-form").addEventListener("submit", function (e) {
    e.preventDefault();
    runMatch(ui.$("#match-input").value);
  });

  ui.$("#hero-search").addEventListener("submit", function (e) {
    e.preventDefault();
    var text = ui.$("#hero-q").value.trim() || ui.$("#hero-q").placeholder.replace("…", "");
    ui.$("#match-input").value = text;
    runMatch(text);
    ui.$("#match").scrollIntoView({ behavior: "smooth" });
  });

  /* ---------- Sample trust profiles ---------- */

  var WORKERS = [
    { id: "W014", name: "Juan D.", city: "Quezon City", cats: ["plumbing"], skills: ["Plumbing", "Faucet Repair", "TESDA NC II"], years: 9, jobs: 86, rating: 4.8, available: true, avatar: "#cfe0ff,#b9784a,#1f1a17,cap" },
    { id: "W021", name: "Ana R.", city: "Quezon City", cats: ["cleaning"], skills: ["Cleaning", "Deep Cleaning", "Laundry"], years: 6, jobs: 132, rating: 4.9, available: true, avatar: "#ffe1ec,#d9a27c,#2b1d14,long" },
    { id: "W033", name: "Ramon S.", city: "Manila", cats: ["electrical"], skills: ["Electrical", "Wiring", "Outlet Repair"], years: 12, jobs: 57, rating: 4.7, available: true, avatar: "#fff1cc,#a96d43,#2a2a2a,short" },
    { id: "W038", name: "Liza M.", city: "Makati", cats: ["carpentry"], skills: ["Carpentry", "Furniture Repair"], years: 4, jobs: 23, rating: 4.5, available: true, avatar: "#e0e7ff,#c68b5e,#1f1a17,bun" },
    { id: "W042", name: "Pedro B.", city: "Pasig", cats: ["gardening"], skills: ["Gardening", "Lawn Mowing", "Tree Trimming"], years: 7, jobs: 45, rating: 4.6, available: false, avatar: "#d9f7e8,#9a6239,#111,short" },
    { id: "W051", name: "Grace N.", city: "Taguig", cats: ["cleaning"], skills: ["Cleaning", "Aircon Cleaning"], years: 5, jobs: 64, rating: 4.8, available: true, avatar: "#e6f4ff,#c68b5e,#3b2416,long" }
  ];

  function profileCard(w) {
    /* Full Trust Profiles are customer-only; the guard on profile.html sends guests to login. */
    var link = "profile.html?id=" + w.id + "&service=" + w.cats[0];
    return '<article class="profile-card">' +
      '<div class="profile-card__top">' +
        '<span class="photo" data-avatar="' + w.avatar + '"><span class="photo__check"><svg><use href="#i-check"/></svg></span></span>' +
        "<div><h3>" + ui.esc(w.name) + '</h3><div class="small muted">' + ui.esc(w.city) + "</div>" +
        '<span class="status-dot ' + (w.available ? "status-dot--on" : "status-dot--busy") + '">' + (w.available ? "Available today" : "Busy · next slot tomorrow") + "</span></div>" +
      "</div>" +
      '<span class="verified-badge"><svg><use href="#i-shield"/></svg>Identity Verified</span>' +
      '<div class="chips">' + w.skills.map(function (s) { return '<span class="chip chip--blue">' + ui.esc(s) + "</span>"; }).join("") + "</div>" +
      '<div class="mini-stats">' +
        "<div><strong>" + w.years + " yrs</strong><small>Experience</small></div>" +
        "<div><strong>" + w.jobs + "</strong><small>Jobs done</small></div>" +
        '<div><strong><span class="stars">★</span> ' + w.rating.toFixed(1) + "</strong><small>Rating</small></div>" +
      "</div>" +
      '<a class="btn btn--primary btn--block" href="' + link + '">View Profile</a>' +
      "</article>";
  }

  function renderProfiles(cat) {
    var grid = ui.$("#profile-grid");
    grid.innerHTML = WORKERS.filter(function (w) { return cat === "all" || w.cats.indexOf(cat) !== -1; }).map(profileCard).join("");
    paintAvatars(grid);
  }

  var wButtons = document.querySelectorAll("[data-wfilter]");
  Array.prototype.forEach.call(wButtons, function (btn) {
    btn.addEventListener("click", function () {
      Array.prototype.forEach.call(wButtons, function (b) {
        b.classList.toggle("is-active", b === btn);
        b.setAttribute("aria-pressed", b === btn ? "true" : "false");
      });
      renderProfiles(btn.getAttribute("data-wfilter"));
    });
  });
  renderProfiles("all");

  /* ---------- Tracker preview (auto-plays; no booking data) ---------- */

  var STEPS = [
    { label: "Pending", icon: "clock" }, { label: "Estimate Submitted", icon: "file" },
    { label: "Customer Approved", icon: "thumb" }, { label: "Accepted", icon: "handshake" },
    { label: "On the Way", icon: "truck" }, { label: "Arrived", icon: "pin" },
    { label: "In Progress", icon: "tool" }, { label: "Payment", icon: "wallet" }, { label: "Completed", icon: "check" }
  ];
  var BADGE_KIND = ["pending", "pending", "approved", "accepted", "on_the_way", "arrived", "in_progress", "in_progress", "completed"];
  var current = 0;

  function setTracker(index) {
    current = index % STEPS.length;
    ui.$("#timeline").innerHTML = STEPS.map(function (s, i) {
      var done = i < current || current === STEPS.length - 1;
      var cls = done ? "is-done" : (i === current ? "is-current" : "");
      return '<li class="' + cls + '"><span class="timeline__dot"><svg><use href="#i-' + (done ? "check" : s.icon) + '"/></svg></span>' + s.label + "</li>";
    }).join("");
    ui.$("#trk-bar").style.width = (current / (STEPS.length - 1) * 100) + "%";
    var badge = ui.$("#trk-badge");
    badge.className = "badge badge--" + BADGE_KIND[current];
    badge.textContent = STEPS[current].label;
  }

  setTracker(0);
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    setInterval(function () { setTracker(current + 1); }, 1800);
  }

  /* ---------- Emergency button ---------- */

  var fab = ui.$("#sos-fab");
  var sheet = ui.$("#sos-sheet");
  function closeSheet() { sheet.hidden = true; fab.setAttribute("aria-expanded", "false"); }
  fab.addEventListener("click", function () {
    sheet.hidden = !sheet.hidden;
    fab.setAttribute("aria-expanded", sheet.hidden ? "false" : "true");
  });
  document.addEventListener("click", function (e) {
    if (!sheet.hidden && !e.target.closest("#sos-sheet") && !e.target.closest("#sos-fab")) { closeSheet(); }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !sheet.hidden) { closeSheet(); fab.focus(); }
  });

  paintAvatars();
  runMatch(ui.$("#match-input").value);
  ui.reveal();
})();
