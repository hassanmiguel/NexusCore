"use strict";

const TASKS = Object.freeze(["chat", "coding", "research", "private", "reasoning"]);

const TASK_PATTERNS = {
  research: /(\b(news|recent|latest|current|today|yesterday|breaking|update|now|202\d|20\d\d)\b|\bresearch\b|\bsearch the (web|internet)\b|\bwhats? new\b|\bweather\b|\bstock\b|\bprice of\b|\bscore|\bresults of\b)/i,
  coding: /(\bcode\b|\bdebug\b|\bbug\b|\bfunction\b|\bapi\b|\bgolang\b|\btypescript\b|\brefactor\b|\breview my (code|project|pr)\b|\bimplement\b|\bscript\b|\bregex\b|\bsql\b|\bcompil\b|\bbuild\b)/i,
  private: /(\bprivate\b|\bconfidential\b|\bsecret\b|\bdon'?t (share|upload|send)\b|\bkeep local\b|\blocal only\b|\bmy (documents|files|notes)\b)/i,
  reasoning: /(\breason(?:ing)?\b|\bdepth\b|\bcomplex\b|\bconvoluted\b|\bprove\b|\bderive\b|\bmathematical proof\b|\bstra(?:tegy|tegic)\b|\boptimize\b|\btrade[- ]?off\b)/i
};

function classifyTask(text) {
  const source = String(text || "").trim();
  if (!source) return "chat";
  for (const task of ["research", "coding", "private", "reasoning"]) {
    if (TASK_PATTERNS[task].test(source)) return task;
  }
  return "chat";
}

function canUse(provider, policy) {
  if (!provider) return false;
  if (provider.enabled !== true) return false;
  if (policy.privacy || policy.offline) {
    if (provider.kind !== "local") return false;
  }
  if (provider.requiresKey && provider.apiKey.length === 0) return false;
  if (!provider.baseUrl) return false;
  if (policy.exclude && policy.exclude.has(provider.id)) return false;
  return true;
}

/**
 * Builds the ordered provider candidate list for a task.
 * @param {object} data persisted ai.routing (registry.getRouting output)
 * @param {Array} providerResolvers array of { id, kind, requiresKey, apiKey, enabled, baseUrl }
 * @param {string} text the user query
 * @param {{ offline?: boolean, privacy?: boolean, exclude?: Set<string> }} policy
 * @returns {Array<string>} provider ids in priority order
 */
function rank(data, providerResolvers, text, policy = {}) {
  const route = (data && data.routing) ? data.routing : (data || {});
  const task = classifyTask(text);
  const taskList = (route.override && route.override[task]) || (route.tasks && route.tasks[task]) || route.default || [];
  const seen = new Set();
  const ordered = [];
  for (const id of taskList) {
    if (seen.has(id)) continue;
    seen.add(id);
    const provider = providerResolvers.find(item => item.id === id);
    if (canUse(provider, policy)) ordered.push(id);
  }
  return { task, ordered, providers: providerResolvers.map(p => p.id) };
}

function isTriviallyAnswerable(text) {
  const source = String(text || "").trim();
  if (!source) return false;
  return /^(hi|hello|hey|yo|sup|good (morning|afternoon|evening)|thanks|thank you)$/i.test(source);
}

module.exports = { TASKS, classifyTask, rank, canUse, isTriviallyAnswerable };