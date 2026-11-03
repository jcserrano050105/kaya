/* Describe-Your-Problem skill matching (keyword based, v2).
   Understands common English, Tagalog and Taglish words. A keyword matches the start
   of a word ("leak" matches "leaking"); keywords with a space match as a phrase;
   keywords starting with "=" match only the whole word ("=plant" skips "plantsa"). */
KAYA.SkillMatcher = (function () {
  var KEYWORDS = {
    plumbing: [
      "leak", "tulo", "tumutulo", "sink", "lababo", "faucet", "gripo", "pipe", "tubo", "toilet", "inidoro", "kubeta",
      "flush", "clog", "barado", "drain", "water", "tubig", "shower", "heater", "bidet", "tank", "poso",
      "plumb", "sewer", "septic", "overflow", "no water", "walang tubig", "low pressure", "hose"
    ],
    electrical: [
      "outlet", "socket", "saksakan", "plug", "light", "ilaw", "bulb", "bumbilya", "lamp", "wiring", "wire", "kable",
      "breaker", "switch", "power", "kuryente", "spark", "electric", "fan", "brownout", "short circuit", "fuse",
      "tv", "ref", "refrigerator", "appliance", "doorbell", "no power", "walang kuryente", "nag-spark", "volt"
    ],
    carpentry: [
      "door", "pinto", "pintuan", "cabinet", "aparador", "wood", "kahoy", "furniture", "shelf", "table", "mesa",
      "chair", "upuan", "hinge", "bisagra", "termite", "anay", "drawer", "bed frame", "window", "bintana",
      "ceiling", "kisame", "floor", "sahig", "fence", "bakod", "lock", "susi", "stairs", "hagdan", "carpent", "plywood"
    ],
    cleaning: [
      "clean", "linis", "maglinis", "dust", "alikabok", "mop", "mold", "amag", "dirty", "madumi", "marumi",
      "sanitize", "disinfect", "aircon", "deep clean",
      "carpet", "sofa", "upholstery", "grease", "move out", "move-in", "general cleaning"
    ],
    laundry: [
      "laundry", "labada", "labahan", "maglaba", "wash", "clothes", "damit", "iron", "plantsa", "fold", "tiklop", "linen",
      "bedsheet", "kumot", "curtain", "kurtina", "uniform", "stain", "mantsa", "dry clean", "towel", "tuwalya"
    ],
    gardening: [
      "garden", "hardin", "halaman", "grass", "damo", "lawn", "=plant", "=plants", "planting", "tree", "trim", "prune", "weed",
      "landscap", "branch", "sanga", "leaves", "dahon", "soil", "lupa", "paso", "pots", "bush", "hedge", "mow"
    ]
  };

  function words(text) {
    return (text || "").toLowerCase().replace(/[^a-z0-9ñ\s-]/g, " ").split(/\s+/).filter(Boolean);
  }

  /* How many of a service's keywords appear in the text. */
  function score(service, text, tokens) {
    var lower = " " + tokens.join(" ") + " ";
    return KEYWORDS[service].filter(function (kw) {
      if (kw.indexOf(" ") !== -1) { return lower.indexOf(" " + kw + " ") !== -1 || lower.indexOf(" " + kw) !== -1; }
      if (kw.charAt(0) === "=") { return tokens.indexOf(kw.slice(1)) !== -1; }
      /* Short keywords ("tv", "ref") must be the whole word; longer ones can start a word. */
      return tokens.some(function (t) { return kw.length <= 3 ? t === kw : t.indexOf(kw) === 0; });
    }).length;
  }

  /* Every service the text mentions, strongest first: [{ service, score }]. */
  function matchAll(text) {
    var tokens = words(text);
    var found = [];
    for (var service in KEYWORDS) {
      var s = score(service, text, tokens);
      if (s) { found.push({ service: service, score: s }); }
    }
    return found.sort(function (a, b) { return b.score - a.score; });
  }

  function match(text) {
    var all = matchAll(text);
    return all.length ? all[0].service : null;
  }

  return { match: match, matchAll: matchAll };
})();
