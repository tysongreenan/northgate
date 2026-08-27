/**
 * Host-agnostic overlay: top banner, block modal, match underlines.
 * Adapters pass copy. This file has no ChatGPT / OpenAI types.
 */

const BANNER_ID = "northgate-banner-host";
const MODAL_ID = "northgate-modal-host";
const STYLE_ID = "northgate-highlight-style";
const HIGHLIGHT = "northgate-pii";

let matchFinder = () => [];

export function ensureOverlay() {
  injectHighlightStyle();
  if (!document.getElementById(BANNER_ID)) {
    const host = document.createElement("div");
    host.id = BANNER_ID;
    host.setAttribute("data-northgate", "banner");
    host.style.cssText =
      "position:fixed;top:0;left:0;right:0;z-index:2147483646;height:36px;pointer-events:none;";
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .bar {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 2147483646;
          display: flex;
          align-items: center;
          gap: 10px;
          height: 36px;
          box-sizing: border-box;
          padding: 0 16px;
          background: #1d1d1f;
          color: #fff;
          font: 12px/1.3 system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
        }
        .name { font-weight: 600; letter-spacing: -0.02em; }
        .status { font-weight: 500; }
        .detail { color: #a1a1a6; }
        .bar.warn .status,
        .bar.block .status { color: #c9a227; }
      </style>
      <div class="bar" part="bar">
        <span class="name">Northgate</span>
        <span class="status"></span>
        <span class="detail"></span>
      </div>
    `;
    document.documentElement.append(host);
    document.documentElement.style.scrollPaddingTop = "36px";
  }
}

export function setBanner({ status, detail, tone } = {}) {
  ensureOverlay();
  const host = document.getElementById(BANNER_ID);
  const bar = host?.shadowRoot?.querySelector(".bar");
  if (!bar) return;
  bar.classList.remove("warn", "block");
  if (tone === "warn" || tone === "block") bar.classList.add(tone);
  bar.querySelector(".status").textContent = status || "Watching composer";
  bar.querySelector(".detail").textContent = detail || "";
}

export function showNotice({ title, message, button } = {}) {
  showDialog({
    title: title || "Northgate",
    message: message || "",
    button: button || "OK",
  });
}

export function showBlockModal({ title, message } = {}) {
  showNotice({
    title: title || "Stayed in Canada (blocked)",
    message: message || "Structured PII was found. Send was blocked.",
  });
}

function showDialog({ title, message, button } = {}) {
  let host = document.getElementById(MODAL_ID);
  if (host) host.remove();

  host = document.createElement("div");
  host.id = MODAL_ID;
  host.setAttribute("data-northgate", "modal");
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
      <style>
      :host { all: initial; }
      .scrim {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        pointer-events: auto;
        background: rgba(29, 29, 31, 0.45);
        display: grid;
        place-items: center;
        font: 14px/1.4 system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
      }
      .card {
        width: min(380px, calc(100vw - 32px));
        background: #fff;
        color: #1d1d1f;
        border-radius: 16px;
        padding: 20px 20px 16px;
      }
      h2 {
        margin: 0 0 6px;
        font-size: 17px;
        font-weight: 600;
        letter-spacing: -0.025em;
      }
      p { margin: 0 0 16px; color: #6e6e73; font-size: 13px; }
      button {
        font: inherit;
        border: 0;
        border-radius: 9999px;
        background: #0066cc;
        color: #fff;
        padding: 7px 16px;
        cursor: pointer;
      }
      button:active { transform: scale(0.95); }
      button:focus-visible { outline: 2px solid #0066cc; outline-offset: 2px; }
    </style>
    <div class="scrim">
      <div class="card" role="dialog" aria-modal="true" aria-labelledby="ng-title">
        <h2 id="ng-title">${escapeHtml(title || "Northgate")}</h2>
        <p>${escapeHtml(message || "")}</p>
        <button type="button" id="ng-ok">${escapeHtml(button || "Dismiss")}</button>
      </div>
    </div>
  `;
  shadow.getElementById("ng-ok").addEventListener("click", () => host.remove());
  shadow.querySelector(".scrim").addEventListener("click", (event) => {
    if (event.target.classList.contains("scrim")) host.remove();
  });
  document.documentElement.append(host);
  shadow.getElementById("ng-ok").focus();
}

export function bindMatchFinder(fn) {
  matchFinder = typeof fn === "function" ? fn : () => [];
}

export function underlineMatches(root) {
  injectHighlightStyle();
  if (!CSS.highlights || !root) return;

  CSS.highlights.delete(HIGHLIGHT);
  // Textareas have no text nodes to highlight. Banner still scans them.
  if (root instanceof HTMLTextAreaElement || root instanceof HTMLInputElement) {
    return;
  }

  const highlight = new Highlight();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const hits = matchFinder(node.data);
    for (const hit of hits) {
      const range = new Range();
      range.setStart(node, hit.start);
      range.setEnd(node, hit.end);
      highlight.add(range);
    }
  }
  CSS.highlights.set(HIGHLIGHT, highlight);
}

export function clearUnderlines() {
  if (CSS.highlights) CSS.highlights.delete(HIGHLIGHT);
}

function injectHighlightStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    ::highlight(${HIGHLIGHT}) {
      text-decoration: underline wavy #c7462e;
      text-decoration-thickness: 2px;
    }
  `;
  document.documentElement.append(style);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
