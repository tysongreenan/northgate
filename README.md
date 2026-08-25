# Northgate

Northgate is a **local-load Manifest V3 Chrome extension** that sits on ChatGPT in the browser and redacts structured PII before you send a prompt. It is a Monday V1 prototype for agency/clinic staff in Canada: sign in locally, pick a client vault, scan the composer, badge the decision, and keep an activity log you can download for a PIPEDA / Law 25 report sketch. It is **not** a store listing, **not** a production deploy, **not** a Canadian model router, and **not** a replacement chat window.

Clone: https://github.com/tysongreenan/northgate

## Load unpacked (no build)

1. Clone the repo:
   `git clone https://github.com/tysongreenan/northgate`
2. Open Chrome and go to `chrome://extensions`
3. Turn on **Developer mode**
4. Click **Load unpacked**
5. Select this folder (the one that contains `manifest.json`)

Vanilla HTML/CSS/JS. No install step, no bundler.

The page inject is **one classic `content.js`** (no `import`/`export`, no `type: module`, no `web_accessible_resources`). Banner paint and the ChatGPT adapter live in that file. Popup/options may use ES modules because they are extension pages, not page-injects.

## How to test (ChatGPT only)

1. Click the Northgate icon. Enter any name → **Sign in**. Pick **Sway — Acme Clinic** or **Sway — Birch Marketing**.
2. Open https://chatgpt.com (stay on that site — Northgate does not give you a paste box).
3. You should see a green **Northgate** banner at the top immediately (even on a guest page, before anyone types). First paint says **Northgate · script loaded**, then it upgrades when the adapter starts.
4. In the ChatGPT composer type something like:
   `Email jane@clinic.ca or call 416-555-0100`
5. Matches get a wavy underline (contenteditable). The banner reads **PII in composer — will redact on send**. Textarea composers get the banner only.
6. Press **Enter** or **Send**. Northgate **stops that send**, rewrites the composer to `[EMAIL]` / `[PHONE]`, and shows a modal. **OK only dismisses the dialog** — it must not submit.
7. After the modal is gone, press **Send** again. Only then does the redacted text go out. Banner: **Sent after redaction**. If the rewrite did not stick, the original is never sent.
8. Open the popup or **Open log**. Download **JSON** or **CSV**.
9. Optional: turn on **Pretend Canada-only (demo)** and send PII again. A modal blocks the send: **Stayed in Canada (blocked)**.

Honest labels: if text is sent to ChatGPT it still goes to OpenAI. “Stayed in Canada” only means the demo toggle blocked the send. There is no Canadian model route in this prototype.

## Hosts

Hosts live in `lib/hosts.js`. V1 **enables only** ChatGPT:

| Host | Status |
| --- | --- |
| ChatGPT (`chatgpt.com`, `chat.openai.com`) | Implemented |
| Claude (`claude.ai`) | Empty slot |
| Gemini (`gemini.google.com`) | Empty slot |
| Grok (`grok.com`, `grok.x.ai`, `x.com/i/grok*`) | Empty slot |

Adding Claude later is: flip `enabled` in `lib/hosts.js` and the host list inside classic `content.js`, add one match to `manifest.json`, then add the Claude bind to `content.js` (or a future classic flatten). Do not introduce WAR or module content scripts.

The ChatGPT bind in `content.js` uses `#prompt-textarea`, `textarea` / `contenteditable`, Send (`button[data-testid="send-button"]` / `aria-label="Send prompt"`), and Enter. First Send redacts and asks for a resubmit; it never auto-clicks Send.

ChatGPT’s composer is reliable for this V1. Other sites are not wired.

## Non-goals

- Cursor, Slack, Word, MCP, desktop MITM
- A replacement paste window or custom chat UI (that is the Shielk shape)
- `<all_urls>`, `webRequest`, DNR body inspection, cookies, history, tabs
- Screenshot OCR
- Chrome Web Store listing
- Real Canadian-hosted model routing
- Backend, Vercel, secrets, production deploy
