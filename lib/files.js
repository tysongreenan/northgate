/**
 * Local file-text extraction for ChatGPT attach scanning.
 * PDF + plain/text-ish only. No OCR. No network.
 */

import { emptyCounts, mergeCounts, scanText } from "./scan.js";

export const FILE_SCAN_CAP = 5 * 1024 * 1024;

const TEXT_EXT = /\.(txt|text|md|markdown|csv|tsv|json|html|htm|xml|log|rtf)$/i;
const PDF_EXT = /\.pdf$/i;

export function isTextishFile(file) {
  const name = String(file?.name || "");
  const type = String(file?.type || "").toLowerCase();
  if (type.startsWith("text/")) return true;
  if (type === "application/json" || type === "application/xml") return true;
  return TEXT_EXT.test(name);
}

export function isPdfFile(file) {
  const name = String(file?.name || "");
  const type = String(file?.type || "").toLowerCase();
  return type === "application/pdf" || PDF_EXT.test(name);
}

export function bytesToBinaryString(bytes) {
  const chunk = 0x8000;
  let out = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return out;
}

export function pdfLiteralStrings(source) {
  const parts = [];
  const re = /\((?:\\.|[^\\)])*\)/g;
  let hit;
  while ((hit = re.exec(source))) {
    parts.push(
      hit[0]
        .slice(1, -1)
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\([\\()])/g, "$1")
    );
  }
  return parts.join(" ");
}

export async function inflatePdfBytes(bytes) {
  const methods = ["deflate", "deflate-raw"];
  for (const method of methods) {
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(method));
      const out = new Uint8Array(await new Response(stream).arrayBuffer());
      if (out.length) return out;
    } catch {
      // try the next wrapper
    }
  }
  return null;
}

export async function extractPdfText(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const raw = bytesToBinaryString(bytes);
  const chunks = [pdfLiteralStrings(raw)];

  const streamRe = /stream\r?\n([\s\S]*?)endstream/g;
  let hit;
  while ((hit = streamRe.exec(raw))) {
    const payload = hit[1];
    const rawBytes = new Uint8Array(payload.length);
    for (let i = 0; i < payload.length; i += 1) {
      rawBytes[i] = payload.charCodeAt(i) & 0xff;
    }
    const inflated = await inflatePdfBytes(rawBytes);
    if (inflated) {
      chunks.push(pdfLiteralStrings(bytesToBinaryString(inflated)));
      chunks.push(bytesToBinaryString(inflated).replace(/[^\x09\x0a\x0d\x20-\x7e]/g, " "));
    }
  }

  return chunks.join(" ").replace(/\s+/g, " ").trim();
}

export async function extractFileText(file) {
  if (!file || typeof file.size !== "number") return "";
  if (file.size > FILE_SCAN_CAP) return "";
  if (isPdfFile(file)) {
    const buffer = await file.arrayBuffer();
    return extractPdfText(buffer);
  }
  if (isTextishFile(file)) {
    return file.text();
  }
  return "";
}

export async function scanFiles(files) {
  const list = Array.from(files || []);
  const counts = emptyCounts();
  const scanned = [];
  let found = false;
  let redactedPreview = "";

  for (const file of list) {
    const nameResult = scanText(file.name || "");
    const text = await extractFileText(file);
    const bodyResult = scanText(text);
    mergeCounts(counts, nameResult.counts);
    mergeCounts(counts, bodyResult.counts);
    const fileFound = nameResult.found || bodyResult.found;
    if (fileFound) {
      found = true;
      redactedPreview = bodyResult.found ? bodyResult.redacted : nameResult.redacted;
    }
    scanned.push({
      name: file.name || "",
      type: file.type || "",
      found: fileFound,
    });
  }

  return {
    found,
    counts,
    scanned,
    redacted: redactedPreview,
    fileCount: list.length,
  };
}

export function minimalUncompressedPdf(text) {
  const safe = String(text || "").replace(/[()\\]/g, " ");
  const stream = `BT /F1 12 Tf 20 700 Td (${safe}) Tj ET`;
  return `%PDF-1.1
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>endobj
4 0 obj<< /Length ${stream.length} >>stream
${stream}
endstream
endobj
trailer<< >>
%%EOF
`;
}
