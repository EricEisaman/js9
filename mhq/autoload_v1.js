// mhq-autoload_v1.js — auto-load Cas A into JS9 on GitHub Pages
// Place at: js9/mhq/autoload_v1.js
// Include AFTER js9.min.js + mhq/bridge.js, just before </body>:
//   <script src="mhq/autoload_v1.js"></script>
//
// What it does:
//  1. Turns off the Node helper attempt (no helper on Pages, so no :2718 timeout)
//  2. Removes the broken js9-theme.css link if bridge.js added it (fixes the 404)
//  3. Loads demos/data/casa.fits with log + heat, the Olympiad starting view
//  4. If casa.fits is still missing, shows a clear message instead of silent grey
(function () {
  function fixCss404() {
    // bridge.js loads "mission-hq/assets/js9-theme.css" relative to /js9/
    // -> resolves to /js9/mission-hq/... which does not exist. Remove it.
    // HUD styling is inline, so removing this link changes nothing visually.
    var links = document.querySelectorAll('link[href*="js9-theme.css"]');
    links.forEach(function (l) { l.remove(); });
  }

  function tryLoad() {
    fixCss404();
    if (!window.JS9) { setTimeout(tryLoad, 200); return; }

    // No helper on Pages. This silences the socket.io :2718 timeout.
    try {
      JS9.globalOpts.helperType = "none";
      JS9.globalOpts.loadProxy = false;
    } catch (e) {}

    // Already have an image? Stop.
    try { if (JS9.GetImage()) return; } catch (e) {}

    // This file MUST be a real file, not a symlink:
    //   js9/demos/data/casa.fits
    // Copy it from js9data. Until it is there, JS9 stays empty by design.
    JS9.Load("demos/data/casa.fits",
      { scale: "log", colormap: "heat" },
      { display: "JS9" }
    );

    // If still empty after 8s, the file is missing — say so in the HUD.
    setTimeout(function () {
      var hasImage = false;
      try { hasImage = !!JS9.GetImage(); } catch (e) {}
      if (!hasImage) {
        var el = document.querySelector("[data-mhq-status]");
        if (el) el.textContent = "No image loaded — add real file: demos/data/casa.fits";
        console.warn("[mhq-autoload] casa.fits not found at demos/data/casa.fits");
      }
    }, 8000);
  }

  window.addEventListener("load", tryLoad);
})();
