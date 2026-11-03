/* Worker Management System: client used by its own Worker and Admin portals.
   Portals authenticate with a role (worker/admin) instead of the system client key. */
KAYA.PortalClient = function (role, userId) {
  function request(method, path, body) {
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        Promise.resolve(KAYA.WorkerManagementAPI.handle({
          method: method,
          path: "/api/v1/" + path,
          headers: { "Content-Type": "application/json", "X-Role": role, "X-User-Id": userId || "" },
          body: body === undefined ? undefined : JSON.parse(JSON.stringify(body))
        })).then(function (res) {
          res = JSON.parse(JSON.stringify(res));
          if (res.status >= 200 && res.status < 300) { resolve(res.body); return; }
          var e = res.body.error;
          reject({ status: res.status, code: e.code, message: e.message, details: e.details });
        });
      }, KAYA.Auth && KAYA.Auth.backend === "supabase" ? 0 : 150);
    });
  }
  return { request: request };
};
