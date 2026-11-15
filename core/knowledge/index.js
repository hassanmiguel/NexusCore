"use strict";

const path = require("path");
const crypto = require("crypto");
const { extractFile, chunkText, isSupported, supportedExtensions } = require("./chunker");
const { termsFrom, cosine, keywordScore, vectorForItem } = require("../memory/embeddings");

function createId() {
  return "kdoc_" + Date.now().toString(36) + "_" + crypto.randomBytes(4).toString("hex");
}

function ensureStore(data) {
  data.ai = data.ai && typeof data.ai === "object" ? data.ai : {};
  data.ai.knowledge = data.ai.knowledge && typeof data.ai.knowledge === "object"
    ? data.ai.knowledge
    : { documents: [], schema: 1 };
  return data.ai.knowledge;
}

function listDocuments(data) {
  return ensureStore(data).documents.map(doc => ({
    id: doc.id,
    name: doc.name,
    source: doc.source,
    chunkCount: (doc.chunks || []).length,
    sizeBytes: doc.sizeBytes || 0,
    mimeType: doc.mimeType || "unknown",
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  }));
}

function getDocument(data, docId) {
  return ensureStore(data).documents.find(doc => doc.id === docId) || null;
}

function ingestFile(data, filePath, opts = {}) {
  if (!isSupported(filePath)) {
    throw new Error(`Unsupported file: ${path.basename(String(filePath))}`);
  }

  const store = ensureStore(data);
  const name = path.basename(String(filePath));
  const rawText = extractFile(filePath);
  const chunks = chunkText(rawText, {
    chunkSize: opts.chunkSize,
    overlap: opts.overlap,
    source: name
  });

  // Remove existing document with same name (replace).
  const existingIdx = store.documents.findIndex(doc => doc.name === name);
  if (existingIdx >= 0) store.documents.splice(existingIdx, 1);

  const docId = createId();
  const enrichedChunks = chunks.map(chunk => ({
    ...chunk,
    docId,
    terms: termsFrom(chunk.content)
  }));

  const doc = {
    id: docId,
    name,
    source: filePath,
    mimeType: guessMime(name),
    sizeBytes: rawText.length,
    chunks: enrichedChunks,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  store.documents.push(doc);
  return { docId, name, chunkCount: enrichedChunks.length };
}

function ingestText(data, text, opts = {}) {
  const store = ensureStore(data);
  const name = String(opts.name || "pasted_text").trim();
  const chunks = chunkText(text, {
    chunkSize: opts.chunkSize,
    overlap: opts.overlap,
    source: name
  });

  const existingIdx = store.documents.findIndex(doc => doc.name === name && doc.source === "__pasted__");
  if (existingIdx >= 0) store.documents.splice(existingIdx, 1);

  const docId = createId();
  const enrichedChunks = chunks.map(chunk => ({
    ...chunk,
    docId,
    terms: termsFrom(chunk.content)
  }));

  const doc = {
    id: docId,
    name,
    source: "__pasted__",
    mimeType: "text/plain",
    sizeBytes: text.length,
    chunks: enrichedChunks,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  store.documents.push(doc);
  return { docId, name, chunkCount: enrichedChunks.length };
}

function removeDocument(data, docId) {
  const store = ensureStore(data);
  const index = store.documents.findIndex(doc => doc.id === docId);
  if (index < 0) return false;
  store.documents.splice(index, 1);
  return true;
}

function search(data, query, opts = {}) {
  const text = String(query || "").trim();
  if (!text) return { query: "", results: [] };

  const queryTerms = termsFrom(text);
  const queryVector = vectorForItem({ terms: queryTerms }).vector;
  const k = Number.isFinite(opts.k) ? opts.k : 5;
  const docId = opts.docId || null;
  const minScore = Number.isFinite(opts.minScore) ? opts.minScore : 0.10;

  const store = ensureStore(data);
  const docs = docId
    ? store.documents.filter(doc => doc.id === docId)
    : store.documents;

  const results = [];

  for (const doc of docs) {
    if (!Array.isArray(doc.chunks)) continue;
    for (const chunk of doc.chunks) {
      if (!chunk || !chunk.content) continue;
      const chunkTerms = chunk.terms || termsFrom(chunk.content);
      const chunkVector = vectorForItem({ terms: chunkTerms }).vector;
      const vs = cosine(queryVector, chunkVector);
      const ks = keywordScore(queryTerms, chunkTerms);
      const score = vs * 0.6 + ks * 0.4;
      if (score < minScore) continue;
      results.push({
        docId: doc.id,
        docName: doc.name,
        source: doc.source,
        chunkId: chunk.id,
        chunkIndex: chunk.index,
        text: chunk.content,
        score: Math.round(score * 1000) / 1000
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return { query: text, results: results.slice(0, k) };
}

function stats(data) {
  const store = ensureStore(data);
  const docCount = store.documents.length;
  const chunkCount = store.documents.reduce((sum, doc) => sum + (Array.isArray(doc.chunks) ? doc.chunks.length : 0), 0);
  return { docCount, chunkCount, extensions: supportedExtensions() };
}

function guessMime(name) {
  const ext = path.extname(String(name)).toLowerCase();
  const map = {
    ".txt": "text/plain", ".md": "text/markdown", ".json": "application/json",
    ".html": "text/html", ".htm": "text/html", ".csv": "text/csv",
    ".js": "text/javascript", ".ts": "text/typescript", ".css": "text/css",
    ".xml": "text/xml", ".log": "text/plain",
    ".py": "text/x-python", ".sh": "text/x-shellscript"
  };
  return map[ext] || "application/octet-stream";
}

module.exports = {
  ingestFile,
  ingestText,
  listDocuments,
  getDocument,
  removeDocument,
  search,
  stats,
  supportedExtensions
};