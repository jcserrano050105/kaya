/* Customer and Booking System: its own data (saved address, trusted contact) for the
   signed-in customer. This data is never sent to Worker Management. */
KAYA.CustomerStore = (function () {
  var KEY = "kaya_cb_db";

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var db = JSON.parse(raw);
        if (db.profiles) { return db; }
      }
    } catch (e) { /* storage blocked or corrupted */ }
    return { profiles: {} };
  }

  function save(db) {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* storage blocked */ }
  }

  /* The customer comes from the login session. Pages that use this store are guarded,
     so a missing session means the page is already redirecting to login. */
  function customer() {
    var me = KAYA.Auth && KAYA.Auth.current();
    if (!me || me.role !== "customer") {
      return { customer_id: "", full_name: "", city: KAYA.CITIES[0], email: "", phone: "" };
    }
    return { customer_id: me.linked_id, full_name: me.full_name, city: me.city || KAYA.CITIES[0], email: me.email, phone: me.phone };
  }

  function profile() {
    var id = customer().customer_id;
    var p = load().profiles[id] || {};
    return {
      trusted_contact: p.trusted_contact || { name: "", phone: "" },
      address: p.address || (id === "C001" ? { address: "12 Mabini St., Teachers Village", city: "Quezon City" } : { address: "", city: "" })
    };
  }

  function update(field, value) {
    var id = customer().customer_id;
    if (!id) { return; }
    var db = load();
    db.profiles[id] = db.profiles[id] || {};
    db.profiles[id][field] = value;
    save(db);
  }

  return {
    customer: customer,
    trustedContact: function () { return profile().trusted_contact; },
    setTrustedContact: function (name, phone) { update("trusted_contact", { name: name, phone: phone }); },
    savedAddress: function () { return profile().address; },
    setSavedAddress: function (address, city) { update("address", { address: address, city: city }); },
    reset: function () { save({ profiles: {} }); }
  };
})();
