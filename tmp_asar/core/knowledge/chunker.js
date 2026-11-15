"use strict";

const fs = require("fs");
const path = require("path");

const EXTRACTORS = {
  ".txt": extractPlainText,
  ".md": extractPlainText,
  ".json": extractPlainText,
  ".html": extractHtml,
  ".htm": extractHtml,
  ".js": extractCode,
  ".ts": extractCode,
  ".tsx": extractCode,
  ".jsx": extractCode,
  ".py": extractCode,
  ".sh": extractCode,
  ".css": extractCode,
  ".xml": extractCode,
  ".csv": extractPlainText,
  ".log": extractPlainText
};

function supportedExtensions() {
  return Object.keys(EXTRACTORS);
}

function isSupported(filePath) {
  return EXTRACTORS.hasOwnProperty(path.extname(String(filePath)).toLowerCase());
}

function extractPlainText(filePath) {
  return fs.readFileSync(filePath, "utf8").toString().normalize("NFKC");
}

function extractCode(filePath) {
  return extractPlainText(filePath);
}

function extractHtml(filePath) {
  const raw = extractPlainText(filePath);
  // Basic tag stripping: remove <script>...</script>, <style>...</style>, then remaining tags.
  let text = raw.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ");
  text = text.replace(/<[^>]+>/g, " ");
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#?[0-9a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function chunkText(text, opts = {}) {
  const chunkSize = Number.isFinite(opts.chunkSize) ? opts.chunkSize : 400;   // tokens (approx words)
  const overlap = Number.isFinite(opts.overlap) ? opts.overlap : 60;           // overlap in words
  const source = String(opts.source || "");
  const docId = opts.docId || null;

  const normalized = String(text || "").trim().normalize("NFKC");
  if (!normalized) return [];

  const words = normalized.split(/\s+/);
  const chunks = [];
  let start = 0;
  let index = 0;

  while (start < words.length) {
    const end = Math.min(start + chunkSize, words.length);
    const chunkWords = words.slice(start, end);
    const content = chunkWords.join(" ").trim();
    if (content.length > 20) {
      chunks.push({
        id: `${docId || "doc"}_chunk_${index}`,
        docId,
        index,
        source,
        content,
        wordCount: chunkWords.length
      });
      index += 1;
    }
    if (end >= words.length) break;
    start = end - overlap;
    if (start <= end - chunkSize) start = end;
  }

  return chunks;
}

function extractFile(filePath) {
  const ext = path.extname(String(filePath)).toLowerCase();
  const extractor = EXTRACTORS[ext];
  if (!extractor) throw new Error(`Unsupported file type: ${ext}`);
  return extractor(filePath);
}

module.exports = {
  extractFile,
  chunkText,
  isSupported,
  supportedExtensions
};