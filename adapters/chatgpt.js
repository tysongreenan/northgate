/**
 * Source notes only. The live inject is the flattened classic `content.js`.
 * Do not load this file as a content script or WAR module.
 *
 * ChatGPT host adapter. If the composer DOM changes, update content.js.
 *
 * Public, documented hooks (not hashed class names):
 *   #prompt-textarea
 *   button[data-testid="send-button"]
 *   button[aria-label="Send prompt"]
 *   textarea / [contenteditable="true"] inside the composer form
 *   input[type=file] change, file drop/paste, attach|upload|file labels
 *
 * File attach (live code is content.js): hold the native FileList, scan
 * extracted text (PDF / text-ish), block-on-detect. Do not rewrite the PDF
 * or auto-send a redacted file. Isolated-world scripts cannot patch ChatGPT's
 * upload fetch without webRequest or WAR, both out of product lock.
 *
 * Nightfall-safer V1:
 *   1. Intercept Send / Enter before submit.
 *   2. Redact in place.
 *   3. Never auto-click Send (React/ProseMirror write may not stick).
 *   4. Ask the user to press Send again on the redacted text.
 *   5. Allow the next send only if the composer has no structured PII.
 * If the write fails, block and never send the original.
 */
import { scanText, findMatches } from "../lib/scan.js";
import { addActivity, getState } from "../lib/storage.js";
import {
  ensureOverlay,
  setBanner,
  showBlockModal,
  showNotice,
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

let paint = 0;
let pendingResubmit = false;
let lastRedacted = "";
let holdUntil = 0;
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

function normalize(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function composerIsSafe(result, expectedRedacted) {
  if (!result.found) return true;
  return Boolean(
    expectedRedacted && normalize(result.original) === normalize(expectedRedacted)
  );
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
    resetPending();
    setBanner({
      tone: cache.pretendCanadaOnly ? "block" : "warn",
      status: cache.pretendCanadaOnly
        ? "PII in composer — send will be blocked"
        : "PII in composer — will redact on send",
      detail: cache.vaultName,
    });
    return;
  }

  if (pendingResubmit) {
    setBanner({
      tone: "warn",
      status: "Redacted — press Send again",
      detail: cache.vaultName,
    });
    return;
  }

  setBanner({
    status: "No PII detected",
    detail: cache.vaultName,
  });
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
  if (!isSendButton(event.target)) return;
  handleSend(event);
}

function onKeydown(event) {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  if (!isInsideComposer(event.target)) return;
  handleSend(event);
}

function onSubmit(event) {
  const composer = getComposer();
  if (!composer) return;
  if (event.target instanceof HTMLFormElement && event.target.contains(composer)) {
    handleSend(event);
  }
}

function handleSend(event) {
  if (Date.now() < holdUntil) {
    stopSend(event);
    return;
  }

  const composer = getComposer();
  const raw = readComposer(composer);
  if (!composer || !raw.trim()) return;

  const result = scanText(raw);

  if (composerIsSafe(result, lastRedacted)) {
    const decision = pendingResubmit ? "Sent after redaction" : "No PII detected";
    setBanner({ status: decision, detail: cache.vaultName });
    clearUnderlines();
    logDecision(decision, result);
    resetPending();
    return;
  }

  stopSend(event);
  holdUntil = Date.now() + 500;

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
    resetPending();
    return;
  }

  writeComposer(composer, result.redacted);
  const verified = scanText(readComposer(composer));
  if (!composerIsSafe(verified, result.redacted)) {
    setBanner({
      tone: "block",
      status: "Redaction failed — send blocked",
      detail: cache.vaultName,
    });
    showNotice({
      title: "Send blocked",
      message:
        "Northgate could not rewrite the ChatGPT composer. The original prompt was not sent. Remove the highlighted PII yourself, then press Send.",
    });
    logDecision("Redaction failed (blocked)", result);
    resetPending();
    return;
  }

  lastRedacted = result.redacted;
  pendingResubmit = true;
  clearUnderlines();
  setBanner({
    tone: "warn",
    status: "Redacted — press Send again",
    detail: cache.vaultName,
  });
  showNotice({
    title: "Redacted — press Send again",
    message:
      "Structured PII was replaced in the composer. Review the tokens, then press Send or Enter once more. Northgate will not submit for you.",
  });
  logDecision("Redacted — waiting for resubmit", result);
}

function logDecision(decision, result) {
  addActivity({
    vaultId: cache.vaultId,
    vaultName: cache.vaultName,
    host: location.hostname.replace(/^www\./, ""),
    decision,
    redactions: result.counts,
  }).catch(() => {});
}
