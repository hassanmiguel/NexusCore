"use strict";

// NexusCore skill registry.
// Stores metadata for every integrated capability so the intelligence engine
// can discover, enable/disable, and route to skills without rebuilding.

function ensureStore(data) {
  data.ai = data.ai && typeof data.ai === "object" ? data.ai : {};
  data.ai.nexus = data.ai.nexus && typeof data.ai.nexus === "object" ? data.ai.nexus : {};
  data.ai.nexus.skills =
    data.ai.nexus.skills && typeof data.ai.nexus.skills === "object" ? data.ai.nexus.skills : {};
  return data.ai.nexus.skills;
}

function normalizeSkill(input) {
  const safe = input && typeof input === "object" ? input : {};
  const now = new Date().toISOString();
  return {
    id: String(safe.id || safe.name || "").trim(),
    name: String(safe.name || safe.id || "").trim(),
    description: String(safe.description || "").trim(),
    category: String(safe.category || "").trim(),
    risk: String(safe.risk || "safe").trim(),
    source: String(safe.source || "local").trim(),
    repository: String(safe.repository || safe.sourceRepo || "").trim(),
    implementation: String(safe.implementation || safe.path || "").trim(),
    dependencies: Array.isArray(safe.dependencies) ? safe.dependencies.slice() : [],
    activation: Array.isArray(safe.activation) ? safe.activation.slice() : [],
    inputSchema: safe.inputSchema && typeof safe.inputSchema === "object" ? safe.inputSchema : {},
    outputSchema: safe.outputSchema && typeof safe.outputSchema === "object" ? safe.outputSchema : {},
    enabled: safe.enabled !== false,
    status: String(safe.status || "available").trim(),
    createdAt: safe.createdAt || now,
    updatedAt: now
  };
}

function registerSkill(data, input) {
  const store = ensureStore(data);
  const skill = normalizeSkill(input);
  if (!skill.id) throw new Error("Skill id is required");
  store[skill.id] = { ...store[skill.id], ...skill, updatedAt: new Date().toISOString() };
  return store[skill.id];
}

function getSkill(data, id) {
  const store = ensureStore(data);
  return store[String(id || "").trim()] || null;
}

function listSkills(data, opts = {}) {
  const store = ensureStore(data);
  let items = Object.values(store);
  if (opts.category) items = items.filter(item => item.category === opts.category);
  if (opts.enabledOnly) items = items.filter(item => item.enabled);
  if (opts.activation) items = items.filter(item => Array.isArray(item.activation) && item.activation.includes(opts.activation));
  return items.slice().sort((a, b) => a.id.localeCompare(b.id));
}

function enableSkill(data, id, enabled = true) {
  const store = ensureStore(data);
  const skill = store[String(id || "").trim()];
  if (!skill) return null;
  skill.enabled = Boolean(enabled);
  skill.updatedAt = new Date().toISOString();
  return skill;
}

function removeSkill(data, id) {
  const store = ensureStore(data);
  const key = String(id || "").trim();
  if (!store[key]) return false;
  delete store[key];
  return true;
}

function resolveBase() {
  const fs = require("fs");
  const path = require("path");
  const candidates = [process.cwd()];
  try {
    const { app } = require("electron");
    if (app && app.getAppPath) candidates.push(app.getAppPath());
  } catch (err) {
    // Ignore Electron lookup failures in tests.
  }
  for (const base of candidates) {
    try {
      if (fs.existsSync(path.join(base, "skills_index.json"))) return base;
    } catch (err) {
      // Ignore unreadable paths.
    }
  }
  return process.cwd();
}

function bootstrapFromMarkdown(data) {
  try {
    const skillsApi = require("../skills");
    const entries = skillsApi.listSkills();
    let count = 0;
    for (const entry of entries) {
      registerSkill(data, {
        id: `skill:${entry.id}`,
        name: entry.name || entry.id,
        description: entry.description || "",
        source: entry.source || "local",
        repository: entry.sourceRepo || "",
        implementation: entry.path || `skills/${entry.id}`,
        activation: [entry.category || "general"],
        status: "available",
        enabled: true
      });
      count += 1;
    }
    return count;
  } catch (err) {
    return 0;
  }
}

function bootstrapFromIndex(data) {
  const fs = require("fs");
  const path = require("path");
  const base = resolveBase();
  const file = path.join(base, "skills_index.json");
  if (!fs.existsSync(file)) return 0;
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    return 0;
  }
  if (!Array.isArray(raw)) return 0;
  let count = 0;
  for (const entry of raw) {
    if (!entry || !entry.id) continue;
    registerSkill(data, {
      id: `skill:${entry.id}`,
      name: entry.name || entry.id,
      description: entry.description || "",
      source: entry.source || "learned",
      repository: entry.source_repo || entry.repository || "",
      implementation: entry.path || `skills/${entry.id}`,
      category: entry.category || "",
      risk: entry.risk || "safe",
      activation: [entry.category || "general"],
      status: "available",
      enabled: true
    });
    count += 1;
  }
  return count;
}

function bootstrapCapabilities(data) {
  const capabilities = [
    { id: "capability:conversation", name: "Conversation", description: "Natural language conversation and context handling.", source: "core", implementation: "core/ai/runtime.js", activation: ["conversation", "greeting"], dependencies: ["runtime"] },
    { id: "capability:reasoning", name: "Reasoning", description: "Problem solving and explanation.", source: "core", implementation: "core/ai/runtime.js", activation: ["knowledge", "math", "research"], dependencies: ["runtime"] },
    { id: "capability:coding", name: "Coding", description: "Code generation, debugging, refactoring.", source: "core", implementation: "core/agents", activation: ["coding", "debug"], dependencies: ["agents", "tools"] },
    { id: "capability:website", name: "Website Development", description: "Frontend/backend website creation.", source: "core", implementation: "core/agents", activation: ["website"], dependencies: ["coding"] },
    { id: "capability:image_generation", name: "Image Generation", description: "Text-to-image generation via configured providers.", source: "core", implementation: "core/ai/gemini.js", activation: ["image_generation"], dependencies: ["gemini"] },
    { id: "capability:vision", name: "Image Understanding", description: "Analyze and describe images.", source: "core", implementation: "core/ai/gemini.js", activation: ["image_understanding"], dependencies: ["gemini"] },
    { id: "capability:document", name: "Document Processing", description: "Ingest and analyze documents.", source: "core", implementation: "core/knowledge", activation: ["document"], dependencies: ["knowledge"] },
    { id: "capability:research", name: "Research", description: "Web research and retrieval.", source: "core", implementation: "core/research", activation: ["research"], dependencies: ["research"] },
    { id: "capability:memory", name: "Memory", description: "Long/short-term memory.", source: "core", implementation: "core/memory", activation: ["conversation", "knowledge"], dependencies: ["memory"] },
    { id: "capability:math", name: "Mathematical Reasoning", description: "Solve mathematical problems.", source: "core", implementation: "core/ai/runtime.js", activation: ["math"], dependencies: ["runtime"] },
    { id: "capability:tools", name: "Tool Execution", description: "Unified tool execution.", source: "core", implementation: "core/tools", activation: ["coding", "research", "document"], dependencies: ["tools"] },
    { id: "capability:agents", name: "Autonomous Agents", description: "Multi-step autonomous task execution.", source: "core", implementation: "core/agents", activation: ["agent_task"], dependencies: ["agents"] }
  ];
  for (const cap of capabilities) {
    registerSkill(data, { ...cap, status: "available", enabled: true });
  }
  return capabilities.length;
}

function stats(data) {
  const store = ensureStore(data);
  const items = Object.values(store);
  return {
    total: items.length,
    enabled: items.filter(item => item.enabled).length,
    byStatus: items.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {})
  };
}

function testSkill(data, id, runner) {
  const skill = getSkill(data, id);
  if (!skill) return { ok: false, error: "Skill not found" };
  if (typeof runner !== "function") return { ok: true, skill: skill.id, note: "No runner provided; metadata valid" };
  try {
    const result = runner(skill);
    return { ok: true, skill: skill.id, result };
  } catch (err) {
    return { ok: false, skill: skill.id, error: err.message || String(err) };
  }
}

module.exports = {
  ensureStore,
  registerSkill,
  getSkill,
  listSkills,
  enableSkill,
  removeSkill,
  bootstrapFromMarkdown,
  bootstrapFromIndex,
  bootstrapCapabilities,
  stats,
  testSkill
};
