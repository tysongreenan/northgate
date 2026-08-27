import { scanText } from "../lib/scan.js";
import { extractPdfText, fileNeedsHold, minimalUncompressedPdf, scanFiles } from "../lib/files.js";
import assert from "node:assert/strict";

function FakeFile(name, text, type) {
  return {
    name,
    type: type || "text/plain",
    size: text.length,
    text: async () => text,
    arrayBuffer: async () => new TextEncoder().encode(text).buffer,
  };
}

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
assert.equal(result.redacted.includes("416-555-0100"), false);
assert.equal(result.redacted.includes("123-456-789"), false);

const clean = scanText("Summarize yesterday's stand-up.");
assert.equal(clean.found, false);

const spacedSin = scanText("Patient SIN 123 456 789 on the chart.");
assert.equal(spacedSin.found, true);
assert.equal(spacedSin.counts.sin, 1);
assert.equal(spacedSin.redacted.includes("[SIN]"), true);
assert.equal(spacedSin.redacted.includes("123 456 789"), false);

const dashedSin = scanText("Keep dashed SIN 123-456-789 working.");
assert.equal(dashedSin.counts.sin, 1);
assert.equal(dashedSin.redacted.includes("[SIN]"), true);

const ohipDash = scanText("OHIP 1234-567-890 please bill.");
assert.equal(ohipDash.counts.ohip, 1);
assert.equal(ohipDash.redacted.includes("[OHIP]"), true);
assert.equal(ohipDash.redacted.includes("1234-567-890"), false);

const ohipSpace = scanText("Health number 1234 567 890");
assert.equal(ohipSpace.counts.ohip, 1);
assert.equal(ohipSpace.redacted.includes("[OHIP]"), true);

const ohipCompact = scanText("OHIP 1234567890");
assert.equal(ohipCompact.counts.ohip, 1);
assert.equal(ohipCompact.redacted.includes("[OHIP]"), true);

const ohipVersion = scanText("Version 1234-567-890-AB");
assert.equal(ohipVersion.counts.ohip, 1);
assert.equal(ohipVersion.counts.ramq, 0);

const cardNotRamq = scanText("Card 1234-567-890 stays OHIP, not RAMQ.");
assert.equal(cardNotRamq.counts.ohip, 1);
assert.equal(cardNotRamq.counts.ramq, 0);

const unlabeledCompact = scanText("Order id 1234567890 is not a labeled health number.");
assert.equal(unlabeledCompact.counts.ohip, 0);

const phoneStaysPhone = scanText("Call 416-555-0100");
assert.equal(phoneStaysPhone.counts.phone, 1);
assert.equal(phoneStaysPhone.counts.ohip, 0);
assert.equal(phoneStaysPhone.redacted.includes("[PHONE]"), true);

const knownPhoneMiss = scanText("Bare 555-0100 should stay a known miss.");
assert.equal(knownPhoneMiss.counts.phone, 0);
assert.equal(knownPhoneMiss.found, false);

const ramqGrouped = scanText("RAMQ ABCD 1234 5678");
assert.equal(ramqGrouped.counts.ramq, 1);
assert.equal(ramqGrouped.redacted.includes("[RAMQ]"), true);
assert.equal(ramqGrouped.redacted.includes("ABCD 1234 5678"), false);

const ramqCompact = scanText("NAM ABCD12345678");
assert.equal(ramqCompact.counts.ramq, 1);
assert.equal(ramqCompact.redacted.includes("[RAMQ]"), true);

const ramqDashed = scanText("Quebec card ABCD-1234-5678");
assert.equal(ramqDashed.counts.ramq, 1);

const together = scanText("SIN 123 456 789 OHIP 1234-567-890 RAMQ ABCD12345678");
assert.equal(together.counts.sin, 1);
assert.equal(together.counts.ohip, 1);
assert.equal(together.counts.ramq, 1);
assert.equal(together.redacted.includes("[SIN]"), true);
assert.equal(together.redacted.includes("[OHIP]"), true);
assert.equal(together.redacted.includes("[RAMQ]"), true);

const txtHit = await scanFiles([
  FakeFile("note.txt", "Dummy OHIP 1234-567-890 and SIN 123 456 789", "text/plain"),
]);
assert.equal(txtHit.found, true);
assert.equal(txtHit.counts.ohip, 1);
assert.equal(txtHit.counts.sin, 1);

const txtClean = await scanFiles([FakeFile("ok.txt", "Agenda only. No identifiers.", "text/plain")]);
assert.equal(txtClean.found, false);

const pdfSource = minimalUncompressedPdf("RAMQ ABCD 1234 5678");
const pdfText = await extractPdfText(new TextEncoder().encode(pdfSource));
assert.equal(pdfText.includes("ABCD 1234 5678"), true);
const pdfHit = await scanFiles([
  FakeFile("card.pdf", pdfSource, "application/pdf"),
]);
assert.equal(pdfHit.found, true);
assert.equal(pdfHit.counts.ramq, 1);

const imageSkipped = await scanFiles([
  {
    name: "screenshot.png",
    type: "image/png",
    size: 12,
    text: async () => {
      throw new Error("should not read image bytes as text");
    },
    arrayBuffer: async () => {
      throw new Error("should not OCR or parse screenshots");
    },
  },
]);
assert.equal(imageSkipped.found, false);
assert.equal(fileNeedsHold({ name: "screenshot.png", type: "image/png" }), false);
assert.equal(fileNeedsHold({ name: "note.txt", type: "text/plain" }), true);
assert.equal(fileNeedsHold({ name: "card.pdf", type: "application/pdf" }), true);
assert.equal(fileNeedsHold({ name: "ohip-1234-567-890.png", type: "image/png" }), true);

console.log("scan ok");
