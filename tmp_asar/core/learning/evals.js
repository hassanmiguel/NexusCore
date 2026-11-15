"use strict";

// Evaluation record store: captures performance signals across the app
// (prompt quality, agent run outcomes, search relevance, user feedback)
// to inform improvement proposals. All data stays local and under user control.

function createId() {
  return "eval_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

function ensureEvals(data) {
  data.ai = data.ai && typeof data.ai === "object" ? data.ai : {};
  data.ai.evals = data.ai.evals && typeof data.ai.evals === "object"
    ? data.ai.evals
    : { records: [], feedback: [], schema: 1 };
  return data.ai.evals;
}

function saveRecord(data, input = {}) {
  const store = ensureEvals(data);
  const record = {
    id: createId(),
    kind: String(input.kind || "general").slice(0, 40),
    prompt: String(input.prompt || "").slice(0, 800),
    response: String(input.response || "").slice(0, 1200),
    score: Number.isFinite(input.score) ? input.score : null,
    tags: Array.isArray(input.tags) ? input.tags.slice(0, 12) : [],
    metrics: input.metrics && typeof input.metrics === "object" ? input.metrics : {},
    source: String(input.source || "manual").slice(0, 60),
    createdAt: new Date().toISOString()
  };
  store.records.push(record);
  store.records = store.records.slice(-500);
  return record;
}

function addFeedback(data, input = {}) {
  const store = ensureEvals(data);
  const item = {
    id: createId(),
    evalId: input.evalId || null,
    kind: String(input.kind || "general").slice(0, 40),
    text: String(input.text || "").slice(0, 600),
    score: Number.isFinite(input.score) ? input.score : null,
    createdAt: new Date().toISOString()
  };
  store.feedback.push(item);
  store.feedback = store.feedback.slice(-300);
  return item;
}

function list(data, opts = {}) {
  const store = ensureEvals(data);
  const kind = opts.kind || null;
  const records = (store.records || []).filter(item => !kind || item.kind === kind);
  const k = Number.isFinite(opts.k) ? opts.k : 50;
  return records.slice(-k);
}

function stats(data) {
  const store = ensureEvals(data);
  const records = store.records || [];
  const feedback = store.feedback || [];
  const kinds = {};
  for (const record of records) kinds[record.kind] = (kinds[record.kind] || 0) + 1;
  return { total: records.length, feedbackCount: feedback.length, kinds };
}

function averageScore(data, opts = {}) {
  const records = list(data, opts);
  const scored = records.filter(item => Number.isFinite(item.score));
  if (scored.length === 0) return { avg: null, count: 0 };
  const sum = scored.reduce((s, item) => s + item.score, 0);
  return { avg: Math.round((sum / scored.length) * 1000) / 1000, count: scored.length };
}

module.exports = {
  saveRecord,
  addFeedback,
  list,
  stats,
  averageScore
};