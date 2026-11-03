/* Map pin for the service location (Leaflet, free: no API key or billing).
   Street view: OpenStreetMap. Satellite view: Esri World Imagery.
   picker(el, opts)   interactive map: tap or drag the pin, or use the device location
   view(el, loc)      read-only map showing a booking's pin
   directionsUrl(loc) link that opens the pin in the worker's maps app */
KAYA.MapPin = (function () {
  /* Rough city centres, used to start the map near the customer. */
  var CITY_CENTER = {
    "Quezon City": [14.676, 121.0437], "Manila": [14.5995, 120.9842], "Makati": [14.5547, 121.0244],
    "Pasig": [14.5764, 121.0851], "Taguig": [14.5176, 121.0509], "Caloocan": [14.6507, 120.9676]
  };

  /* The device location is accepted once it is this precise (metres), or after LOCATE_MS. */
  var GOOD_ACCURACY = 20;
  var LOCATE_MS = 12000;

  function inPhilippines(lat, lng) { return lat >= 4.5 && lat <= 21.5 && lng >= 116 && lng <= 127; }
  function round6(n) { return Math.round(n * 1e6) / 1e6; }
  function hasPin(loc) { return !!loc && typeof loc.lat === "number" && typeof loc.lng === "number"; }
  function directionsUrl(loc) { return "https://www.openstreetmap.org/directions?to=" + loc.lat + "%2C" + loc.lng + "#map=18/" + loc.lat + "/" + loc.lng; }
  function ready() { return typeof window.L !== "undefined"; }

  function failMessage(el, text) {
    el.innerHTML = '<p class="notice notice--warn" style="margin:12px">' + text + "</p>";
  }

  function layers() {
    var street = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    });
    var satellite = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19, attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics"
    });
    return { street: street, satellite: satellite };
  }

  function pinIcon() {
    return L.divIcon({ className: "map-pin", html: '<span class="map-pin__dot"></span>', iconSize: [30, 42], iconAnchor: [15, 40] });
  }

  function makeMap(el, center, zoom, interactive) {
    var map = L.map(el, { zoomControl: interactive, dragging: interactive, scrollWheelZoom: false, tap: interactive,
      doubleClickZoom: interactive, boxZoom: false, keyboard: interactive });
    var l = layers();
    l.street.addTo(map);
    if (interactive) { L.control.layers({ "Street": l.street, "Satellite": l.satellite }, null, { position: "topright" }).addTo(map); }
    map.setView(center, zoom);
    return map;
  }

  /* Suggests a street address for the pin (OpenStreetMap Nominatim, light use only). */
  function suggestAddress(lat, lng) {
    var url = "https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&lat=" + lat + "&lon=" + lng;
    return fetch(url, { headers: { "Accept-Language": "en" } }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.address) { return ""; }
        var a = d.address;
        return [a.house_number, a.road, a.neighbourhood || a.quarter || a.suburb || a.village].filter(Boolean).join(", ");
      }).catch(function () { return ""; });
  }

  /* opts: { city, value: {lat, lng}, onChange(loc), onAddress(text), onError(text), onProgress(accuracyMetres) } */
  function picker(el, opts) {
    opts = opts || {};
    var state = { current: opts.value && opts.value.lat ? { lat: opts.value.lat, lng: opts.value.lng } : null };
    if (!ready()) {
      failMessage(el, "The map couldn't load. Check your internet connection and reload the page.");
      return { value: function () { return state.current; }, available: function () { return false; },
        setCity: function () {}, refresh: function () {}, locate: function () { return Promise.resolve({ problem: "The map isn't available." }); } };
    }

    var start = state.current ? [state.current.lat, state.current.lng] : CITY_CENTER[opts.city] || CITY_CENTER["Quezon City"];
    var map = makeMap(el, start, state.current ? 18 : 13, true);
    var marker = null;
    var accuracyCircle = null;
    var timer = null;

    function clearCircle() {
      if (accuracyCircle) { map.removeLayer(accuracyCircle); accuracyCircle = null; }
    }

    function place(lat, lng, fromUser) {
      if (!inPhilippines(lat, lng)) { if (opts.onError) { opts.onError("Please pin a location inside the Philippines."); } return; }
      state.current = { lat: round6(lat), lng: round6(lng) };
      if (!marker) {
        marker = L.marker([lat, lng], { draggable: true, icon: pinIcon(), keyboard: true, title: "Service location" }).addTo(map);
        marker.on("dragend", function () { var p = marker.getLatLng(); clearCircle(); place(p.lat, p.lng, true); });
      } else {
        marker.setLatLng([lat, lng]);
      }
      if (opts.onChange) { opts.onChange(state.current); }
      if (fromUser && opts.onAddress) {
        clearTimeout(timer);
        timer = setTimeout(function () {
          suggestAddress(state.current.lat, state.current.lng).then(function (text) { if (text) { opts.onAddress(text); } });
        }, 700);
      }
    }

    if (state.current) { place(state.current.lat, state.current.lng, false); }
    map.on("click", function (e) { clearCircle(); place(e.latlng.lat, e.latlng.lng, true); });

    /* Listens to the device for a few seconds and keeps the most precise reading:
       the first reading is often a rough Wi-Fi or cell-tower guess.
       Resolves { accuracy } in metres, or { problem } with a message. */
    function locate() {
      return new Promise(function (resolve) {
        if (!navigator.geolocation) { resolve({ problem: "Your browser can't share its location. Tap the map instead." }); return; }
        var best = null;
        var done = false;
        var watchId = null;
        var stopTimer = null;

        function stop() {
          done = true;
          if (watchId !== null) { navigator.geolocation.clearWatch(watchId); }
          clearTimeout(stopTimer);
        }
        function finish() {
          if (done) { return; }
          stop();
          resolve(best ? { accuracy: best.coords.accuracy } :
            { problem: "Couldn't get your location. Turn on location (GPS) and try again, or tap the map." });
        }
        function show(pos) {
          var lat = pos.coords.latitude, lng = pos.coords.longitude, acc = pos.coords.accuracy;
          if (accuracyCircle) { accuracyCircle.setLatLng([lat, lng]).setRadius(acc); }
          else { accuracyCircle = L.circle([lat, lng], { radius: acc, color: "#2554e8", weight: 1, fillOpacity: 0.12, interactive: false }).addTo(map); }
          map.setView([lat, lng], acc <= 30 ? 19 : acc <= 100 ? 18 : 16);
          place(lat, lng, true);
          if (opts.onProgress) { opts.onProgress(acc); }
        }

        watchId = navigator.geolocation.watchPosition(function (pos) {
          if (done) { return; }
          if (!best || pos.coords.accuracy < best.coords.accuracy) { best = pos; show(pos); }
          if (pos.coords.accuracy <= GOOD_ACCURACY) { finish(); }
        }, function (err) {
          if (done || err.code !== 1) { return; } /* keep waiting on timeouts; stop when permission is denied */
          stop();
          resolve({ problem: "Location access was blocked. Allow location for this site in your browser settings, or tap the map." });
        }, { enableHighAccuracy: true, maximumAge: 0, timeout: LOCATE_MS });
        stopTimer = setTimeout(finish, LOCATE_MS);
      });
    }

    return {
      value: function () { return state.current; },
      available: function () { return true; },
      setCity: function (city) { if (!state.current && CITY_CENTER[city]) { map.setView(CITY_CENTER[city], 13); } },
      /* Leaflet measures its box when shown; call after the map's panel becomes visible. */
      refresh: function () { setTimeout(function () { map.invalidateSize(); }, 50); },
      locate: locate
    };
  }

  function view(el, loc) {
    if (!ready() || !hasPin(loc)) { return; }
    var map = makeMap(el, [loc.lat, loc.lng], 18, false);
    L.marker([loc.lat, loc.lng], { icon: pinIcon(), title: "Service location" }).addTo(map);
  }

  return { picker: picker, view: view, hasPin: hasPin, directionsUrl: directionsUrl, inPhilippines: inPhilippines };
})();
