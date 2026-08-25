/**
 * ChatGPT host adapter. If the composer DOM changes, edit only this file.
 *
 * Public, documented hooks (not hashed class names):
 *   #prompt-textarea
 *   button[data-testid="send-button"]
 *   button[aria-label="Send prompt"]
 *   textarea / [contenteditable="true"] inside the composer form
 *
 * Nightfall-style: intercept before submit.
 * PRISMX-style: rewrite inline, then the send uses redacted text.
 * Control Zero-style: top banner + underlines on matches.
 * Canada-only demo: modal, do not send.
 */
import { scanText, findMatches } from "../lib/scan.js";
import { addActivity, getState } from "../lib/storage.js";
import {
  ensureOverlay,
  setBanner,
  showBlockModal,
  underlineMatches,
  bindMatchFinder,
  clearUnderlines,
} from "../lib/overlay.js";

const COMPOSER_SELECTORS = [
  "#prompt-textarea",
  "form textarea",
  "form [contenteditable=\"true\"]",
];

const SEND_TESTID = "send-button";
const SEND_LABELS = new Set(["send prompt", "send"]);

let passThrough = false;
let paint = 0;
let cache = {
  pretendCanadaOnly: false,
  vaultName: "",
  vaultId: "",
};

export const id = "chatgpt";

export function init(host) {
  bindMatchFinder(findMatches);
  ensureOverlay();
  setBanner({
    status: "Watching composer",
    detail: `${host.label} · redaction is local; send still goes to the site`,
  });

  refreshCache();
  chrome.storage.onChanged.addListener(refreshCache);

  document.addEventListener("input", onEdit, true);
  document.addEventListener("paste", onPaste, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeydown, true);
  document.addEventListener("submit", onSubmit, true);

  window.setTimeout(liveScan, 400);
}

async function refreshCache() {
  const state = await getState();
  cache = {
    pretendCanadaOnly: state.pretendCanadaOnly,
    vaultName: state.activeVault.name,
    vaultId: state.activeVaultId,
  };
}

function resolveEditable(node) {
  if (!node) return null;
  if (node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement) {
    return node;
  }
  if (node.isContentEditable) return node;
  return node.querySelector("[contenteditable='true']") || node;
}

function getComposer() {
  for (const selector of COMPOSER_SELECTORS) {
    const node = document.querySelector(selector);
    if (node) return resolveEditable(node);
  }
  return null;
}

function isInsideComposer(node) {
  const composer = getComposer();
  return Boolean(composer && node && (node === composer || composer.contains(node)));
}

function isSendButton(node) {
  const button = node?.closest?.("button");
  if (!button) return false;
  const testid = button.getAttribute("data-testid") || "";
  const label = (button.getAttribute("aria-label") || "").toLowerCase();
  if (testid.includes("stop") || label.includes("stop")) return false;
  return testid === SEND_TESTID || SEND_LABELS.has(label);
}

function findSendButton() {
  return (
    document.querySelector(`button[data-testid="${SEND_TESTID}"]`) ||
    document.querySelector('button[aria-label="Send prompt"]') ||
    document.querySelector('button[aria-label="Send"]')
  );
}

function readComposer(el) {
  if (!el) return "";
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    return el.value;
  }
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

  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(el);
  selection.removeAllRanges();
  selection.addRange(range);
  document.execCommand("insertText", false, text);
}

function liveScan() {
  const composer = getComposer();
  if (!composer) {
    setBanner({
      status: "Watching composer",
      detail: cache.vaultName || "ChatGPT",
    });
    clearUnderlines();
    return;
  }

  const result = scanText(readComposer(composer));
  underlineMatches(composer);

  if (result.found) {
    setBanner({
      tone: cache.pretendCanadaOnly ? "block" : "warn",
      status: cache.pretendCanadaOnly
        ? "PII in composer — send will be blocked"
        : "PII in composer — will redact on send",
      detail: cache.vaultName,
    });
  } else {
    setBanner({
      status: "No PII detected",
      detail: cache.vaultName,
    });
  }
}

function onEdit(event) {
  if (!isInsideComposer(event.target)) return;
  cancelAnimationFrame(paint);
  paint = requestAnimationFrame(liveScan);
}

function onPaste(event) {
  if (!isInsideComposer(event.target)) return;
  cancelAnimationFrame(paint);
  paint = requestAnimationFrame(liveScan);
}

function onClick(event) {
  if (passThrough) return;
  if (!isSendButton(event.target)) return;
  handleSend(event, "click");
}

function onKeydown(event) {
  if (passThrough) return;
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  if (!isInsideComposer(event.target)) return;
  handleSend(event, "enter");
}

function onSubmit(event) {
  if (passThrough) return;
  const composer = getComposer();
  if (!composer) return;
  if (event.target instanceof HTMLFormElement && event.target.contains(composer)) {
    handleSend(event, "submit");
  }
}

function handleSend(event, via) {
  const composer = getComposer();
  const text = readComposer(composer).trim();
  if (!composer || !text) return;

  const result = scanText(readComposer(composer));

  if (!result.found) {
    setBanner({ status: "No PII detected", detail: cache.vaultName });
    clearUnderlines();
    logDecision("No PII detected", result);
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();

  if (cache.pretendCanadaOnly) {
    setBanner({
      tone: "block",
      status: "Stayed in Canada (blocked)",
      detail: cache.vaultName,
    });
    showBlockModal({
      title: "Stayed in Canada (blocked)",
      message:
        "Structured PII was found and Pretend Canada-only is on. The prompt was not sent. This prototype does not route to a Canadian model.",
    });
    logDecision("Stayed in Canada (blocked)", result);
    return;
  }

  writeComposer(composer, result.redacted);
  clearUnderlines();
  setBanner({
    tone: "warn",
    status: "Sent after redaction",
    detail: cache.vaultName,
  });
  logDecision("Sent after redaction", result);
  replaySend(via);
}

function replaySend(via) {
  passThrough = true;
  const fire = () => {
    const button = findSendButton();
    if (via === "submit") {
      getComposer()?.closest("form")?.requestSubmit?.();
    } else if (button && !button.disabled) {
      button.click();
    }
    window.setTimeout(() => {
      passThrough = false;
    }, 80);
  };
  requestAnimationFrame(() => requestAnimationFrame(fire));
}

function logDecision(decision, result) {
  addActivity({
    vaultId: cache.vaultId,
    vaultName: cache.vaultName,
    host: "chatgpt.com",
    decision,
    redactions: result.counts,
  }).catch(() => {});
}
