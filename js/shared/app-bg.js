/* Background for the logged-in Customer and Worker pages: the same service scenes
   and dark blue overlay as the login screens, fixed behind the page content.
   Load after scenes.js. */
(function () {
  /* Only for a signed-in user allowed on this page; guests on Book a Service see the
     login prompt, which has its own background. */
  if (!KAYA.Scenes || (KAYA.Auth && !KAYA.Auth.ok)) { return; }
  function mount() {
    if (document.querySelector(".app-bg")) { return; }
    var bg = document.createElement("div");
    bg.className = "app-bg";
    bg.setAttribute("aria-hidden", "true");
    bg.innerHTML = '<div class="app-bg__scenes"></div><div class="app-bg__overlay"></div>';
    document.body.insertBefore(bg, document.body.firstChild);
    document.body.classList.add("has-app-bg");
    KAYA.Scenes.carousel(bg.querySelector(".app-bg__scenes"),
      ["plumbing", "electrical", "cleaning", "carpentry", "laundry", "gardening"], { interval: 6000 });
  }
  if (document.readyState === "loading") { document.addEventListener("DOMContentLoaded", mount); } else { mount(); }
})();
