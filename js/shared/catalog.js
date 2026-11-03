/* Service catalog shown to the public and managed by Admin (Services view).
   Service ids come from the shared contract; Admin can change price, description
   and whether a category is open for new bookings. */
KAYA.Catalog = (function () {
  var KEY = "kaya_catalog";

  var DEFAULTS = {
    plumbing:   { name: "Plumbing", tagline: "Leaks, clogs and pipe repairs", price: 350, active: true,
                  description: "Leaking faucets, clogged drains, toilet repairs and pipe replacement by TESDA-certified plumbers.",
                  includes: ["Faucet and sink repair", "Drain unclogging", "Toilet and pipe fixes"] },
    electrical: { name: "Electrical Work", tagline: "Safe wiring and lighting", price: 400, active: true,
                  description: "Outlet and switch repair, lighting installation, wiring checks and breaker troubleshooting.",
                  includes: ["Light and switch installation", "Outlet repair", "Wiring inspection"] },
    cleaning:   { name: "Cleaning", tagline: "Spotless rooms, fresh home", price: 500, active: true,
                  description: "General and deep cleaning, kitchen and bathroom sanitizing, room organizing and aircon cleaning.",
                  includes: ["General and deep cleaning", "Room organizing", "Aircon cleaning"] },
    laundry:    { name: "Laundry", tagline: "Wash, dry, iron and fold", price: 250, active: true,
                  description: "Laundry done at your home: washing, drying, ironing and folding, including linens and bedsheets.",
                  includes: ["Wash and dry", "Ironing and folding", "Linens and bedsheets"] },
    carpentry:  { name: "Carpentry", tagline: "Furniture, doors and shelves", price: 450, active: true,
                  description: "Furniture installation, shelf mounting, cabinet and door repair, and termite damage fixes.",
                  includes: ["Shelf and furniture installation", "Door and cabinet repair", "Wood damage repair"] },
    gardening:  { name: "Gardening", tagline: "Green, tidy outdoor spaces", price: 400, active: true,
                  description: "Lawn mowing, hedge and tree trimming, weeding, plant care and simple landscaping.",
                  includes: ["Lawn mowing", "Hedge and tree trimming", "Plant care and weeding"] }
  };

  function overrides() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }

  function get(id) {
    var base = DEFAULTS[id];
    if (!base) { return null; }
    var o = overrides()[id] || {};
    var out = { id: id };
    for (var k in base) { out[k] = o[k] !== undefined ? o[k] : base[k]; }
    return out;
  }

  function all() {
    return KAYA.SERVICES.map(function (s) { return get(s.id); });
  }

  function update(id, fields) {
    if (!DEFAULTS[id]) { return false; }
    var o = overrides();
    o[id] = o[id] || {};
    ["price", "description", "active", "tagline"].forEach(function (f) {
      if (fields[f] !== undefined) { o[id][f] = fields[f]; }
    });
    try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { return false; }
    return true;
  }

  function reset() {
    try { localStorage.removeItem(KEY); } catch (e) { /* storage blocked */ }
  }

  return { get: get, all: all, update: update, reset: reset };
})();
