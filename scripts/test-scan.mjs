import { scanText } from "../lib/scan.js";
import assert from "node:assert/strict";

const sample =
  "Email jane@clinic.ca or call 416-555-0100. SIN 123-456-789 card 4111111111111111";
const result = scanText(sample);

assert.equal(result.found, true);
assert.equal(result.counts.email, 1);
assert.equal(result.counts.phone, 1);
assert.equal(result.counts.sin, 1);
assert.equal(result.counts.card, 1);
assert.equal(
  result.redacted.includes("[EMAIL]") &&
    result.redacted.includes("[PHONE]") &&
    result.redacted.includes("[SIN]") &&
    result.redacted.includes("[CARD]"),
  true
);
assert.equal(result.redacted.includes("jane@clinic.ca"), false);

const clean = scanText("Summarize yesterday's stand-up.");
assert.equal(clean.found, false);

console.log("scan ok");
