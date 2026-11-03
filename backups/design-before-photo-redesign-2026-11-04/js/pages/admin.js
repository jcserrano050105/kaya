/* Admin Dashboard: admin.html#dashboard | #applications | #users | #services | #bookings |
   #incidents | #warranty | #reports | #settings. Reachable only through admin-login.html;
   the guard in <head> denies every other role. */
(function () {
  if (!KAYA.Auth.ok) { return; }
  var ui = KAYA.ui;
  var Auth = KAYA.Auth;
  var api = KAYA.PortalClient("admin", Auth.current().linked_id);
  var root = ui.$("#view-root");
  var TITLES = {
    dashboard: "Admin Dashboard", applications: "Worker Applications", users: "Users", services: "Services", bookings: "Bookings",
    incidents: "Complaints and Incidents", warranty: "Warranty Disputes", reports: "Reports", settings: "Settings"
  };

  function icon(name) { return '<svg><use href="#i-' + name + '"/></svg>'; }

  function head(title, sub, action) {
    return '<div class="portal-head"><div><span class="system-tag system-tag--worker">Admin Console</span>' +
      "<h1>" + title + "</h1><p>" + sub + "</p></div>" + (action || "") + "</div>";
  }

  function kpi(iconName, value, label, mod, href) {
    var tag = href ? 'a href="' + href + '" style="text-decoration:none;color:inherit"' : "div";
    return "<" + tag + ' class="kpi' + (mod ? " kpi--" + mod : "") + '"><span class="kpi__icon">' + icon(iconName) + "</span><div><strong>" + value + "</strong><small>" + label + "</small></div></" + tag.split(" ")[0] + ">";
  }

  function loadError(err) {
    root.insertAdjacentHTML("beforeend", '<p class="notice notice--error">' + ui.esc(ui.errorText(err)) + "</p>");
  }

  function appBadge(s) { return '<span class="badge badge--' + s.toLowerCase() + '">' + ui.esc(s === "PENDING" ? "Pending Verification" : s) + "</span>"; }

  /* ---------- Dashboard ---------- */

  function dashboard() {
    root.innerHTML = head("Admin Dashboard", "Platform overview and items that need attention.") + '<div id="dash-body"><p class="muted">Loading…</p></div>';
    Promise.all([api.request("GET", "admin/reports"), api.request("GET", "admin/applications?status=PENDING"), api.request("GET", "admin/bookings")]).then(function (r) {
      var rep = r[0], apps = r[1].data, bks = r[2].data;
      var active = bks.filter(function (b) { return KAYA.ACTIVE_STATUSES.indexOf(b.status) !== -1; }).length;
      ui.$("#dash-body").innerHTML = '<div class="kpis">' +
        kpi("user-check", apps.length, "Applications pending", apps.length ? "accent" : "", "#applications") +
        kpi("route", active, "Active bookings", "", "#bookings") +
        kpi("alert", rep.open_incidents, "Open incidents", rep.open_incidents ? "danger" : "", "#incidents") +
        kpi("shield", rep.open_disputes, "Warranty disputes", rep.open_disputes ? "danger" : "", "#warranty") + "</div>" +
        '<div class="layout-2"><div class="card"><div class="card__head"><h2>Pending applications</h2><a class="btn btn--ghost btn--small" href="#applications">Review</a></div>' +
        (apps.length ? apps.slice(0, 5).map(function (w) {
          return '<div class="list-row"><div><h3>' + ui.esc(w.full_name) + ' <span class="small muted">' + ui.esc(w.worker_id) + "</span></h3>" +
            '<div class="small muted">' + ui.esc(w.city) + " · " + ui.esc(w.service_categories.map(ui.serviceName).join(", ")) + " · Applied " + ui.esc(ui.formatDate(w.applied_at)) + "</div></div>" + appBadge(w.application_status) + "</div>";
        }).join("") : '<div class="empty">No applications waiting.</div>') + "</div>" +
        '<div class="card"><h2>Platform</h2><ul class="checklist">' +
        "<li><span>Total bookings</span><strong>" + rep.bookings_total + "</strong></li>" +
        "<li><span>Completion rate</span><strong>" + rep.completion_rate + "%</strong></li>" +
        "<li><span>Payments received</span><strong>" + ui.peso(rep.revenue_paid) + "</strong></li>" +
        "<li><span>Average worker rating</span><strong>" + rep.average_rating + " / 5</strong></li>" +
        "<li><span>Approved workers</span><strong>" + rep.workers_by_application.APPROVED + "</strong></li></ul>" +
        '<a class="btn btn--ghost btn--small" href="#reports">Full reports</a></div></div>';
    }).catch(loadError);
  }

  /* ---------- Worker applications + skill verification ---------- */

  function skillBoxes(w) {
    var picked = w.application_status === "PENDING" && w.requested_skills && w.requested_skills.length ? w.requested_skills : w.verified_skills;
    return KAYA.SERVICES.filter(function (s) {
      return w.service_categories.indexOf(s.id) !== -1 || s.skills.some(function (sk) { return picked.indexOf(sk) !== -1; });
    }).map(function (s) {
      return s.skills.map(function (sk) {
        return '<label class="chip" style="cursor:pointer"><input type="checkbox" data-skill="' + w.worker_id + '" value="' + sk + '"' + (picked.indexOf(sk) !== -1 ? " checked" : "") + "> " + ui.esc(ui.skillLabel(sk)) + "</label>";
      }).join("");
    }).join("");
  }

  /* The requirements the applicant declared. Files are checked against the originals. */
  function docList(w) {
    var d = w.documents || {};
    var today = new Date().toISOString().slice(0, 10);
    function row(label, ok, detail, optional) {
      var cls = ok ? "" : optional ? "muted" : "is-missing";
      return '<li class="' + cls + '">' + (ok ? "✓" : optional ? "–" : "✗") + " <strong>" + label + "</strong>" + (detail ? " · " + detail : "") + "</li>";
    }
    var nbi = d.nbi || {};
    var nbiExpired = nbi.valid_until && nbi.valid_until < today;
    var nbiDetail = nbi.number ? "No. " + ui.esc(nbi.number) + (nbi.valid_until ? ", valid until " + ui.esc(nbi.valid_until) : "") : "";
    var brgy = d.barangay || {};
    return '<div class="small" style="font-weight:600;margin-bottom:2px">Requirements</div><ul class="doc-list">' +
      row("Valid ID", !!w.id_type, ui.esc(w.id_type || "not provided") + (d.id_file_name ? " · " + ui.esc(d.id_file_name) : "")) +
      (nbiExpired ? '<li class="is-warn">⚠ <strong>NBI Clearance</strong> · ' + nbiDetail + " · <strong>expired</strong></li>"
        : row("NBI Clearance", !!nbi.number, nbiDetail + (nbi.file_name ? " · " + ui.esc(nbi.file_name) : ""))) +
      row("Barangay Clearance", !!brgy.issued_on, brgy.issued_on ? "issued " + ui.esc(brgy.issued_on) + (brgy.file_name ? " · " + ui.esc(brgy.file_name) : "") : "") +
      row("TESDA / training certificate", !!(d.tesda || w.certificates.length), ui.esc(w.certificates.join(", ")) + (d.tesda ? " · " + ui.esc(d.tesda.file_name) : ""), true) +
      row("Police Clearance", !!d.police, d.police ? ui.esc(d.police.file_name) : "", true) +
      row("Medical certificate", !!d.medical, d.medical ? ui.esc(d.medical.file_name) : "", true) +
      "</ul>";
  }

  function appCard(w) {
    var pending = w.application_status === "PENDING";
    var html = '<div class="list-row"><div style="flex-basis:100%">' +
      '<div class="card__head"><div><h3>' + ui.esc(w.full_name) + ' <span class="small muted">' + ui.esc(w.worker_id) + "</span></h3>" +
      '<div class="small muted">' + ui.esc(w.city) + " · Applied " + ui.esc(ui.formatDate(w.applied_at)) + " · " + w.years_experience + " yrs experience" +
      (w.account_status !== "ACTIVE" ? " · Account " + ui.esc(w.account_status.toLowerCase()) : "") + "</div></div>" + appBadge(w.application_status) + "</div>" +
      '<p class="small" style="margin:4px 0 8px"><strong>About:</strong> ' + ui.esc(w.bio || "—") + "</p>" + docList(w) +
      '<div class="small" style="font-weight:600;margin-bottom:6px">Skill verification</div><div class="chips">' + skillBoxes(w) + "</div>";
    if (pending) {
      html += '<label class="checkbox"><input type="checkbox" data-idcheck="' + ui.esc(w.worker_id) + '"' + (w.identity_verified ? " checked" : "") + "> ID, NBI clearance and barangay clearance checked against the originals</label>" +
        '<div class="inline-form"><div class="field" style="flex:3 1 240px"><label class="small" for="note-' + w.worker_id + '">Note to worker (optional)</label><input id="note-' + w.worker_id + '" type="text"></div>' +
        '<button class="btn btn--primary btn--small" type="button" data-decide="APPROVED" data-id="' + ui.esc(w.worker_id) + '">Approve</button>' +
        '<button class="btn btn--ghost btn--small" type="button" data-decide="REJECTED" data-id="' + ui.esc(w.worker_id) + '">Reject</button></div>';
    } else if (w.application_status === "APPROVED") {
      html += '<button class="btn btn--ghost btn--small" type="button" data-save-skills="' + ui.esc(w.worker_id) + '">Save verified skills</button>';
    }
    if (w.review_note) { html += '<p class="small muted" style="margin:6px 0 0">Admin note: ' + ui.esc(w.review_note) + "</p>"; }
    return html + "</div></div>";
  }

  function checkedSkills(id) {
    return Array.prototype.map.call(root.querySelectorAll('[data-skill="' + id + '"]:checked'), function (c) { return c.value; });
  }

  function applications() {
    root.innerHTML = head("Worker Applications", "Verify identity and skills before a worker can receive bookings.",
      '<div class="field" style="margin:0"><label for="app-filter" class="small">Show</label><select id="app-filter"><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="">All</option></select></div>') +
      '<div class="card" id="apps"><p class="muted">Loading…</p></div>';
    ui.$("#app-filter").addEventListener("change", loadApps);
    loadApps();
  }

  function loadApps() {
    var f = ui.$("#app-filter").value;
    api.request("GET", "admin/applications" + (f ? "?status=" + f : "")).then(function (res) {
      ui.$("#apps").innerHTML = res.count ? res.data.map(appCard).join("") : '<div class="empty">No applications in this list.</div>';
    }).catch(loadError);
  }

  /* ---------- Users ---------- */

  function users() {
    root.innerHTML = head("Users", "Customer, worker and admin accounts. Suspending or deactivating an account ends its sessions immediately.") +
      '<div class="card"><div class="inline-form" style="margin:0 0 12px"><div class="field"><label class="small" for="u-role">Role</label><select id="u-role"><option value="">All roles</option><option value="customer">Customers</option><option value="worker">Workers</option><option value="admin">Admins</option></select></div>' +
      '<div class="field" style="flex:2 1 220px"><label class="small" for="u-q">Search</label><input id="u-q" type="search" placeholder="Name or email"></div></div>' +
      '<div class="table-wrap" id="u-table"></div></div>';
    ui.$("#u-role").addEventListener("change", renderUsers);
    ui.$("#u-q").addEventListener("input", renderUsers);
    renderUsers();
  }

  function renderUsers() {
    var role = ui.$("#u-role").value, q = ui.$("#u-q").value.trim().toLowerCase();
    var meId = Auth.current().user_id;
    Promise.resolve(Auth.listUsers()).then(function (users) {
    var list = users.filter(function (u) {
      return (!role || u.role === role) && (!q || (u.full_name + " " + u.email).toLowerCase().indexOf(q) !== -1);
    });
    ui.$("#u-table").innerHTML = '<table class="data-table"><thead><tr><th>Name</th><th>Role</th><th>Linked ID</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead><tbody>' +
      list.map(function (u) {
        var self = u.user_id === meId;
        var actions = self ? '<span class="small muted">You</span>' : ["ACTIVE", "SUSPENDED", "DEACTIVATED"].filter(function (s) { return s !== u.status; }).map(function (s) {
          var label = { ACTIVE: "Reactivate", SUSPENDED: "Suspend", DEACTIVATED: "Deactivate" }[s];
          return '<button class="btn btn--' + (s === "ACTIVE" ? "primary" : "ghost") + ' btn--small" type="button" data-user="' + u.user_id + '" data-ustatus="' + s + '" data-role="' + u.role + '" data-linked="' + ui.esc(u.linked_id) + '">' + label + "</button>";
        }).join(" ");
        return "<tr><td><strong>" + ui.esc(u.full_name) + '</strong><br><span class="small muted">' + ui.esc(u.email) + "</span></td><td>" + Auth.ROLE_LABELS[u.role] +
          "</td><td>" + ui.esc(u.linked_id) + '</td><td><span class="badge ' + (u.status === "ACTIVE" ? "badge--completed" : "badge--rejected") + '">' + u.status + "</span></td><td>" +
          ui.esc(ui.formatDate(u.created_at)) + '</td><td><div class="btn-row">' + actions + "</div></td></tr>";
      }).join("") + "</tbody></table>" + (list.length ? "" : '<div class="empty">No accounts match.</div>');
    });
  }

  /* ---------- Services ---------- */

  function services() {
    root.innerHTML = head("Services", "Manage the categories shown on the public Services page and in the booking form.") +
      '<div class="card table-wrap"><table class="data-table"><thead><tr><th>Category</th><th>Starting price (₱)</th><th>Description</th><th>Open for booking</th><th></th></tr></thead><tbody>' +
      KAYA.Catalog.all().map(function (s) {
        return '<tr data-svc="' + s.id + '"><td><strong>' + ui.esc(s.name) + '</strong><br><span class="small muted">' + ui.esc(s.id) + "</span></td>" +
          '<td><input type="number" min="0" step="10" value="' + s.price + '" style="width:100px;padding:6px 8px;border:1px solid var(--line);border-radius:8px;font:inherit" aria-label="Starting price for ' + ui.esc(s.name) + '"></td>' +
          '<td><textarea rows="2" style="width:100%;min-width:220px;padding:6px 8px;border:1px solid var(--line);border-radius:8px;font:inherit" aria-label="Description for ' + ui.esc(s.name) + '">' + ui.esc(s.description) + "</textarea></td>" +
          '<td><label class="checkbox"><input type="checkbox"' + (s.active ? " checked" : "") + "> Active</label></td>" +
          '<td><button class="btn btn--primary btn--small" type="button" data-save-svc="' + s.id + '">Save</button></td></tr>';
      }).join("") + "</tbody></table></div>" +
      '<p class="small muted">Inactive categories show as “Temporarily unavailable” and cannot be selected in new bookings. Existing bookings are not affected.</p>';
  }

  /* ---------- Bookings ---------- */

  function bookings() {
    root.innerHTML = head("Bookings", "Monitor every booking across the platform.",
      '<div class="field" style="margin:0"><label for="bk-filter" class="small">Status</label><select id="bk-filter"><option value="">All</option>' +
      Object.keys(KAYA.STATUS_LABELS).map(function (s) { return '<option value="' + s + '">' + KAYA.STATUS_LABELS[s] + "</option>"; }).join("") + "</select></div>") +
      '<div class="card table-wrap" id="bk-table"><p class="muted">Loading…</p></div>';
    ui.$("#bk-filter").addEventListener("change", loadBookings);
    loadBookings();
  }

  function loadBookings() {
    var f = ui.$("#bk-filter").value;
    api.request("GET", "admin/bookings" + (f ? "?status=" + f : "")).then(function (res) {
      ui.$("#bk-table").innerHTML = res.count ? '<table class="data-table"><thead><tr><th>Booking</th><th>Service</th><th>Customer</th><th>Worker</th><th>Schedule</th><th>Status</th><th>Estimate</th><th>Payment</th></tr></thead><tbody>' +
        res.data.map(function (b) {
          return "<tr><td>" + ui.esc(b.booking_id) + "</td><td>" + ui.esc(ui.serviceName(b.service_id)) + "</td><td>" + ui.esc(b.customer_name || b.customer_id) +
            "</td><td>" + ui.esc(b.worker_name) + "</td><td>" + ui.esc(ui.formatDate(b.schedule)) + "</td><td>" + ui.statusBadge(b.status) + "</td><td>" +
            (b.estimate ? ui.peso(b.estimate.total) + '<br><span class="small muted">' + ui.esc(KAYA.ESTIMATE_STATUS_LABELS[b.estimate.status]) + "</span>" : "—") + "</td><td>" +
            (b.payment ? ui.esc(KAYA.PAYMENT_METHODS[b.payment.method]) + '<br><span class="small muted">' + ui.esc(KAYA.PAYMENT_STATUS_LABELS[b.payment.status]) + (b.payment.reference ? " · " + ui.esc(b.payment.reference) : "") + "</span>" : "—") + "</td></tr>";
        }).join("") + "</tbody></table>" : '<div class="empty">No bookings in this list.</div>';
    }).catch(loadError);
  }

  /* ---------- Complaints and incidents ---------- */

  function caseControls(kind, id, status) {
    return '<div class="inline-form" style="margin:0"><select data-case-status aria-label="Case status">' + Object.keys(KAYA.CASE_STATUS_LABELS).map(function (s) {
      return '<option value="' + s + '"' + (s === (status || "OPEN") ? " selected" : "") + ">" + KAYA.CASE_STATUS_LABELS[s] + "</option>";
    }).join("") + '</select><button class="btn btn--primary btn--small" type="button" data-case="' + kind + '" data-case-id="' + id + '">Update</button></div>';
  }

  function incidents() {
    root.innerHTML = head("Complaints and Incidents", "Emergency incidents reported during bookings, and customer reports about workers.") +
      '<div class="card"><h2>Emergency incidents</h2><div id="inc" class="table-wrap"><p class="muted">Loading…</p></div></div>' +
      '<div class="card"><h2>Reports about workers</h2><div id="rpt" class="table-wrap"></div></div>';
    api.request("GET", "admin/incidents").then(function (res) {
      ui.$("#inc").innerHTML = res.incidents.length ? '<table class="data-table"><thead><tr><th>Incident</th><th>Booking</th><th>Type</th><th>Details</th><th>Location shared</th><th>Reported</th><th>Status</th></tr></thead><tbody>' +
        res.incidents.map(function (x) {
          return "<tr><td>" + ui.esc(x.incident_id) + "</td><td>" + ui.esc(x.booking_id) + "<br>" + ui.statusBadge(x.booking_status_at_report) + "</td><td>" + ui.esc(KAYA.INCIDENT_TYPES[x.incident_type]) +
            "</td><td>" + ui.esc(x.description) + "</td><td>" + (x.location_shared ? "Yes" : "No") + "</td><td>" + ui.esc(ui.formatDate(x.created_at)) + "</td><td>" + caseControls("incidents", x.incident_id, x.status) + "</td></tr>";
        }).join("") + "</tbody></table>" : '<div class="empty">No incidents reported.</div>';
      ui.$("#rpt").innerHTML = res.worker_reports.length ? '<table class="data-table"><thead><tr><th>Report</th><th>Worker</th><th>Reason</th><th>Details</th><th>Reported</th><th>Status</th></tr></thead><tbody>' +
        res.worker_reports.map(function (r) {
          return "<tr><td>" + ui.esc(r.report_id) + "</td><td>" + ui.esc(r.worker_id) + "</td><td>" + ui.esc(r.reason) + "</td><td>" + ui.esc(r.description) +
            "</td><td>" + ui.esc(ui.formatDate(r.created_at)) + "</td><td>" + caseControls("worker-reports", r.report_id, r.status) + "</td></tr>";
        }).join("") + "</tbody></table>" : '<div class="empty">No reports.</div>';
    }).catch(loadError);
  }

  /* ---------- Warranty disputes ---------- */

  function warranty() {
    root.innerHTML = head("Warranty Disputes", "Customers escalate here when a warranty request isn’t resolved. Order a rework visit or close the case with a decision.",
      '<div class="field" style="margin:0"><label for="wr-filter" class="small">Show</label><select id="wr-filter"><option value="DISPUTED">Disputed</option><option value="">All requests</option></select></div>') +
      '<div class="card" id="wr-list"><p class="muted">Loading…</p></div>';
    ui.$("#wr-filter").addEventListener("change", loadWarranty);
    loadWarranty();
  }

  function loadWarranty() {
    var f = ui.$("#wr-filter").value;
    var tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    api.request("GET", "warranty" + (f ? "?status=" + f : "")).then(function (res) {
      ui.$("#wr-list").innerHTML = res.count ? res.data.map(function (w) {
        var actions = w.status === "DISPUTED"
          ? '<form class="inline-form" data-dispute="' + w.warranty_id + '" novalidate><div class="field" style="flex:3 1 240px"><label class="small">Decision note (sent to both parties)</label><input data-field="note" type="text" maxlength="500"></div>' +
            '<div class="field"><label class="small">Rework visit date</label><input data-field="visit_date" type="date" min="' + tomorrow + '"></div>' +
            '<button class="btn btn--primary btn--small" type="submit" data-to="SCHEDULED">Order rework</button>' +
            '<button class="btn btn--ghost btn--small" type="submit" data-to="CLOSED">Close case</button></form>' : "";
        return '<div class="list-row"><div style="flex-basis:100%"><div class="card__head"><div><h3>' + ui.esc(w.warranty_id) + " · " + ui.esc(ui.serviceName(w.service_id)) + "</h3>" +
          '<div class="small muted">Booking ' + ui.esc(w.booking_id) + " · Customer " + ui.esc(w.customer_id) + " · Worker " + ui.esc(w.worker_id) + " · Updated " + ui.esc(ui.formatDate(w.updated_at)) + "</div></div>" +
          '<span class="badge ' + (w.status === "DISPUTED" ? "badge--rejected" : w.status === "CLOSED" ? "badge--completed" : "badge--pending") + '">' + ui.esc(KAYA.WARRANTY_STATUS_LABELS[w.status]) + "</span></div>" +
          '<p class="small" style="margin:0"><strong>Issue:</strong> ' + ui.esc(w.description) + "</p>" +
          (w.dispute_reason ? '<p class="small" style="margin:4px 0 0"><strong>Why escalated:</strong> ' + ui.esc(w.dispute_reason) + "</p>" : "") +
          (w.admin_note ? '<p class="small" style="margin:4px 0 0"><strong>Decision:</strong> ' + ui.esc(w.admin_note) + "</p>" : "") +
          '<p class="small muted" style="margin:4px 0 0">History: ' + w.history.map(function (h) { return KAYA.WARRANTY_STATUS_LABELS[h.status] + " (" + h.by + ")"; }).join(" → ") + "</p>" +
          actions + "</div></div>";
      }).join("") : '<div class="empty">No warranty requests in this list.</div>';
    }).catch(loadError);
  }

  /* ---------- Reports ---------- */

  function bars(obj, labels) {
    var keys = Object.keys(obj);
    var max = Math.max.apply(null, keys.map(function (k) { return obj[k]; }).concat([1]));
    return '<div class="bars">' + keys.map(function (k) {
      var label = labels ? labels[k] || k : k;
      return '<div class="bar-row" title="' + ui.esc(label) + ": " + obj[k] + '"><span>' + ui.esc(label) + '</span><div class="bar-track"><div class="bar-fill" style="width:' +
        (obj[k] / max * 100) + '%"></div></div><span>' + obj[k] + "</span></div>";
    }).join("") + "</div>";
  }

  function reports() {
    root.innerHTML = head("Reports", "Live figures from Worker Management.") + '<div id="rep-body"><p class="muted">Loading…</p></div>';
    api.request("GET", "admin/reports").then(function (r) {
      var svcLabels = {};
      KAYA.SERVICES.forEach(function (s) { svcLabels[s.id] = s.name; });
      ui.$("#rep-body").innerHTML = '<div class="kpis">' + kpi("list", r.bookings_total, "Total bookings") + kpi("check", r.completion_rate + "%", "Completion rate", "success") +
        kpi("wallet", ui.peso(r.revenue_paid), "Payments received") + kpi("star", r.average_rating + " / 5", "Average rating", "accent") + "</div>" +
        '<div class="layout-2" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)"><div class="card"><h2>Bookings by service</h2>' + bars(r.bookings_by_service, svcLabels) + "</div>" +
        '<div class="card"><h2>Bookings by status</h2>' + bars(r.bookings_by_status, KAYA.STATUS_LABELS) + "</div></div>" +
        '<div class="layout-2" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)"><div class="card"><h2>Worker applications</h2>' +
        bars(r.workers_by_application, { PENDING: "Pending", APPROVED: "Approved", REJECTED: "Rejected" }) + "</div>" +
        '<div class="card"><h2>Trust &amp; safety</h2><ul class="checklist"><li><span>Open incidents</span><strong>' + r.open_incidents + "</strong></li>" +
        "<li><span>Warranty requests</span><strong>" + r.warranty_total + "</strong></li><li><span>Open disputes</span><strong>" + r.open_disputes + "</strong></li>" +
        "<li><span>KAYA service fees collected</span><strong>" + ui.peso(r.service_fees) + "</strong></li></ul></div></div>";
    }).catch(loadError);
  }

  /* ---------- Settings ---------- */

  function settings() {
    var me = Auth.current();
    root.innerHTML = head("Settings", "Admin account, security and demo controls.") +
      '<div class="layout-2" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)"><div>' +
      '<div class="card"><h2>Admin account</h2><ul class="checklist"><li><span>Name</span><strong>' + ui.esc(me.full_name) + "</strong></li><li><span>Email</span><span>" + ui.esc(me.email) +
      "</span></li><li><span>Session length</span><span>30 minutes, not rememberable</span></li><li><span>Login lockout</span><span>5 failed attempts → 5 minutes</span></li></ul></div>" +
      '<form class="card" id="pw-form" novalidate><h2>Change admin password</h2>' +
      '<div class="field"><label for="pw-old">Current password</label><div class="pw-wrap"><input id="pw-old" data-field="old" type="password" autocomplete="current-password"></div></div>' +
      '<div class="field"><label for="pw-new">New password</label><div class="pw-wrap"><input id="pw-new" data-field="new" type="password" autocomplete="new-password"></div><div data-strength-for="pw-new"></div></div>' +
      '<button class="btn btn--primary" type="submit">Update password</button><p id="pw-msg" class="notice" hidden></p></form></div><div>' +
      '<div class="card"><h2>Failure test: Worker Management outage</h2><p class="small muted">Turn this on, then try to book as a customer. The booking must fail with a clear message and never show as confirmed.</p>' +
      '<label class="checkbox"><input id="outage-toggle" type="checkbox"> Simulate Worker Management being down (503)</label></div>' +
      (Auth.backend === "supabase"
        ? '<div class="card"><h2>Reset this browser</h2><p class="small muted">Clears service settings and the outage switch saved in this browser. Accounts, workers and bookings are in Supabase and are not affected.</p>' +
          '<button id="reset-btn" class="btn btn--danger" type="button">Reset this browser</button></div></div></div>'
        : '<div class="card"><h2>Reset demo data</h2><p class="small muted">Restores sample workers, bookings, accounts and service settings. Every account, including yours, is signed out.</p>' +
          '<button id="reset-btn" class="btn btn--danger" type="button">Reset all data</button></div></div></div>');
    ui.initPasswordFields(root);
    var outage = ui.$("#outage-toggle");
    outage.checked = KAYA.WorkerManagementAPI.isDown();
    outage.addEventListener("change", function () {
      KAYA.WorkerManagementAPI.setDown(outage.checked);
      ui.toast(outage.checked ? "Worker Management now returns 503 for every request." : "Worker Management is back online.");
    });
    ui.$("#reset-btn").addEventListener("click", function () {
      if (!window.confirm(Auth.backend === "supabase" ? "Reset the settings saved in this browser? Supabase data is not affected." : "Reset all KAYA demo data? Everyone will be signed out.")) { return; }
      KAYA.WorkerManagementAPI.reset();
      KAYA.WorkerManagementAPI.setDown(false);
      KAYA.CustomerStore.reset();
      KAYA.Catalog.reset();
      Auth.reset();
      if (Auth.backend === "supabase") { window.location.reload(); return; }
      window.location.replace("admin-login.html?reason=logout");
    });
    ui.$("#pw-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var nw = ui.$("#pw-new").value;
      if (!ui.fieldErrors(e.target, { old: ui.$("#pw-old").value ? "" : "Enter your current password.", "new": Auth.passwordError(nw) })) { return; }
      var form = e.target;
      Promise.resolve(Auth.changePassword(ui.$("#pw-old").value, nw)).then(function (res) {
        ui.showMessage(ui.$("#pw-msg"), res.ok ? "Password updated." : res.error, res.ok ? "success" : "error");
        if (res.ok) { form.reset(); }
      });
    });
  }

  /* ---------- Actions ---------- */

  root.addEventListener("click", function (e) {
    var t = e.target;
    var decide = t.closest("[data-decide]");
    if (decide) {
      var id = decide.getAttribute("data-id");
      var decision = decide.getAttribute("data-decide");
      var idCheck = root.querySelector('[data-idcheck="' + id + '"]');
      var skills = checkedSkills(id);
      if (decision === "APPROVED" && !skills.length) { ui.toast("Verify at least one skill before approving."); return; }
      if (decision === "APPROVED" && idCheck && !idCheck.checked &&
          !window.confirm("The identity document is not marked as checked. Approve anyway? The profile will show 'ID not yet verified'.")) { return; }
      decide.disabled = true;
      var step = decision === "APPROVED" ? api.request("PATCH", "admin/workers/" + id + "/skills", { verified_skills: skills }) : Promise.resolve();
      step.then(function () {
        return api.request("PATCH", "admin/applications/" + encodeURIComponent(id), {
          decision: decision, identity_verified: !!(idCheck && idCheck.checked), note: ui.$("#note-" + id).value.trim()
        });
      }).then(function (w) { ui.toast(w.full_name + " was " + decision.toLowerCase() + "."); loadApps(); })
        .catch(function (err) { decide.disabled = false; ui.toast(ui.errorText(err)); });
      return;
    }
    var saveSkills = t.closest("[data-save-skills]");
    if (saveSkills) {
      var wid = saveSkills.getAttribute("data-save-skills");
      api.request("PATCH", "admin/workers/" + wid + "/skills", { verified_skills: checkedSkills(wid) })
        .then(function () { ui.toast("Verified skills updated."); loadApps(); })
        .catch(function (err) { ui.toast(ui.errorText(err)); });
      return;
    }
    var userBtn = t.closest("[data-ustatus]");
    if (userBtn) {
      var status = userBtn.getAttribute("data-ustatus");
      if (status !== "ACTIVE" && !window.confirm(status === "SUSPENDED" ? "Suspend this account? They will be signed out and cannot log in." : "Deactivate this account? They will be signed out and cannot log in.")) { return; }
      Promise.resolve(Auth.setUserStatus(userBtn.getAttribute("data-user"), status)).then(function (res) {
        if (!res.ok) { ui.toast(res.error); return; }
        var done = function () { ui.toast("Account " + status.toLowerCase() + "."); renderUsers(); };
        if (userBtn.getAttribute("data-role") === "worker" && userBtn.getAttribute("data-linked")) {
          /* Keep Worker Management in sync so a suspended worker disappears from search and booking. */
          api.request("PATCH", "admin/workers/" + userBtn.getAttribute("data-linked") + "/account", { account_status: status }).then(done).catch(function (err) { ui.toast(ui.errorText(err)); renderUsers(); });
        } else { done(); }
      });
      return;
    }
    var saveSvc = t.closest("[data-save-svc]");
    if (saveSvc) {
      var row = saveSvc.closest("tr");
      var price = Number(row.querySelector("input[type=number]").value);
      if (!(price >= 0)) { ui.toast("Enter a valid price."); return; }
      KAYA.Catalog.update(saveSvc.getAttribute("data-save-svc"), {
        price: price, description: row.querySelector("textarea").value.trim(), active: row.querySelector("input[type=checkbox]").checked
      });
      ui.toast("Service updated. The public Services page now shows the change.");
      return;
    }
    var caseBtn = t.closest("[data-case]");
    if (caseBtn) {
      var sel = caseBtn.parentNode.querySelector("[data-case-status]");
      api.request("PATCH", "admin/" + caseBtn.getAttribute("data-case") + "/" + caseBtn.getAttribute("data-case-id"), { status: sel.value })
        .then(function () { ui.toast("Case marked " + KAYA.CASE_STATUS_LABELS[sel.value].toLowerCase() + "."); })
        .catch(function (err) { ui.toast(ui.errorText(err)); });
    }
  });

  root.addEventListener("submit", function (e) {
    var form = e.target;
    var wrId = form.getAttribute("data-dispute");
    if (!wrId) { return; }
    e.preventDefault();
    var to = e.submitter ? e.submitter.getAttribute("data-to") : "CLOSED";
    var note = form.querySelector("[data-field=note]").value.trim();
    var visit = form.querySelector("[data-field=visit_date]").value;
    if (!ui.fieldErrors(form, { note: note ? "" : "A decision note is required.", visit_date: to === "SCHEDULED" && !visit ? "Choose the rework visit date." : "" })) { return; }
    api.request("PATCH", "warranty/" + wrId, { status: to, note: note, visit_date: visit })
      .then(function () { ui.toast(to === "SCHEDULED" ? "Rework ordered. The worker has been notified." : "Case closed."); loadWarranty(); })
      .catch(function (err) { ui.toast(ui.errorText(err)); });
  });

  /* ---------- Router ---------- */

  var RENDER = { dashboard: dashboard, applications: applications, users: users, services: services, bookings: bookings,
    incidents: incidents, warranty: warranty, reports: reports, settings: settings };

  function render() {
    var view = (window.location.hash || "#dashboard").slice(1);
    if (!RENDER[view]) { view = "dashboard"; }
    document.title = TITLES[view] + " — KAYA Admin";
    RENDER[view]();
  }

  window.addEventListener("hashchange", function () { render(); window.scrollTo(0, 0); });
  render();
})();
