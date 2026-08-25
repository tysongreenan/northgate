/**
 * SINGLE classic content script. No import/export, no type:module,
 * no web_accessible_resources, no chrome.runtime.getURL module load.
 * Banner paints first. ChatGPT adapter lives in this file.
 */
(function northgateClassic() {
  var BANNER_ID = "northgate-banner-host";
  var MODAL_ID = "northgate-modal-host";
  var STYLE_ID = "northgate-highlight-style";
  var HIGHLIGHT = "northgate-pii";

  function paintBanner(status, detail, tone) {
    var root = document.documentElement;
    if (!root) return null;

    var host = document.getElementById(BANNER_ID);
    if (!host) {
      host = document.createElement("div");
      host.id = BANNER_ID;
      host.setAttribute("data-northgate", "banner");
      host.style.cssText =
        "position:fixed;top:0;left:0;right:0;z-index:2147483646;height:36px;pointer-events:none;";
      var shadow = host.attachShadow({ mode: "open" });
      shadow.innerHTML =
        '<style>:host{all:initial}.bar{position:fixed;top:0;left:0;right:0;z-index:2147483646;display:flex;align-items:center;gap:12px;padding:8px 16px;background:#1b3d2f;color:#f4efe4;font:12px/1.35 "Segoe UI",system-ui,sans-serif;box-shadow:0 1px 0 rgba(0,0,0,.15)}.name{font-weight:700;letter-spacing:.02em}.status{font-weight:600}.detail{color:#d5e0d8}.bar.warn{background:#6b3a12}.bar.block{background:#7a2418}</style>' +
        '<div class="bar"><span class="name">Northgate</span><span class="status"></span><span class="detail"></span></div>';
      root.appendChild(host);
      root.style.scrollPaddingTop = "36px";
    }

    var bar = host.shadowRoot && host.shadowRoot.querySelector(".bar");
    if (!bar) return host;
    bar.classList.remove("warn", "block");
    if (tone === "warn" || tone === "block") bar.classList.add(tone);
    var statusEl = bar.querySelector(".status");
    var detailEl = bar.querySelector(".detail");
    if (statusEl) statusEl.textContent = status || "Northgate · script loaded";
    if (detailEl) detailEl.textContent = detail || "";
    return host;
  }

  paintBanner("Northgate · script loaded");
  console.info("[northgate] classic content.js loaded on", location.host);

  function keepBanner() {
    if (!document.getElementById(BANNER_ID)) {
      paintBanner("Northgate · script loaded");
    }
  }

  if (document.documentElement) {
    new MutationObserver(keepBanner).observe(document.documentElement, { childList: true });
  }
  document.addEventListener("DOMContentLoaded", keepBanner);
  window.addEventListener("load", keepBanner);
  window.setInterval(keepBanner, 1500);

  var HOSTS = [
    { id: "chatgpt", label: "ChatGPT", enabled: true, hosts: ["chatgpt.com", "chat.openai.com"] },
    { id: "claude", label: "Claude", enabled: false, hosts: ["claude.ai"] },
    { id: "gemini", label: "Gemini", enabled: false, hosts: ["gemini.google.com"] },
    { id: "grok", label: "Grok", enabled: false, hosts: ["grok.com", "grok.x.ai"] },
  ];

  function matchHost(locationLike) {
    var hostname = String(locationLike.hostname || "").toLowerCase().replace(/^www\./, "");
    for (var i = 0; i < HOSTS.length; i += 1) {
      if (HOSTS[i].hosts.indexOf(hostname) !== -1) return HOSTS[i];
    }
    return null;
  }

  var EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  var PHONE = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/g;
  var SIN = /\b\d{3}-\d{3}-\d{3}\b/g;
  var CARD_SHAPED = /\b(?:\d[ -]?){13,19}\b/g;
  var TOKEN = { email: "[EMAIL]", phone: "[PHONE]", sin: "[SIN]", card: "[CARD]" };

  function cloneRe(re) {
    return new RegExp(re.source, re.flags.indexOf("g") !== -1 ? re.flags : re.flags + "g");
  }

  function luhnOk(digits) {
    var sum = 0;
    var alt = false;
    for (var i = digits.length - 1; i >= 0; i -= 1) {
      var n = Number(digits[i]);
      if (alt) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      alt = !alt;
    }
    return sum % 10 === 0;
  }

  function collect(type, source, re, accept) {
    var hits = [];
    var copy = cloneRe(re);
    var hit;
    while ((hit = copy.exec(source))) {
      if (accept && !accept(hit[0])) continue;
      hits.push({ type: type, start: hit.index, end: hit.index + hit[0].length, value: hit[0] });
    }
    return hits;
  }

  function findMatches(text) {
    var source = String(text || "");
    var raw = []
      .concat(collect("email", source, EMAIL))
      .concat(collect("card", source, CARD_SHAPED, function (value) {
        var digits = value.replace(/\D/g, "");
        return digits.length >= 13 && digits.length <= 19 && luhnOk(digits);
      }))
      .concat(collect("sin", source, SIN))
      .concat(collect("phone", source, PHONE));

    raw.sort(function (a, b) {
      return a.start - b.start || b.end - b.start - (a.end - a.start);
    });

    var matches = [];
    for (var i = 0; i < raw.length; i += 1) {
      var hit = raw[i];
      var overlaps = false;
      for (var j = 0; j < matches.length; j += 1) {
        if (hit.start < matches[j].end && hit.end > matches[j].start) {
          overlaps = true;
          break;
        }
      }
      if (!overlaps) matches.push(hit);
    }
    return matches;
  }

  function scanText(text) {
    var source = String(text || "");
    var matches = findMatches(source);
    var counts = { email: 0, phone: 0, sin: 0, card: 0 };
    var redacted = source;
    var ordered = matches.slice().sort(function (a, b) { return b.start - a.start; });
    for (var i = 0; i < ordered.length; i += 1) {
      var hit = ordered[i];
      redacted = redacted.slice(0, hit.start) + TOKEN[hit.type] + redacted.slice(hit.end);
      counts[hit.type] += 1;
    }
    return { original: source, redacted: redacted, counts: counts, matches: matches, found: matches.length > 0 };
  }

  var VAULTS = [
    { id: "acme", name: "Sway — Acme Clinic" },
    { id: "birch", name: "Sway — Birch Marketing" },
  ];

  function vaultById(id) {
    for (var i = 0; i < VAULTS.length; i += 1) {
      if (VAULTS[i].id === id) return VAULTS[i];
    }
    return VAULTS[0];
  }

  function getState() {
    return chrome.storage.local.get(["session", "activeVaultId", "pretendCanadaOnly", "activity"]).then(function (data) {
      var activity = Array.isArray(data.activity) ? data.activity : [];
      var activeVaultId = "acme";
      for (var i = 0; i < VAULTS.length; i += 1) {
        if (VAULTS[i].id === data.activeVaultId) activeVaultId = data.activeVaultId;
      }
      return {
        session: data.session || null,
        activeVaultId: activeVaultId,
        activeVault: vaultById(activeVaultId),
        pretendCanadaOnly: Boolean(data.pretendCanadaOnly),
        activity: activity,
      };
    });
  }

  function addActivity(entry) {
    return getState().then(function (state) {
      var item = {
        id: crypto.randomUUID(),
        timestamp: entry.timestamp || new Date().toISOString(),
        vaultId: entry.vaultId || state.activeVaultId,
        vaultName: entry.vaultName || vaultById(entry.vaultId || state.activeVaultId).name,
        host: entry.host || "",
        decision: entry.decision || "unknown",
        redactions: {
          email: Number(entry.redactions && entry.redactions.email) || 0,
          phone: Number(entry.redactions && entry.redactions.phone) || 0,
          sin: Number(entry.redactions && entry.redactions.sin) || 0,
          card: Number(entry.redactions && entry.redactions.card) || 0,
        },
        note: entry.note || "",
      };
      var activity = [item].concat(state.activity).slice(0, 500);
      return chrome.storage.local.set({ activity: activity }).then(function () { return item; });
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function injectHighlightStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = "::highlight(" + HIGHLIGHT + "){text-decoration:underline wavy #c7462e;text-decoration-thickness:2px}";
    if (document.documentElement) document.documentElement.appendChild(style);
  }

  function showNotice(opts) {
    opts = opts || {};
    var existing = document.getElementById(MODAL_ID);
    if (existing) existing.remove();
    var host = document.createElement("div");
    host.id = MODAL_ID;
    host.setAttribute("data-northgate", "modal");
    var shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML =
      '<style>:host{all:initial}.scrim{position:fixed;inset:0;z-index:2147483647;background:rgba(20,36,28,.45);display:grid;place-items:center;font:14px/1.45 "Segoe UI",system-ui,sans-serif}.card{width:min(420px,calc(100vw - 32px));background:#f4efe4;color:#14241c;border-radius:10px;padding:20px 20px 16px;box-shadow:0 16px 40px rgba(0,0,0,.25)}h2{margin:0 0 8px;font-size:18px}p{margin:0 0 16px;color:#5c6a62}button{font:inherit;border:0;border-radius:6px;background:#1b3d2f;color:#f4efe4;padding:8px 12px;cursor:pointer}</style>' +
      '<div class="scrim"><div class="card" role="dialog" aria-modal="true"><h2>' +
      escapeHtml(opts.title || "Northgate") +
      "</h2><p>" +
      escapeHtml(opts.message || "") +
      '</p><button type="button" id="ng-ok">' +
      escapeHtml(opts.button || "OK") +
      "</button></div></div>";
    shadow.getElementById("ng-ok").addEventListener("click", function () { host.remove(); });
    var scrim = shadow.querySelector(".scrim");
    scrim.addEventListener("click", function (event) {
      if (event.target === scrim) host.remove();
    });
    document.documentElement.appendChild(host);
  }

  function underlineMatches(root) {
    injectHighlightStyle();
    if (!CSS.highlights || !root) return;
    CSS.highlights.delete(HIGHLIGHT);
    if (root instanceof HTMLTextAreaElement || root instanceof HTMLInputElement) return;
    var highlight = new Highlight();
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    var node;
    while ((node = walker.nextNode())) {
      var hits = findMatches(node.data);
      for (var i = 0; i < hits.length; i += 1) {
        var range = new Range();
        range.setStart(node, hits[i].start);
        range.setEnd(node, hits[i].end);
        highlight.add(range);
      }
    }
    CSS.highlights.set(HIGHLIGHT, highlight);
  }

  function clearUnderlines() {
    if (CSS.highlights) CSS.highlights.delete(HIGHLIGHT);
  }

  var COMPOSER_SELECTORS = ["#prompt-textarea", "form textarea", 'form [contenteditable="true"]'];
  var SEND_TESTID = "send-button";
  var SEND_LABELS = { "send prompt": true, send: true };
  var paintFrame = 0;
  var pendingResubmit = false;
  var lastRedacted = "";
  var holdUntil = 0;
  var cache = { pretendCanadaOnly: false, vaultName: "", vaultId: "" };

  function refreshCache() {
    getState().then(function (state) {
      cache = {
        pretendCanadaOnly: state.pretendCanadaOnly,
        vaultName: state.activeVault.name,
        vaultId: state.activeVaultId,
      };
    });
  }

  function resolveEditable(node) {
    if (!node) return null;
    if (node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement) return node;
    if (node.isContentEditable) return node;
    return node.querySelector("[contenteditable='true']") || node;
  }

  function getComposer() {
    for (var i = 0; i < COMPOSER_SELECTORS.length; i += 1) {
      var node = document.querySelector(COMPOSER_SELECTORS[i]);
      if (node) return resolveEditable(node);
    }
    return null;
  }

  function isInsideComposer(node) {
    var composer = getComposer();
    return Boolean(composer && node && (node === composer || composer.contains(node)));
  }

  function isSendButton(node) {
    var button = node && node.closest ? node.closest("button") : null;
    if (!button) return false;
    var testid = button.getAttribute("data-testid") || "";
    var label = (button.getAttribute("aria-label") || "").toLowerCase();
    if (testid.indexOf("stop") !== -1 || label.indexOf("stop") !== -1) return false;
    return testid === SEND_TESTID || Boolean(SEND_LABELS[label]);
  }

  function readComposer(el) {
    if (!el) return "";
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return el.value;
    return el.innerText || el.textContent || "";
  }

  function writeComposer(el, text) {
    if (!el) return;
    el.focus();
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      el.value = text;
      el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
      return;
    }
    var selection = window.getSelection();
    var range = document.createRange();
    range.selectNodeContents(el);
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand("insertText", false, text);
  }

  function normalize(text) {
    return String(text || "").replace(/\s+/g, " ").trim();
  }

  function composerIsSafe(result, expectedRedacted) {
    if (!result.found) return true;
    return Boolean(expectedRedacted && normalize(result.original) === normalize(expectedRedacted));
  }

  function stopSend(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function resetPending() {
    pendingResubmit = false;
    lastRedacted = "";
  }

  function liveScan() {
    var composer = getComposer();
    if (!composer) {
      paintBanner("Watching composer", cache.vaultName || "ChatGPT");
      clearUnderlines();
      return;
    }
    var result = scanText(readComposer(composer));
    underlineMatches(composer);
    if (result.found) {
      resetPending();
      paintBanner(
        cache.pretendCanadaOnly ? "PII in composer — send will be blocked" : "PII in composer — will redact on send",
        cache.vaultName,
        cache.pretendCanadaOnly ? "block" : "warn"
      );
      return;
    }
    if (pendingResubmit) {
      paintBanner("Redacted — press Send again", cache.vaultName, "warn");
      return;
    }
    paintBanner("No PII detected", cache.vaultName);
  }

  function onEdit(event) {
    if (!isInsideComposer(event.target)) return;
    cancelAnimationFrame(paintFrame);
    paintFrame = requestAnimationFrame(liveScan);
  }

  function onClick(event) {
    if (!isSendButton(event.target)) return;
    handleSend(event);
  }

  function onKeydown(event) {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    if (!isInsideComposer(event.target)) return;
    handleSend(event);
  }

  function onSubmit(event) {
    var composer = getComposer();
    if (!composer) return;
    if (event.target instanceof HTMLFormElement && event.target.contains(composer)) {
      handleSend(event);
    }
  }

  function logDecision(decision, result) {
    addActivity({
      vaultId: cache.vaultId,
      vaultName: cache.vaultName,
      host: location.hostname.replace(/^www\./, ""),
      decision: decision,
      redactions: result.counts,
    }).catch(function () {});
  }

  function handleSend(event) {
    if (Date.now() < holdUntil) {
      stopSend(event);
      return;
    }

    var composer = getComposer();
    var raw = readComposer(composer);
    if (!composer || !raw.trim()) return;

    var result = scanText(raw);
    if (composerIsSafe(result, lastRedacted)) {
      var decision = pendingResubmit ? "Sent after redaction" : "No PII detected";
      paintBanner(decision, cache.vaultName);
      clearUnderlines();
      logDecision(decision, result);
      resetPending();
      return;
    }

    stopSend(event);
    holdUntil = Date.now() + 500;

    if (cache.pretendCanadaOnly) {
      paintBanner("Stayed in Canada (blocked)", cache.vaultName, "block");
      showNotice({
        title: "Stayed in Canada (blocked)",
        message: "Structured PII was found and Pretend Canada-only is on. The prompt was not sent. This prototype does not route to a Canadian model.",
      });
      logDecision("Stayed in Canada (blocked)", result);
      resetPending();
      return;
    }

    writeComposer(composer, result.redacted);
    var verified = scanText(readComposer(composer));
    if (!composerIsSafe(verified, result.redacted)) {
      paintBanner("Redaction failed — send blocked", cache.vaultName, "block");
      showNotice({
        title: "Send blocked",
        message: "Northgate could not rewrite the ChatGPT composer. The original prompt was not sent. Remove the highlighted PII yourself, then press Send.",
      });
      logDecision("Redaction failed (blocked)", result);
      resetPending();
      return;
    }

    lastRedacted = result.redacted;
    pendingResubmit = true;
    clearUnderlines();
    paintBanner("Redacted — press Send again", cache.vaultName, "warn");
    showNotice({
      title: "Redacted — press Send again",
      message: "Structured PII was replaced in the composer. Review the tokens, then press Send or Enter once more. Northgate will not submit for you.",
    });
    logDecision("Redacted — waiting for resubmit", result);
  }

  function initChatgpt(host) {
    paintBanner("Watching composer", host.label + " · redaction is local; send still goes to the site");
    refreshCache();
    chrome.storage.onChanged.addListener(refreshCache);
    document.addEventListener("input", onEdit, true);
    document.addEventListener("paste", onEdit, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeydown, true);
    document.addEventListener("submit", onSubmit, true);
    window.setTimeout(liveScan, 400);
  }

  try {
    var host = matchHost(location);
    if (host && host.enabled && host.id === "chatgpt") {
      initChatgpt(host);
    } else {
      paintBanner("Northgate · script loaded", host ? host.label + " is not enabled in V1" : "");
    }
  } catch (err) {
    console.warn("[northgate] adapter init failed", err);
    paintBanner("Northgate · script loaded", "adapter failed; banner is up");
  }
})();
