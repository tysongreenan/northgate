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
          gap: 12px;
          padding: 8px 16px;
          background: #1b3d2f;
          color: #f4efe4;
          font: 12px/1.35 "Segoe UI", system-ui, sans-serif;
          box-shadow: 0 1px 0 rgba(0,0,0,.15);
        }
        .name { font-weight: 700; letter-spacing: .02em; }
        .status { font-weight: 600; }
        .detail { color: #d5e0d8; }
        .bar.warn { background: #6b3a12; }
        .bar.block { background: #7a2418; }
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

export function showBlockModal({ title, message } = {}) {
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
        background: rgba(20, 36, 28, .45);
        display: grid;
        place-items: center;
        font: 14px/1.45 "Segoe UI", system-ui, sans-serif;
      }
      .card {
        width: min(420px, calc(100vw - 32px));
        background: #f4efe4;
        color: #14241c;
        border-radius: 10px;
        padding: 20px 20px 16px;
        box-shadow: 0 16px 40px rgba(0,0,0,.25);
      }
      h2 { margin: 0 0 8px; font-size: 18px; }
      p { margin: 0 0 16px; color: #5c6a62; }
      button {
        font: inherit;
        border: 0;
        border-radius: 6px;
        background: #1b3d2f;
        color: #f4efe4;
        padding: 8px 12px;
        cursor: pointer;
      }
    </style>
    <div class="scrim">
      <div class="card" role="dialog" aria-modal="true" aria-labelledby="ng-title">
        <h2 id="ng-title">${escapeHtml(title || "Stayed in Canada (blocked)")}</h2>
        <p>${escapeHtml(message || "Structured PII was found. Send was blocked.")}</p>
        <button type="button" id="ng-ok">Dismiss</button>
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
