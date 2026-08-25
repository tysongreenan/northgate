/**
 * CLASSIC content-script stub (no import/export).
 * Paints the Northgate banner immediately so chatgpt.com always shows
 * it even if the module boot graph fails.
 */
(function northgateClassicStub() {
  var BANNER_ID = "northgate-banner-host";

  function paint(status, detail) {
    var root = document.documentElement;
    if (!root) return;

    var host = document.getElementById(BANNER_ID);
    if (!host) {
      host = document.createElement("div");
      host.id = BANNER_ID;
      host.setAttribute("data-northgate", "banner");
      host.style.cssText =
        "position:fixed;top:0;left:0;right:0;z-index:2147483646;height:36px;pointer-events:none;";
      var shadow = host.attachShadow({ mode: "open" });
      shadow.innerHTML =
        '<style>:host{all:initial}.bar{position:fixed;top:0;left:0;right:0;z-index:2147483646;display:flex;align-items:center;gap:12px;padding:8px 16px;background:#1b3d2f;color:#f4efe4;font:12px/1.35 "Segoe UI",system-ui,sans-serif;box-shadow:0 1px 0 rgba(0,0,0,.15)}.name{font-weight:700;letter-spacing:.02em}.status{font-weight:600}.detail{color:#d5e0d8}</style>' +
        '<div class="bar"><span class="name">Northgate</span><span class="status"></span><span class="detail"></span></div>';
      root.appendChild(host);
      root.style.scrollPaddingTop = "36px";
    }

    var bar = host.shadowRoot && host.shadowRoot.querySelector(".bar");
    if (!bar) return;
    var statusEl = bar.querySelector(".status");
    var detailEl = bar.querySelector(".detail");
    if (statusEl) statusEl.textContent = status || "Northgate · script loaded";
    if (detailEl) detailEl.textContent = detail || "";
  }

  paint("Northgate · script loaded");
  console.info("[northgate] classic stub loaded on", location.host);

  function keepBanner() {
    if (!document.getElementById(BANNER_ID)) {
      paint("Northgate · script loaded");
    }
  }

  if (document.documentElement) {
    new MutationObserver(keepBanner).observe(document.documentElement, {
      childList: true,
    });
  }
  document.addEventListener("DOMContentLoaded", keepBanner);
  window.addEventListener("load", keepBanner);
  window.setInterval(keepBanner, 1500);

  var bootUrl = chrome.runtime.getURL("boot.js");
  import(bootUrl)
    .then(function (mod) {
      if (mod && typeof mod.boot === "function") {
        mod.boot();
      } else {
        paint("Northgate · script loaded", "boot had no init");
      }
    })
    .catch(function (err) {
      console.warn("[northgate] boot import failed", err);
      paint("Northgate · script loaded", "adapter import failed");
    });
})();
