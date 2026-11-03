/* Supabase connection. Project URL: Dashboard → Connect button (or Project Settings → Data API).
   Key: Project Settings → API Keys → Publishable key (sb_publishable_...).
   The publishable key is safe to ship in the browser; row-level security protects the data.
   Never put a secret key (sb_secret_...) here.
   Load after the supabase-js script and before auth.js. Without the library (or on
   file://) the site falls back to the browser-only demo accounts. */
(function () {
  "use strict";
  var KAYA = (window.KAYA = window.KAYA || {});
  var SUPABASE_URL = "https://lsbtybzwypoytbjgoasl.supabase.co";
  var SUPABASE_ANON_KEY = "sb_publishable_rmcMErv-LpiNjQ1kYaVVHw_ehgIRcR1";

  var ready = window.supabase && SUPABASE_URL.indexOf("YOUR-") === -1 && /^https?:$/.test(window.location.protocol);
  KAYA.supabaseStorageKey = "sb-" + SUPABASE_URL.split("//")[1].split(".")[0] + "-auth-token";
  KAYA.supabase = ready ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
})();
