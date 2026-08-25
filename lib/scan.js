/**
 * Structured-PII scanner (regex only). Host-agnostic core.
 * Tokens: [EMAIL] [PHONE] [SIN] [CARD]
 */

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/g;
const SIN = /\b\d{3}-\d{3}-\d{3}\b/g;
const CARD_SHAPED = /\b(?:\d[ -]?){13,19}\b/g;

const TOKEN = {
  email: "[EMAIL]",
  phone: "[PHONE]",
  sin: "[SIN]",
  card: "[CARD]",
};

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
    if (!accept(hit[0])) continue;
    hits.push({
      type,
      start: hit.index,
      end: hit.index + hit[0].length,
      value: hit[0],
    });
  }
  return hits;
}

export function findMatches(text) {
  const source = String(text || "");
  const raw = [
    ...collect("email", source, EMAIL),
    ...collect("card", source, CARD_SHAPED, (value) => {
      const digits = value.replace(/\D/g, "");
      return digits.length >= 13 && digits.length <= 19 && luhnOk(digits);
    }),
    ...collect("sin", source, SIN),
    ...collect("phone", source, PHONE),
  ];

  raw.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));

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
  const counts = { email: 0, phone: 0, sin: 0, card: 0 };
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
