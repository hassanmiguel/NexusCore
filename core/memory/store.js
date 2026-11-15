"use strict";

// Layered memory store persisted inside the app's JSON data file.
// Layers: long (user-approved facts), episodic (past tasks/experiences),
// semantic (facts/concepts), procedural (working strategies), knowledge (extracted).
// Short-term memory lives in-process (WorkingMemory) and is session-only.

const { termsFrom, cosine, keywordScore, vectorForItem, highlightTerms } = require("./embeddings");

const LAYERS = Object.freeze(["long", "episodic", "semantic", "procedural", "knowledge"]);
const STATUS = Object.freeze(["active", "pending", "archived"]);

function createId() {
  return `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function layersOf(data) {
  data.ai = data.ai && typeof data.ai === "object" ? data.ai : {};
  data.ai.memory = data.ai.memory && typeof data.ai.memory === "object" ? data.ai.memory : {};
  data.ai.memory.layers = data.ai.memory.layers && typeof data.ai.memory.layers === "object"
    ? data.ai.memory.layers
    : {};
  return data.ai.memory.layers;
}

function listIn(data, layer) {
  return Array.isArray(layersOf(data)[layer]) ? layersOf(data)[layer] : [];
}

function saveAll(data) {
  // storage.save is called by the IPC layer to avoid circular deps.
  return data;
}

function confidenceFor(source) {
  switch (String(source || "")) {
    case "user": return 1.0;
    case "reviewed": return 0.9;
    case "import": return 0.85;
    case "conversation": return 0.6;
    case "research": return 0.4;
    default: return 0.5;
  }
}

function addMemory(data, input = {}) {
  const layer = LAYERS.includes(input.layer) ? input.layer : "long";
  const text = String(input.text || "").trim();
  if (!text) throw new Error("Memory text is required");

  const item = {
    id: input.id || createId(),
    layer,
    text,
    tags: Array.isArray(input.tags) ? input.tags.map(String).slice(0, 12) : [],
    terms: termsFrom(text),
    source: String(input.source || "user"),
    sourceRef: input.sourceRef && typeof input.sourceRef === "object" ? input.sourceRef : null,
    confidence: Number.isFinite(input.confidence) ? input.confidence : confidenceFor(input.source),
    relevance: Number.isFinite(input.relevance) ? input.relevance : 1.0,
    status: input.status === "pending" ? "pending" : "active",
    version: 1,
    history: [],
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const list = listIn(data, layer);
  list.push(item);
  layersOf(data)[layer] = list;
  saveAll(data);
  return item;
}

function findById(data, id) {
  for (const layer of LAYERS) {
    const found = listIn(data, layer).find(item => item && item.id === id);
    if (found) return { layer, item: found };
  }
  return null;
}

function archive(data, id) {
  const found = findById(data, id);
  if (!found) return null;
  const { item } = found;
  const prev = item.status;
  item.status = "archived";
  item.updatedAt = new Date().toISOString();
  item.history.push({ at: item.updatedAt, reason: `archived (was ${prev})` });
  saveAll(data);
  return item;
}

function removeHard(data, id) {
  for (const layer of LAYERS) {
    const list = listIn(data, layer);
    const index = list.findIndex(item => item && item.id === id);
    if (index >= 0) {
      list.splice(index, 1);
      layersOf(data)[layer] = list;
      saveAll(data);
      return true;
    }
  }
  return false;
}

function update(data, id, patch = {}) {
  const found = findById(data, id);
  if (!found) return null;
  const { item } = found;
  const reason = patch.reason ? String(patch.reason) : "updated";
  item.history.push({
    at: new Date().toISOString(),
    reason,
    before: item.text.slice(0, 240)
  });
  if (typeof patch.text === "string" && patch.text.trim()) {
    item.text = patch.text.trim();
    item.terms = termsFrom(item.text);
  }
  if (Array.isArray(patch.tags)) item.tags = patch.tags.map(String).slice(0, 12);
  if (patch.confidence !== undefined && Number.isFinite(patch.confidence)) item.confidence = Math.max(0, Math.min(1, patch.confidence));
  if (patch.status === "active" || patch.status === "archived") item.status = patch.status;
  item.version += 1;
  item.updatedAt = new Date().toISOString();
  saveAll(data);
  return item;
}

function list(data, opts = {}) {
  const layer = opts.layer && LAYERS.includes(opts.layer) ? opts.layer : null;
  const status = opts.status && STATUS.includes(opts.status) ? opts.status : null;
  const sourceList = layer ? listIn(data, layer) : LAYERS.flatMap(item => listIn(data, item));
  const limit = Number.isFinite(opts.limit) ? opts.limit : 200;

  const filtered = sourceList
    .filter(item => item && (!status || item.status === status))
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, limit);

  return filtered.map(item => {
    const { terms, history, ...safe } = item;
    return { ...safe };
  });
}

function search(data, query, opts = {}) {
  const text = String(query || "").trim();
  const queryTerms = termsFrom(text);
  const layer = opts.layer && LAYERS.includes(opts.layer) ? opts.layer : null;
  const sourceList = layer ? listIn(data, layer) : LAYERS.flatMap(item => listIn(data, item));
  const k = Number.isFinite(opts.k) ? opts.k : 5;
  const minScore = Number.isFinite(opts.minScore) ? opts.minScore : 0.12;

  if (!text) {
    return { query: "", results: [] };
  }

  const queryVector = vectorForItem({ terms: queryTerms });

  const scored = [];
  for (const item of sourceList) {
    if (!item || item.status === "archived") continue;
    const vector = vectorForItem(item).vector;
    const vectorScore = cosine(queryVector, vector);
    const keywordScoreValue = keywordScore(queryTerms, item.terms || {});
    const score = vectorScore * 0.6 + keywordScoreValue * 0.4;
    if (score < minScore) continue;
    scored.push({
      id: item.id,
      layer: item.layer,
      text: item.text,
      tags: item.tags,
      source: item.source,
      sourceRef: item.sourceRef,
      confidence: item.confidence,
      relevance: item.relevance,
      status: item.status,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      score: Math.round(score * 1000) / 1000,
      matched: highlightTerms(queryTerms, item.terms || {})
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return { query: text, results: scored.slice(0, k) };
}

function stats(data) {
  const counts = {};
  let total = 0;
  for (const layer of LAYERS) {
    const list = listIn(data, layer);
    counts[layer] = list.length;
    total += list.length;
  }
  return { total, layers: counts };
}

function approve(data, id) {
  return update(data, String(id || ""), { status: "active", reason: "user approved" });
}

function clear(data, layer) {
  if (!LAYERS.includes(layer)) throw new Error(`Unknown memory layer: ${layer}`);
  const removed = listIn(data, layer).length;
  layersOf(data)[layer] = [];
  saveAll(data);
  return { layer, removed };
}

/**
 * Turns a finished conversation into episodic + semantic memory candidates
 * (status "pending"). Nothing is saved as permanent memory without approval.
 */
function harvestConversation(data, input = {}) {
  const messages = Array.isArray(input.messages) ? input.messages : [];
  const userMessages = messages.filter(item => item && item.role === "user")
    .map(item => String(item.content || "").trim())
    .filter(Boolean);
  if (userMessages.length === 0) return { created: [] };

  const created = [];
  const sourceRef = { conversationId: input.conversationId || null };
  const lastUser = userMessages[userMessages.length - 1];
  const reply = String(input.reply || "").trim();

  if (reply) {
    created.push(addMemory(data, {
      layer: "episodic",
      text: reply.slice(0, 800),
      source: "conversation",
      sourceRef,
      status: "pending",
      tags: ["episode", ...userMessages[0].split(/[^a-z0-9]+/).filter(word => word.length > 4).slice(0, 4)]
    }));
  }

  if (lastUser && reply) {
    created.push(addMemory(data, {
      layer: "semantic",
      text: `Q: ${lastUser.slice(0, 300)} A: ${reply.slice(0, 300)}`,
      source: "conversation",
      sourceRef,
      status: "pending",
      tags: ["qa"]
    }));
  }

  return { created: created.map(item => ({ id: item.id, layer: item.layer })) };
}

/** Session-scoped short-term memory (not persisted). */
class WorkingMemory {
  constructor() {
    this.threads = new Map();
  }
  remember(threadId, message) {
    const list = this.threads.get(String(threadId)) || [];
    list.push({ ...message, at: Date.now() });
    this.threads.set(String(threadId), list);
    return list.length;
  }
  recent(threadId, limit = 12) {
    const list = this.threads.get(String(threadId)) || [];
    return list.slice(-limit);
  }
  clear(threadId) {
    if (threadId === undefined) this.threads.clear();
    else this.threads.delete(String(threadId));
  }
}

function countActive(data) {
  let total = 0;
  for (const layer of LAYERS) total += listIn(data, layer).filter(item => item.status === "active").length;
  return total;
}

module.exports = {
  LAYERS,
  STATUS,
  addMemory,
  list,
  search,
  archive,
  removeHard,
  update,
  approve,
  clear,
  stats,
  harvestConversation,
  findById,
  WorkingMemory,
  countActive,
  confidenceFor
};