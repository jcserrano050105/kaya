/* Animated service illustrations (inline SVG) used for hero carousels, service cards
   and the login screens. Each scene shows a KAYA worker doing the job.
   Usage: <div data-scene="plumbing"></div>  then  KAYA.Scenes.mount();
          KAYA.Scenes.carousel(element, ["plumbing", "electrical", ...]);

   Photos: when images/<name>.jpg exists (e.g. images/plumbing.jpg, images/hero.jpg), it
   fades in over the illustration. A missing photo leaves the illustration showing. */
KAYA.Scenes = (function () {
  /* images/ sits next to js/, so it is found from this script's own address. */
  var PHOTO_BASE = (function () {
    var me = document.currentScript && document.currentScript.src;
    return me ? me.replace(/js\/shared\/scenes\.js.*$/, "images/") : "images/";
  })();
  var photoState = {}; /* name -> "loading" | "ok" | "missing" */
  var photoWaiting = {};

  /* Slides that only exist as photos borrow an illustration in case the photo is missing. */
  var STAND_IN = { hero: "electrical" };

  var LABELS = {
    plumbing: "A plumber repairing a kitchen faucet",
    electrical: "An electrician installing a ceiling light",
    cleaning: "A cleaner tidying and organizing a living room",
    laundry: "A laundry worker folding clothes beside a washing machine",
    carpentry: "A carpenter installing a wall shelf",
    gardening: "A gardener trimming a hedge",
    hero: "A KAYA worker helping a customer at home"
  };

  var CAPTIONS = {
    plumbing: "Plumbers", electrical: "Electricians", cleaning: "Cleaners",
    laundry: "Laundry workers", carpentry: "Carpenters", gardening: "Gardeners", hero: "Trusted help at home"
  };

  var NAVY = "#123B63", BLUE = "#2274A5", ORANGE = "#F28C28", ORANGE_D = "#d9761a";

  function hair(style, color) {
    switch (style) {
      case "cap":
        return '<path d="M-26 -204C-24 -234 24 -234 26 -204Z" fill="' + ORANGE + '"/><rect x="-28" y="-208" width="62" height="7" rx="3.5" fill="' + ORANGE_D + '"/>';
      case "hardhat":
        return '<path d="M-29 -205C-28 -240 28 -240 29 -205Z" fill="#facc15"/><rect x="-34" y="-209" width="68" height="8" rx="4" fill="#eab308"/><rect x="-4" y="-236" width="8" height="26" rx="4" fill="#fde047"/>';
      case "long":
        return '<path d="M-27 -168V-200C-27 -234 27 -234 27 -200V-168L18 -174V-204C10 -213 -10 -213 -18 -204V-174Z" fill="' + color + '"/>';
      case "bun":
        return '<circle cx="0" cy="-229" r="10" fill="' + color + '"/><path d="M-25 -200C-25 -232 25 -232 25 -200C18 -213 -18 -213 -25 -200Z" fill="' + color + '"/>';
      case "straw":
        return '<ellipse cx="0" cy="-210" rx="44" ry="9" fill="#d6a85a"/><path d="M-22 -210C-20 -238 20 -238 22 -210Z" fill="#e8c27a"/><rect x="-22" y="-216" width="44" height="5" fill="#16a34a"/>';
      default:
        return '<path d="M-25 -201C-25 -232 25 -232 25 -201C18 -213 -18 -213 -25 -201Z" fill="' + color + '"/>';
    }
  }

  /* Standing figure with its feet at (x, y). armL/armR are hand offsets from each shoulder. */
  function figure(o) {
    var skin = o.skin || "#b9784a";
    var shirt = o.shirt || BLUE;
    var pants = o.pants || "#1e293b";
    var aL = o.armL || [-12, 70], aR = o.armR || [12, 70];
    function arm(sx, a) {
      return '<path d="M' + sx + " -160L" + (sx + a[0]) + " " + (-160 + a[1]) + '" stroke="' + shirt + '" stroke-width="19" stroke-linecap="round"/>' +
        '<circle cx="' + (sx + a[0]) + '" cy="' + (-160 + a[1]) + '" r="9.5" fill="' + skin + '"/>';
    }
    return '<g class="sc-figure"><g transform="translate(' + o.x + " " + o.y + ") scale(" + (o.s || 1) + ')">' +
      '<rect x="-24" y="-92" width="20" height="90" rx="9" fill="' + pants + '"/>' +
      '<rect x="4" y="-92" width="20" height="90" rx="9" fill="' + pants + '"/>' +
      '<ellipse cx="-15" cy="0" rx="17" ry="7" fill="#111827"/><ellipse cx="15" cy="0" rx="17" ry="7" fill="#111827"/>' +
      arm(-30, aL) +
      '<rect x="-35" y="-174" width="70" height="92" rx="24" fill="' + shirt + '"/>' +
      '<rect x="-35" y="-104" width="70" height="10" fill="' + (o.belt || ORANGE) + '"/>' +
      '<rect x="10" y="-158" width="14" height="10" rx="3" fill="' + ORANGE + '"/>' +
      arm(30, aR) +
      '<rect x="-8" y="-184" width="16" height="14" fill="' + skin + '"/>' +
      '<circle cx="0" cy="-200" r="25" fill="' + skin + '"/>' +
      hair(o.hair, o.hairColor || "#1f1a17") +
      '<circle cx="-8" cy="-200" r="2.7" fill="#111"/><circle cx="8" cy="-200" r="2.7" fill="#111"/>' +
      '<path d="M-8 -189Q0 -183 8 -189" stroke="#5a3520" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
      "</g></g>";
  }

  function sparkle(x, y, r, delay) {
    return '<path class="sc-sparkle" style="animation-delay:' + delay + 's" d="M' + x + " " + (y - r) + "L" + (x + r * 0.3) + " " + (y - r * 0.3) +
      "L" + (x + r) + " " + y + "L" + (x + r * 0.3) + " " + (y + r * 0.3) + "L" + x + " " + (y + r) + "L" + (x - r * 0.3) + " " + (y + r * 0.3) +
      "L" + (x - r) + " " + y + "L" + (x - r * 0.3) + " " + (y - r * 0.3) + 'Z" fill="#fff7c2"/>';
  }

  function floor(color, line) {
    var s = '<rect x="0" y="430" width="800" height="70" fill="' + color + '"/>';
    for (var x = 0; x < 800; x += 110) { s += '<path d="M' + x + ' 430v70" stroke="' + line + '" stroke-width="2"/>'; }
    return s;
  }

  function plant(x, y) {
    return '<rect x="' + (x - 18) + '" y="' + (y - 40) + '" width="36" height="40" rx="8" fill="' + ORANGE + '"/>' +
      '<g class="sc-sway"><path d="M' + x + " " + (y - 40) + "c-20 -30 -6 -56 0 -62 6 6 20 32 0 62z" + '" fill="#22c55e"/>' +
      '<path d="M' + x + " " + (y - 38) + "c-30 -12 -34 -36 -31 -42 8 0 30 10 31 42z" + '" fill="#16a34a"/>' +
      '<path d="M' + x + " " + (y - 38) + "c30 -12 34 -36 31 -42 -8 0 -30 10 -31 42z" + '" fill="#16a34a"/></g>';
  }

  var SCENES = {
    plumbing: function () {
      var tiles = "";
      for (var x = 120; x <= 680; x += 40) { tiles += '<path d="M' + x + ' 150v150" stroke="#cdd9f7" stroke-width="2"/>'; }
      for (var y = 150; y <= 300; y += 40) { tiles += '<path d="M120 ' + y + 'h560" stroke="#cdd9f7" stroke-width="2"/>'; }
      return '<rect width="800" height="500" fill="#e4ecff"/>' +
        '<rect x="120" y="150" width="560" height="150" fill="#eef3ff"/>' + tiles +
        '<rect x="560" y="40" width="170" height="100" rx="12" fill="#fff"/><rect x="572" y="52" width="70" height="76" rx="6" fill="#bfe3ff"/><rect x="648" y="52" width="70" height="76" rx="6" fill="#bfe3ff"/>' +
        floor("#f1f5fb", "#e2e8f0") +
        '<rect x="110" y="296" width="580" height="22" rx="8" fill="' + NAVY + '"/>' +
        '<rect x="130" y="318" width="540" height="150" rx="10" fill="#fff"/>' +
        '<rect x="150" y="336" width="240" height="116" rx="8" fill="#f1f4fb"/><rect x="410" y="336" width="240" height="116" rx="8" fill="#f1f4fb"/>' +
        '<rect x="370" y="384" width="6" height="22" rx="3" fill="#c7d0e6"/><rect x="424" y="384" width="6" height="22" rx="3" fill="#c7d0e6"/>' +
        '<rect x="330" y="288" width="170" height="12" rx="6" fill="#cbd5e1"/>' +
        '<path d="M420 288V232Q420 212 440 212H458Q474 212 474 228V240" stroke="#94a3b8" stroke-width="12" fill="none" stroke-linecap="round"/>' +
        '<circle class="sc-drip" cx="474" cy="254" r="5" fill="#38bdf8"/>' +
        plant(80, 300) +
        figure({ x: 290, y: 470, armR: [100, -42], armL: [-14, 72], hair: "cap", skin: "#b9784a" }) +
        '<path d="M418 268L448 240" stroke="#64748b" stroke-width="9" stroke-linecap="round"/><path d="M442 232a11 11 0 1 1 15 15l-7 -2 -2 -6z" fill="#64748b"/>' +
        '<rect x="520" y="420" width="104" height="44" rx="8" fill="' + ORANGE + '"/><rect x="520" y="420" width="104" height="13" rx="6" fill="' + ORANGE_D + '"/>' +
        '<path d="M552 420v-12h40v12" fill="none" stroke="' + NAVY + '" stroke-width="5" stroke-linejoin="round"/>';
    },

    electrical: function () {
      var rungs = "";
      for (var y = 250; y <= 460; y += 42) { rungs += '<path d="M318 ' + y + 'h76" stroke="#94a3b8" stroke-width="7" stroke-linecap="round"/>'; }
      return '<rect width="800" height="500" fill="#e6ecff"/><rect width="800" height="44" fill="#cdd8f5"/>' +
        floor("#eef2fa", "#dfe5f1") +
        '<rect x="560" y="300" width="200" height="90" rx="22" fill="#94a3c4"/><rect x="545" y="340" width="230" height="70" rx="20" fill="#7d8db3"/><rect x="560" y="410" width="12" height="22" fill="#5b6b8f"/><rect x="748" y="410" width="12" height="22" fill="#5b6b8f"/>' +
        '<rect x="120" y="90" width="120" height="90" rx="8" fill="#fff"/><rect x="132" y="102" width="96" height="66" rx="4" fill="#ffd8a8"/>' +
        '<circle class="sc-glow" cx="500" cy="168" r="80" fill="#fde68a"/>' +
        '<path d="M500 44V118" stroke="#334155" stroke-width="3"/>' +
        '<path d="M466 150H534L518 118H482Z" fill="' + NAVY + '"/><circle cx="500" cy="158" r="11" fill="#fef3c7"/>' +
        '<path d="M310 470L330 220M402 470L382 220" stroke="#94a3b8" stroke-width="9" stroke-linecap="round"/>' + rungs +
        figure({ x: 356, y: 334, s: 0.82, armR: [92, -60], armL: [-30, 30], hair: "hardhat", skin: "#a96d43", belt: "#facc15" }) +
        '<rect x="640" y="200" width="22" height="34" rx="5" fill="#fff" stroke="#cbd5e1" stroke-width="2"/><circle cx="651" cy="212" r="2.5" fill="#94a3b8"/><circle cx="651" cy="222" r="2.5" fill="#94a3b8"/>';
    },

    cleaning: function () {
      return '<rect width="800" height="500" fill="#e3f6ef"/>' + floor("#f5efe6", "#eadfcf") +
        '<rect x="90" y="90" width="120" height="90" rx="6" fill="#fff" stroke="#cbd5e1" stroke-width="4"/><path d="M104 166l30 -36 22 22 18 -16 22 30z" fill="#86efac"/><circle cx="180" cy="116" r="10" fill="#fde68a"/>' +
        '<rect x="520" y="160" width="210" height="12" rx="4" fill="#b45309"/><rect x="520" y="250" width="210" height="12" rx="4" fill="#b45309"/>' +
        '<rect x="536" y="112" width="18" height="48" rx="3" fill="#2554e8"/><rect x="558" y="120" width="16" height="40" rx="3" fill="' + ORANGE + '"/><rect x="578" y="108" width="20" height="52" rx="3" fill="#10b981"/>' +
        '<rect x="650" y="132" width="50" height="28" rx="6" fill="#e0e7ff"/>' +
        '<rect x="540" y="214" width="60" height="36" rx="6" fill="#fde68a"/><rect x="620" y="200" width="18" height="50" rx="3" fill="#8b5cf6"/><rect x="642" y="206" width="18" height="44" rx="3" fill="#2554e8"/>' +
        plant(700, 250) +
        '<path d="M405 230L445 452" stroke="#a16207" stroke-width="7" stroke-linecap="round"/><ellipse cx="452" cy="456" rx="40" ry="10" fill="#93c5fd"/>' +
        figure({ x: 330, y: 470, armR: [74, 32], armL: [-58, -30], hair: "bun", skin: "#c68b5e", hairColor: "#2b1d14", shirt: "#0d9488" }) +
        '<rect x="232" y="252" width="20" height="34" rx="6" fill="#38bdf8"/><rect x="236" y="240" width="12" height="14" rx="3" fill="#0ea5e9"/>' +
        '<path d="M496 410h64l-8 56h-48z" fill="#2554e8"/><path d="M500 410q28 -26 56 0" stroke="#1a3fb8" stroke-width="4" fill="none"/>' +
        sparkle(560, 300, 14, 0) + sparkle(620, 340, 10, 0.6) + sparkle(470, 320, 9, 1.1) + sparkle(200, 220, 11, 0.3) + sparkle(680, 300, 8, 1.4);
    },

    laundry: function () {
      var shirts = "";
      [[110, "#f472b6"], [190, "#38bdf8"], [270, "#facc15"], [350, "#a78bfa"]].forEach(function (s, i) {
        shirts += '<g class="sc-sway" style="animation-delay:' + (i * 0.4) + 's"><path d="M' + (s[0] - 22) + " " + (94 - i * 5) + "l-14 10 6 16h10v34h40v-34h10l6 -16 -14 -10a14 14 0 0 1 -44 0z" + '" fill="' + s[1] + '"/></g>';
      });
      return '<rect width="800" height="500" fill="#ede9fe"/>' + floor("#f5f3ff", "#e4defc") +
        '<path d="M60 92Q250 112 440 72" stroke="#64748b" stroke-width="3" fill="none"/>' + shirts +
        '<rect x="480" y="270" width="170" height="196" rx="16" fill="#fff" stroke="#c7d2fe" stroke-width="3"/>' +
        '<rect x="480" y="270" width="170" height="40" rx="16" fill="#e0e7ff"/><circle cx="510" cy="290" r="7" fill="#6366f1"/><rect x="590" y="284" width="40" height="12" rx="6" fill="#a5b4fc"/>' +
        '<circle cx="565" cy="386" r="56" fill="#bfdbfe" stroke="#94a3b8" stroke-width="9"/>' +
        '<g class="sc-spin"><circle cx="565" cy="386" r="44" fill="none"/><path d="M540 380q14 -24 34 -6 12 14 -6 26q-16 8 -28 -20z" fill="#f472b6"/><path d="M570 404q20 -6 22 -24" stroke="#fff" stroke-width="10" stroke-linecap="round" fill="none"/></g>' +
        figure({ x: 260, y: 470, armR: [52, 6], armL: [-52, 6], hair: "long", skin: "#d9a27c", hairColor: "#2b1d14", shirt: "#6366f1" }) +
        '<rect x="110" y="326" width="300" height="16" rx="6" fill="' + NAVY + '"/><rect x="130" y="342" width="12" height="124" fill="' + NAVY + '"/><rect x="378" y="342" width="12" height="124" fill="' + NAVY + '"/>' +
        '<path d="M214 300h92l-6 26h-80z" fill="#facc15"/><path d="M244 300l16 14 16 -14" stroke="#eab308" stroke-width="3" fill="none"/>' +
        '<rect x="320" y="306" width="70" height="10" rx="3" fill="#38bdf8"/><rect x="324" y="296" width="62" height="10" rx="3" fill="#f472b6"/><rect x="318" y="316" width="74" height="10" rx="3" fill="#a78bfa"/>' +
        '<path d="M672 420h96l-10 48h-76z" fill="#d6a85a"/><path d="M684 420q36 -30 72 0" fill="#fff"/>';
    },

    carpentry: function () {
      return '<rect width="800" height="500" fill="#fdf0e1"/>' + floor("#f3e3cf", "#e6cfb1") +
        '<g transform="rotate(-8 120 300)"><rect x="80" y="160" width="26" height="270" rx="4" fill="#d6a85a"/><rect x="112" y="150" width="26" height="280" rx="4" fill="#c08a4a"/></g>' +
        '<rect x="440" y="196" width="240" height="18" rx="4" fill="#92400e"/>' +
        '<path d="M470 214v26h20" stroke="#475569" stroke-width="6" fill="none"/><path d="M650 214v26h-20" stroke="#475569" stroke-width="6" fill="none"/>' +
        '<rect x="560" y="174" width="80" height="18" rx="4" fill="#facc15"/><rect x="590" y="178" width="20" height="10" rx="5" fill="#bbf7d0"/><circle class="sc-bubble" cx="598" cy="183" r="3.5" fill="#22c55e"/>' +
        '<rect x="470" y="150" width="20" height="46" rx="3" fill="#2554e8"/><rect x="494" y="160" width="18" height="36" rx="3" fill="#10b981"/>' +
        '<rect x="420" y="300" width="300" height="120" rx="10" fill="#fff" opacity=".6"/>' +
        figure({ x: 330, y: 470, armR: [96, -96], armL: [64, -60], hair: "cap", skin: "#9a6239" }) +
        '<g class="sc-buzz"><rect x="404" y="188" width="46" height="22" rx="6" fill="' + NAVY + '"/><rect x="420" y="206" width="14" height="30" rx="4" fill="' + ORANGE + '"/><path d="M450 199h16" stroke="#94a3b8" stroke-width="4" stroke-linecap="round"/></g>' +
        '<circle class="sc-dust" cx="470" cy="210" r="3" fill="#d6a85a"/><circle class="sc-dust" style="animation-delay:.5s" cx="476" cy="204" r="2.5" fill="#d6a85a"/>';
    },

    gardening: function () {
      var fence = "";
      for (var x = 0; x < 800; x += 46) { fence += '<rect x="' + x + '" y="270" width="34" height="120" rx="6" fill="#fff" opacity=".8"/>'; }
      return '<rect width="800" height="500" fill="#dff1ff"/>' +
        '<circle class="sc-sun" cx="680" cy="90" r="42" fill="#ffd166"/>' +
        '<g class="sc-cloud"><ellipse cx="160" cy="90" rx="60" ry="22" fill="#fff"/><ellipse cx="200" cy="76" rx="40" ry="22" fill="#fff"/></g>' +
        '<g class="sc-cloud" style="animation-delay:-6s"><ellipse cx="460" cy="60" rx="50" ry="18" fill="#fff"/></g>' +
        fence + '<rect x="0" y="300" width="800" height="12" fill="#fff" opacity=".8"/>' +
        '<rect x="0" y="390" width="800" height="110" fill="#86efac"/><rect x="0" y="390" width="800" height="14" fill="#4ade80"/>' +
        '<g class="sc-sway"><ellipse cx="560" cy="350" rx="80" ry="60" fill="#16a34a"/><ellipse cx="660" cy="340" rx="80" ry="70" fill="#22c55e"/><ellipse cx="750" cy="352" rx="70" ry="58" fill="#16a34a"/></g>' +
        '<rect x="80" y="380" width="44" height="46" rx="8" fill="' + ORANGE + '"/>' +
        '<g class="sc-sway"><path d="M102 380v-50" stroke="#16a34a" stroke-width="4"/><circle cx="102" cy="324" r="12" fill="#f472b6"/><circle cx="102" cy="324" r="5" fill="#fde68a"/>' +
        '<path d="M102 360q-20 -6 -24 -20" stroke="#16a34a" stroke-width="4" fill="none"/></g>' +
        figure({ x: 340, y: 470, armR: [118, -10], armL: [92, 0], hair: "straw", skin: "#a96d43", shirt: "#15803d" }) +
        '<path d="M486 296l40 -16M486 306l40 8" stroke="#64748b" stroke-width="6" stroke-linecap="round"/>' +
        '<ellipse class="sc-leaf" cx="520" cy="300" rx="6" ry="3" fill="#22c55e"/><ellipse class="sc-leaf" style="animation-delay:1s" cx="540" cy="290" rx="5" ry="3" fill="#16a34a"/>';
    }
  };

  function svg(name, extraClass) {
    var draw = SCENES[name] || SCENES[STAND_IN[name]];
    if (!draw) { return ""; }
    return '<svg class="scene' + (extraClass ? " " + extraClass : "") + '" viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice" role="img" aria-label="' +
      LABELS[name] + '">' + draw() + "</svg>" +
      '<span class="photo-layer" data-photo="' + name + '" role="img" aria-label="' + LABELS[name] + '"></span>';
  }

  /* ---------- Photos ---------- */

  function showPhoto(layer, name) {
    layer.style.backgroundImage = 'url("' + PHOTO_BASE + name + '.jpg")';
    layer.classList.add("is-loaded");
    if (layer.parentNode) { layer.parentNode.classList.add("has-photo"); }
  }

  function loadPhoto(name, done) {
    if (photoState[name] === "ok" || photoState[name] === "missing") { done(photoState[name] === "ok"); return; }
    (photoWaiting[name] = photoWaiting[name] || []).push(done);
    if (photoState[name] === "loading") { return; }
    photoState[name] = "loading";
    var img = new Image();
    img.onload = function () { photoState[name] = "ok"; photoWaiting[name].forEach(function (cb) { cb(true); }); };
    img.onerror = function () { photoState[name] = "missing"; photoWaiting[name].forEach(function (cb) { cb(false); }); };
    img.src = PHOTO_BASE + name + ".jpg";
  }

  function applyPhotos(root) {
    var layers = (root || document).querySelectorAll(".photo-layer[data-photo]:not([data-photo-done])");
    Array.prototype.forEach.call(layers, function (layer) {
      layer.setAttribute("data-photo-done", "");
      var name = layer.getAttribute("data-photo");
      loadPhoto(name, function (ok) { if (ok) { showPhoto(layer, name); } });
    });
  }

  /* Pages build their cards with innerHTML, so photo layers are picked up as they appear. */
  if (window.MutationObserver) {
    new MutationObserver(function () { applyPhotos(document); })
      .observe(document.documentElement, { childList: true, subtree: true });
  }
  document.addEventListener("DOMContentLoaded", function () { applyPhotos(document); });

  function mount(root) {
    var els = (root || document).querySelectorAll("[data-scene]");
    for (var i = 0; i < els.length; i++) {
      if (!els[i].querySelector("svg.scene")) {
        els[i].insertAdjacentHTML("afterbegin", svg(els[i].getAttribute("data-scene")));
      }
    }
  }

  /* Cross-fading carousel with a slow zoom. Pauses while the tab is hidden. */
  function carousel(el, names, opts) {
    opts = opts || {};
    names = names || Object.keys(SCENES);
    var interval = opts.interval || 4500;
    el.classList.add("scene-carousel");
    el.innerHTML = names.map(function (n, i) {
      return '<div class="scene-slide' + (i === 0 ? " is-active" : "") + '" data-name="' + n + '">' + svg(n) + "</div>";
    }).join("") + (opts.dots ? '<div class="scene-dots">' + names.map(function (n, i) {
      return '<button type="button" aria-label="Show ' + CAPTIONS[n] + '"' + (i === 0 ? ' class="is-active"' : "") + "></button>";
    }).join("") + "</div>" : "");

    var slides = el.querySelectorAll(".scene-slide");
    var dots = el.querySelectorAll(".scene-dots button");
    var index = 0;
    var timer = null;

    function show(i) {
      index = (i + slides.length) % slides.length;
      for (var j = 0; j < slides.length; j++) {
        slides[j].classList.toggle("is-active", j === index);
        if (dots[j]) { dots[j].classList.toggle("is-active", j === index); }
      }
      if (opts.onChange) { opts.onChange(names[index], CAPTIONS[names[index]], index); }
    }

    function start() {
      if (timer || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { return; }
      timer = setInterval(function () { show(index + 1); }, interval);
    }

    function stop() { clearInterval(timer); timer = null; }

    Array.prototype.forEach.call(dots, function (d, i) {
      d.addEventListener("click", function () { stop(); show(i); start(); });
    });
    document.addEventListener("visibilitychange", function () { if (document.hidden) { stop(); } else { start(); } });
    show(0);
    start();
    return { show: show, start: start, stop: stop };
  }

  return { svg: svg, mount: mount, carousel: carousel, LABELS: LABELS, CAPTIONS: CAPTIONS, NAMES: Object.keys(SCENES) };
})();
