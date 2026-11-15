"use strict";

// Improvement proposals: analyze eval records + user feedback, produce
// actionable suggestions for routing, prompt tweaks, knowledge gaps,
// and memory promotion. Each proposal is versioned and can be rolled back.

const evals = require("./evals");
const versions = require("./versions");

function createId() {
  return "prop_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

function ensureProposals(data) {
  data.ai = data.ai && typeof data.ai === "object" ? data.ai : {};
  data.ai.proposals = Array.isArray(data.ai.proposals) ? data.ai.proposals : [];
  return data.ai.proposals;
}

function rankCategoryCounts(data) {
  const records = evals.list(data, { k: 200 });
  const lowScored = records.filter(item => Number.isFinite(item.score) && item.score < 0.5);
  const counts = {};
  for (const r of lowScored) counts[r.kind] = (counts[r.kind] || 0) + 1;
  return counts;
}

function keywordCounts(data) {
  const records = evals.list(data, { k: 200 });
  const feedbacks = (data.ai && data.ai.evals && Array.isArray(data.ai.evals.feedback))
    ? data.ai.evals.feedback
    : [];
  const words = new Map();
  for (const item of [...records, ...feedbacks]) {
    const text = ((item.prompt || "") + " " + (item.response || "") + " " + (item.text || "")).toLowerCase();
    const tokens = text.split(/[^a-z0-9]+/).filter(word => word.length >= 4);
    for (const token of tokens) words.set(token, (words.get(token) || 0) + 1);
  }
  return words;
}

function buildProposal(data, kind, summary, sectionBefore, sectionAfter, reason) {
  const store = ensureProposals(data);
  const prop = {
    id: createId(),
    kind,
    summary,
    reason,
    section: sectionBefore && sectionAfter ? {
      key: Object.keys(sectionAfter)[0] || "unknown",
      before: sectionBefore,
      after: sectionAfter
    } : null,
    applied: false,
    createdAt: new Date().toISOString(),
    appliedAt: null
  };
  store.push(prop);
  return prop;
}

function generateProposals(data, opts = {}) {
  const lowCounts = rankCategoryCounts(data);
  const created = [];
  const words = keywordCounts(data);
  const topWords = [...words.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const routingData = (data.ai && data.ai.routing) || { routing: ["ollama", "groq", "openai", "openrouter", "together", "anthropic", "gemini", "custom", "local"] };
  const currentRouting = Array.isArray(routingData.routing) ? routingData.routing : ["ollama"];

  for (const [kind, count] of Object.entries(lowCounts)) {
    if (count < 2) continue;
    created.push(buildProposal(
      data,
      `degraded_${kind}`,
      `Route "${kind}" tasks away from current provider (${count} low-score runs).`,
      { routing: currentRouting },
      null,
      "Many low-score runs detected in this category"
    ));
  }

  const knowledge = data.ai && data.ai.knowledge && Array.isArray(data.ai.knowledge.documents)
    ? data.ai.knowledge.documents
    : [];
  if (knowledge.length === 0 && topWords.some(([word]) => word.includes("rag"))) {
    created.push(buildProposal(
      data,
      "knowledge_gap",
      "Knowledge base is empty but users ask for RAG topics. Ingest documents.",
      null,
      null,
      "RAG queries detected with empty knowledge base"
    ));
  }

  return created;
}

function listProposals(data) {
  return ensureProposals(data);
}

function applyProposal(data, id, { saveSnapshot, rollbackTo } = {}) {
  const store = ensureProposals(data);
  const prop = store.find(item => item.id === id);
  if (!prop) return null;
  if (prop.applied) return prop;

  if (prop.section && rollbackTo) {
    const routingKey = "routing";
    if (prop.section.key === routingKey && data.ai && data.ai.routing) {
      data.ai.routing.routing = Array.isArray(prop.section.before.routing)
        ? prop.section.before.routing
        : data.ai.routing.routing;
    }
    versions.revertVersion(data, rollbackTo);
  }

  prop.applied = true;
  prop.appliedAt = new Date().toISOString();
  versions.snapshot(data, {
    label: `Applied proposal: ${prop.kind}`,
    sections: { proposal: prop }
  });
  return prop;
}

function removeProposal(data, id) {
  const store = ensureProposals(data);
  const index = store.findIndex(item => item.id === id);
  if (index < 0) return false;
  store.splice(index, 1);
  return true;
}

module.exports = {
  buildProposal,
  generateProposals,
  listProposals,
  applyProposal,
  removeProposal
};