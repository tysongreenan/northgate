/**
 * Structured-PII scanner (regex only). Host-agnostic core.
 * Tokens: [EMAIL] [PHONE] [SIN] [CARD] [OHIP] [RAMQ]
 *
 * OHIP: Ontario health number is a 10-digit lifetime id, often shown as
 * 1234-567-890 or 1234 567 890, sometimes with a 2-letter version code.
 * Ministry HCV request pattern is [1-9]\d{9} (ontario.ca HCV spec).
 * No client-side checksum is applied — current public docs do not publish
 * a check-digit algorithm, and Luhn would miss the well-known fake 1234-567-890.
 *
 * RAMQ: Quebec NAM is 4 letters + 8 digits (ABCD12345678 / ABCD 1234 5678).
 * Public DLP patterns treat that shape as the validator; no Luhn.
 *
 * SIN: dashed 123-456-789 and spaced 123 456 789. Token stays [SIN].
 */

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/g;
const SIN = /\b\d{3}[- ]\d{3}[- ]\d{3}\b/g;
const CARD_SHAPED = /\b(?:\d[ -]?){13,19}\b/g;
const OHIP_GROUPED = /\b[1-9]\d{3}[- ]\d{3}[- ]\d{3}(?:[- ][A-Za-z]{2})?\b/g;
const OHIP_COMPACT = /\b[1-9]\d{9}(?:[A-Za-z]{2})?\b/g;
const RAMQ_COMPACT = /\b[A-Za-z]{4}\d{8}\b/g;
const RAMQ_GROUPED = /\b[A-Za-z]{4}[ -]\d{4}[ -]\d{4}\b/g;
const OHIP_LABEL = /ohip|health\s*card|health\s*number|\bhcn\b|ontario\s*health/i;
const RAMQ_WORD = /^(card|form|file|code|from|with|this|that|name|user|data|note|page|item|type|date|text|only|also|into|over|your|have|been|will|they|them|json|html|http|post|send|open|save|edit|view|list|next|back|home|mail|call)$/i;

export const TOKEN = {
  email: "[EMAIL]",
  phone: "[PHONE]",
  sin: "[SIN]",
  card: "[CARD]",
  ohip: "[OHIP]",
  ramq: "[RAMQ]",
};

export function emptyCounts() {
  return { email: 0, phone: 0, sin: 0, card: 0, ohip: 0, ramq: 0 };
}

function clone(re) {
  return new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
}

export function luhnOk(digits) {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function collect(type, source, re, accept = () => true) {
  const hits = [];
  for (const hit of source.matchAll(clone(re))) {
    if (!accept(hit[0], source, hit.index)) continue;
    hits.push({
      type,
      start: hit.index,
      end: hit.index + hit[0].length,
      value: hit[0],
    });
  }
  return hits;
}

function acceptOhip(value, source, index) {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 10 || digits[0] === "0") return false;
  if (/[-\s]/.test(value)) return true;
  const from = Math.max(0, index - 28);
  const window = source.slice(from, index + value.length + 28);
  return OHIP_LABEL.test(window);
}

function acceptRamq(value) {
  if (/^[A-Za-z]{4}\d{8}$/.test(value)) return true;
  return !RAMQ_WORD.test(value.slice(0, 4));
}

export function findMatches(text) {
  const source = String(text || "");
  const raw = [
    ...collect("email", source, EMAIL),
    ...collect("card", source, CARD_SHAPED, (value) => {
      const digits = value.replace(/\D/g, "");
      return digits.length >= 13 && digits.length <= 19 && luhnOk(digits);
    }),
    ...collect("ohip", source, OHIP_GROUPED, acceptOhip),
    ...collect("ohip", source, OHIP_COMPACT, acceptOhip),
    ...collect("ramq", source, RAMQ_GROUPED, acceptRamq),
    ...collect("ramq", source, RAMQ_COMPACT, acceptRamq),
    ...collect("sin", source, SIN),
    ...collect("phone", source, PHONE),
  ];

  raw.sort((a, b) => a.start - b.start || b.end - a.start - (a.end - a.start));

  const matches = [];
  for (const hit of raw) {
    if (matches.some((kept) => hit.start < kept.end && hit.end > kept.start)) {
      continue;
    }
    matches.push(hit);
  }
  return matches;
}

export function scanText(text) {
  const source = String(text || "");
  const matches = findMatches(source);
  const counts = emptyCounts();
  let redacted = source;

  for (const hit of [...matches].sort((a, b) => b.start - a.start)) {
    redacted = redacted.slice(0, hit.start) + TOKEN[hit.type] + redacted.slice(hit.end);
    counts[hit.type] += 1;
  }

  return {
    original: source,
    redacted,
    counts,
    matches,
    found: matches.length > 0,
  };
}

export function mergeCounts(into, extra) {
  const out = into || emptyCounts();
  const add = extra || emptyCounts();
  for (const key of Object.keys(out)) {
    out[key] = (Number(out[key]) || 0) + (Number(add[key]) || 0);
  }
  return out;
}
