(function () {
  if (!KAYA.Auth.ok) { return; }
  var ui = KAYA.ui;
  var state = { service: ui.param("service") || "", problem: "" };

  var picker = ui.$("#service-picker");
  var citySelect = ui.$("#filter-city");
  var scheduleInput = ui.$("#filter-schedule");
  var results = ui.$("#results");
  var message = ui.$("#search-message");
  var title = ui.$("#results-title");
  var matchResult = ui.$("#match-result");

  ui.fillCitySelect(citySelect, true);
  citySelect.value = KAYA.CustomerStore.customer().city;

  function renderPicker() {
    picker.innerHTML = KAYA.SERVICES.map(function (s) {
      var cls = "service-chip" + (s.id === state.service ? " is-selected" : "");
      return '<button type="button" class="' + cls + '" data-service="' + s.id + '">' + ui.esc(s.name) + "</button>";
    }).join("");
  }

  function initials(name) {
    return name.split(" ").map(function (p) { return p.charAt(0); }).slice(0, 2).join("");
  }

  function workerCard(w) {
    var link = "profile.html?id=" + encodeURIComponent(w.worker_id) +
      "&service=" + encodeURIComponent(state.service || w.service_categories[0]) +
      (state.problem ? "&q=" + encodeURIComponent(state.problem) : "") +
      (scheduleInput.value ? "&schedule=" + encodeURIComponent(scheduleInput.value) : "");
    var verified = w.identity_verified
      ? '<span class="chip chip--ok">&#10003; ID verified</span>'
      : '<span class="chip chip--warn">ID not yet verified</span>';
    var availability = w.availability === "available"
      ? '<span class="chip chip--ok">Available</span>'
      : '<span class="chip chip--warn">Busy</span>';
    return '<article class="card worker-card">' +
      '<div class="person"><div class="avatar">' + ui.esc(initials(w.full_name)) + "</div>" +
      "<div><h3>" + ui.esc(w.full_name) + '</h3><div class="meta">' + ui.esc(w.city) + " · " + w.years_experience + " yrs experience</div></div></div>" +
      '<div class="chips mt">' + verified + availability + "</div>" +
      '<div class="chips">' + w.verified_skills.map(function (s) { return '<span class="chip">' + ui.esc(ui.skillLabel(s)) + "</span>"; }).join("") + "</div>" +
      '<p class="small">' + (w.review_count ? ui.stars(w.rating) + " " + w.rating.toFixed(1) + " (" + w.review_count + " reviews)" : '<span class="muted">No reviews yet</span>') +
      ' · <strong>' + w.completed_jobs + "</strong> jobs done</p>" +
      '<a class="btn btn--primary btn--block" href="' + link + '">View Trust Profile</a>' +
      "</article>";
  }

  function search() {
    title.textContent = state.service ? ui.serviceName(state.service) + " workers" : "Approved workers";
    results.innerHTML = '<p class="muted">Loading workers...</p>';
    ui.showMessage(message, "");
    KAYA.IntegrationClient.searchWorkers({
      service: state.service,
      city: citySelect.value,
      schedule: ui.toManilaIso(scheduleInput.value)
    }).then(function (res) {
      if (!res.count) {
        results.innerHTML = '<div class="empty card">No approved workers match. Try another city or time.</div>';
        return;
      }
      results.innerHTML = res.data.map(workerCard).join("");
    }).catch(function (err) {
      results.innerHTML = "";
      ui.showMessage(message, ui.errorText(err), "error");
    });
  }

  picker.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-service]");
    if (!btn) { return; }
    var id = btn.getAttribute("data-service");
    state.service = state.service === id ? "" : id;
    renderPicker();
    search();
  });

  ui.$("#describe-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var text = ui.$("#describe-input").value.trim();
    if (!text) { return; }
    state.problem = text;
    var found = KAYA.SkillMatcher.match(text);
    if (found) {
      state.service = found;
      ui.showMessage(matchResult, "Suggested service: " + ui.serviceName(found) + ". Showing approved workers with this skill.", "success");
    } else {
      ui.showMessage(matchResult, "We could not tell which service you need. Please choose one below.", "warn");
    }
    renderPicker();
    search();
  });

  citySelect.addEventListener("change", search);
  scheduleInput.addEventListener("change", search);

  renderPicker();
  search();
})();
