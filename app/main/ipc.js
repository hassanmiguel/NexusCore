const { ipcMain, app } = require("electron");
const fs = require("fs");
const path = require("path");
const { decrypt, encrypt } = require("../../core/crypto");
const { load, save } = require("../../core/storage");
const { trim } = require("../../core/trim");
const { loadAgentConfig, sanitizeAgentConfig } = require("../../core/agent-config");
const { ACTIONS, canPerform } = require("../../core/agent-permissions");
const { createAuditEntry, appendAudit } = require("../../core/agent-audit");
const { listTools } = require("../../core/agent-tools");
const skillsApi = require("../../core/skills");
const memory = require("../../core/memory/store");
const knowledge = require("../../core/knowledge/index");
const tools = require("../../core/tools/index");
const agents = require("../../core/agents/runner");
const research = require("../../core/research/index");
const evalStore = require("../../core/learning/evals");
const improve = require("../../core/learning/improve");
const versions = require("../../core/learning/versions");
const runtime = require("../../core/ai/runtime");
const registry = require("../../core/ai/registry");
const hardware = require("../../core/ai/hardware");
const {
  listModelsByProvider,
  listLocalModels,
  downloadModel,
  removeModel,
  recommend
} = require("../../core/model-manager");

const activeStreams = new Map();

const IDENTITY_RESPONSE =
  "I was developed and I'm maintained by Lahiru Sanjika (Cyber Security Researcher). Official GitHub: https://github.com/lahirusanjika";
const IDENTITY_DETAILS =
  "You can view the developer's public tools and projects on that GitHub profile.";
const DATA_OWNERSHIP_RESPONSE =
  "I can't determine legal ownership of data. For ownership, licensing, or privacy questions, refer to the tool's terms or the developer's documentation.";
const REVERSE_ENGINEERING_RESPONSE =
  "I can't help with reverse engineering, decompiling, cracking, or bypassing protections for this tool.";

function getKeyFilePaths() {
  const candidates = new Set([path.join(process.cwd(), "api.txt")]);

  if (app && app.getAppPath) {
    try {
      candidates.add(path.join(app.getAppPath(), "api.txt"));
    } catch (err) {
      // Ignore app path lookup failures.
    }
  }

  if (app && app.isPackaged && app.getPath) {
    try {
      const exeDir = path.dirname(app.getPath("exe"));
      candidates.add(path.join(exeDir, "api.txt"));
    } catch (err) {
      // Ignore exe path lookup failures.
    }
  }

  return Array.from(candidates);
}

function removeKeyFiles() {
  for (const candidate of getKeyFilePaths()) {
    if (!fs.existsSync(candidate)) continue;
    try {
      fs.unlinkSync(candidate);
    } catch (err) {
      // Ignore key file cleanup failures.
    }
  }
}

function normalizeQuery(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getLastUserText(messages) {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const item = messages[i];
    if (item && item.role === "user" && typeof item.content === "string") {
      return item.content;
    }
  }
  return "";
}

function isIdentityQuery(text) {
  const normalized = normalizeQuery(text);
  if (!normalized) return false;

  if (/are you lahiru'?s ai\b/.test(normalized)) return true;
  if (/\blahiru\b/.test(normalized) && /\b(ai|assistant|tool|app)\b/.test(normalized)) {
    return true;
  }

  const shortMatches = [
    "who made you",
    "who created you",
    "who built you",
    "who developed you",
    "who is your owner",
    "who is your developer",
    "who is your creator",
    "who maintains you",
    "who is the developer",
    "who is the owner",
    "who made this",
    "who created this",
    "who built this"
  ];
  if (shortMatches.some(phrase => normalized === phrase || normalized.startsWith(`${phrase} `))) {
    return true;
  }

  const hasWho = /\bwho\b/.test(normalized);
  const maker = /\b(made|created|built|developed|developer|creator|owner|maintainer|maintains)\b/;
  const target = /\b(you|your|this|ai|assistant|tool|app)\b/;
  return hasWho && maker.test(normalized) && target.test(normalized);
}

function isLegalQuery(text) {
  const normalized = normalizeQuery(text);
  if (!normalized) return false;
  if (/\b(privacy|compliance|gdpr|legal|licensing|license)\b/.test(normalized)) {
    return true;
  }
  if (/\bwho owns (my|the|user) data\b/.test(normalized)) return true;
  if (/\bdata ownership\b/.test(normalized)) return true;
  return /\bowns (my|the|user) data\b/.test(normalized);
}

function wantsMoreDetails(text) {
  const normalized = normalizeQuery(text);
  return /\b(more details|more info|more information|tell me more|more about)\b/.test(
    normalized
  );
}

function isReverseEngineeringQuery(text) {
  const normalized = normalizeQuery(text);
  if (!normalized) return false;
  if (/\breverse engineer(?:ing)?\b/.test(normalized)) return true;
  if (/\bdecompile(?:r|d)?\b/.test(normalized)) return true;
  if (/\bdisassemble(?:r|d)?\b/.test(normalized)) return true;
  if (/\bunpack(?:er|ed)?\b/.test(normalized)) return true;
  if (/\bextract (source|code)\b/.test(normalized)) return true;
  if (/\b(crack|keygen|serial|pirate|bypass)\b/.test(normalized)) return true;
  if (/\bpatch (license|activation)\b/.test(normalized)) return true;
  if (/\bcircumvent\b/.test(normalized)) {
    return /\b(protection|license|activation|security)\b/.test(normalized);
  }
  return false;
}

function isGreeting(text) {
  const normalized = normalizeQuery(text);
  if (!normalized) return false;
  return /^(hi|hello|hey|howdy|greetings|good (morning|afternoon|evening)|what'?s up|sup)\b/.test(normalized) ||
    normalized === "hi" || normalized === "hello" || normalized === "hey";
}

function getUserName(data) {
  return (data && typeof data.userName === "string" && data.userName.trim()) ? data.userName.trim() : "";
}

function countLearnedSkills() {
  try {
    const fs = require("fs");
    const path = require("path");
    const file = path.join(process.cwd(), "skills_index.json");
    if (fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, "utf8"));
      if (Array.isArray(raw)) return raw.length;
    }
  } catch (err) {
    // Ignore.
  }
  return 0;
}

function buildGreetingResponse(data) {
  const name = getUserName(data);
  const skillCount = countLearnedSkills();
  const lines = [];
  if (name) {
    lines.push(`Hello ${name}! Good to hear from you.`);
  } else {
    lines.push("Hello! Good to hear from you. I don't know your name yet - what should I call you?");
  }
  lines.push("");
  lines.push("Here's what I can do:");
  lines.push("- Natural conversation and follow-up context");
  lines.push("- Answer questions and explain topics");
  lines.push("- Reason through problems and math");
  lines.push("- Write, debug, refactor, and test code (Python, JavaScript, TypeScript, and more)");
  lines.push("- Build websites and applications");
  lines.push("- Generate images from text prompts");
  lines.push("- Analyze and describe images");
  lines.push("- Read and analyze documents");
  lines.push("- Research topics on the web");
  lines.push("- Use tools and run multi-step tasks");
  lines.push("- Remember relevant information across conversations");
  lines.push("");
  lines.push(`I also have ${skillCount} specialized skills available.`);
  lines.push("");
  lines.push("What I can't do: access your private data or perform destructive/external actions without authorization, and I won't claim something works without testing it.");
  return lines.join("\n");
}

function getStaticResponse(messages) {
  const lastUserText = getLastUserText(messages);
  if (!lastUserText) return null;

  // Capture the user's name when provided.
  const nameMatch = lastUserText.match(/\b(?:my name is|i am|i'm|call me|this is|you can call me)\s+([A-Za-z][A-Za-z0-9 _'-]{0,40})/i);
  if (nameMatch) {
    const name = nameMatch[1].trim().replace(/[.!?]+$/, "").trim();
    if (name && name.length <= 40) {
      const data = load();
      data.userName = name;
      save(data);
      return `Nice to meet you, ${name}! I'll remember your name. How can I help you today?`;
    }
  }

  const normalized = normalizeQuery(lastUserText);
  if (/\b(what is my name|who am i|do you know my name|what'?s my name)\b/.test(normalized)) {
    const data = load();
    const name = getUserName(data);
    if (name) return `Your name is ${name}.`;
    return "I don't know your name yet. What should I call you?";
  }

  if (isGreeting(lastUserText)) {
    return buildGreetingResponse(load());
  }

  if (isReverseEngineeringQuery(lastUserText)) {
    return REVERSE_ENGINEERING_RESPONSE;
  }

  if (isLegalQuery(lastUserText)) {
    return DATA_OWNERSHIP_RESPONSE;
  }

  if (isIdentityQuery(lastUserText)) {
    if (wantsMoreDetails(lastUserText)) {
      return `${IDENTITY_RESPONSE}\n${IDENTITY_DETAILS}`;
    }
    return IDENTITY_RESPONSE;
  }

  return null;
}

function resolveApiKey() {
  const environmentKey = [process.env.GROQ_API_KEY, process.env.OPENAI_API_KEY]
    .find(value => typeof value === "string" && value.trim());
  const trimmedEnvironmentKey = environmentKey ? environmentKey.trim() : "";
  if (trimmedEnvironmentKey) return trimmedEnvironmentKey;

  const data = load();
  let storedKey = null;

  if (data.apiKey) {
    try {
      storedKey = decrypt(data.apiKey);
    } catch (err) {
      storedKey = null;
    }
  }

  removeKeyFiles();
  return storedKey;
}

function resolveProviderConfig(overrides = {}) {
  const data = load();
  const saved = data.provider && typeof data.provider === "object" ? data.provider : {};
  let storedKey = "";
  if (saved.apiKey) {
    try {
      storedKey = decrypt(saved.apiKey);
    } catch (err) {
      storedKey = "";
    }
  }

  return {
    baseUrl: overrides.baseUrl || saved.baseUrl || process.env.OPENAI_BASE_URL || process.env.GROQ_BASE_URL,
    model: overrides.model || saved.model || process.env.OPENAI_MODEL || process.env.GROQ_MODEL,
    temperature: Number.isFinite(overrides.temperature) ? overrides.temperature : saved.temperature,
    maxTokens: Number.isFinite(overrides.maxTokens) ? overrides.maxTokens : saved.maxTokens,
    apiKey: overrides.apiKey || resolveApiKey() || storedKey
  };
}

function stripUrl(value) {
  return String(value || "").replace(/\/+$/, "").toLowerCase();
}

function matchProviderByBaseUrl(baseUrl) {
  const entered = stripUrl(baseUrl);
  if (!entered) return "custom";
  const ollamaRoot = stripUrl(registry.DEFAULT_PROVIDERS.ollama.baseUrl);
  const ollamaV1 = `${ollamaRoot}/v1`;
  if (entered === ollamaRoot || entered === ollamaV1) return "ollama";
  for (const id of Object.keys(registry.DEFAULT_PROVIDERS)) {
    if (id === "ollama" || id === "custom") continue;
    const preset = stripUrl(registry.DEFAULT_PROVIDERS[id].baseUrl);
    if (preset && (entered === preset || entered.startsWith(`${preset}/`))) return id;
  }
  const local = stripUrl(registry.DEFAULT_PROVIDERS.local.baseUrl);
  if (entered === local || entered.startsWith(`${local}/`)) return "local";
  return "custom";
}

function activeProviderSnapshot(data) {
  const resolvers = runtime.providerResolvers(data, { decrypt });
  const routingData = registry.getRouting(data);
  const order = routingData.default || [];
  for (const id of order) {
    const provider = resolvers.find(item => item.id === id);
    if (provider && provider.enabled && (!provider.requiresKey || provider.apiKey)) {
      return {
        baseUrl: provider.baseUrl,
        model: provider.model,
        hasKey: Boolean(provider.apiKey),
        providerId: id,
        providerLabel: provider.label
      };
    }
  }
  const legacy = resolveProviderConfig();
  return {
    baseUrl: legacy.baseUrl,
    model: legacy.model,
    hasKey: Boolean(legacy.apiKey),
    providerId: "",
    providerLabel: legacy.baseUrl
  };
}

function getLastUserTextFor(messages) {
  return getLastUserText(messages);
}

ipcMain.handle("chat:send", async (_, messages) => {
  const staticReply = getStaticResponse(messages);
  if (staticReply) return { content: staticReply };
  const data = load();
  const result = await runtime.chatWithFallback(data, { decrypt }, trim(messages), {
    userText: getLastUserTextFor(messages),
    stream: false
  });
  return {
    content: result.content,
    usage: result.usage,
    providerId: result.providerId,
    providerLabel: result.providerLabel,
    latencyMs: result.latencyMs
  };
});

ipcMain.handle("chat:stream", async (event, messages) => {
  const staticReply = getStaticResponse(messages);
  if (staticReply) {
    event.sender.send("chat:chunk", staticReply);
    return { content: staticReply };
  }
  const data = load();
  const controller = new AbortController();
  activeStreams.set(event.sender.id, controller);
  try {
    const result = await runtime.chatWithFallback(data, { decrypt }, trim(messages), {
      userText: getLastUserTextFor(messages),
      stream: true,
      signal: controller.signal,
      onChunk: chunk => event.sender.send("chat:chunk", chunk),
      onMeta: meta => event.sender.send("chat:meta", meta)
    });
    return {
      content: result.content,
      usage: result.usage,
      providerId: result.providerId,
      providerLabel: result.providerLabel,
      latencyMs: result.latencyMs
    };
  } finally {
    activeStreams.delete(event.sender.id);
  }
});

ipcMain.on("chat:stop", event => {
  const controller = activeStreams.get(event.sender.id);
  if (controller) controller.abort();
});

ipcMain.handle("ollama:list", async () => listModelsByProvider(load(), { decrypt }, "ollama"));

ipcMain.handle("ollama:pull", async (_, model) => {
  const { ollama } = require("../../core/ai/ollama");
  await ollama.pull({}, model);
  return true;
});

ipcMain.handle("profile:load", () => {
  const data = load();
  return Array.isArray(data.profiles) ? data.profiles : [];
});

ipcMain.handle("profile:save", (_, profile) => {
  const data = load();
  const profiles = Array.isArray(data.profiles) ? data.profiles : [];
  const next = profiles.filter(item => item && item.name !== profile?.name);
  if (profile?.name && profile?.config) next.push(profile);
  data.profiles = next;
  save(data);
  return true;
});

ipcMain.handle("profile:delete", (_, name) => {
  const data = load();
  data.profiles = (Array.isArray(data.profiles) ? data.profiles : [])
    .filter(profile => profile && profile.name !== name);
  save(data);
  return true;
});

ipcMain.handle("provider:load", () => {
  const config = activeProviderSnapshot(load());
  return { baseUrl: config.baseUrl, model: config.model, hasKey: config.hasKey };
});

ipcMain.handle("provider:save", (_, config) => {
  const data = load();
  const current = data.provider && typeof data.provider === "object" ? data.provider : {};
  const next = {
    baseUrl: typeof config?.baseUrl === "string" ? config.baseUrl.trim() : current.baseUrl,
    model: typeof config?.model === "string" ? config.model.trim() : current.model,
    temperature: Number.isFinite(config?.temperature) ? config.temperature : current.temperature,
    maxTokens: Number.isFinite(config?.maxTokens) ? config.maxTokens : current.maxTokens
  };
  if (typeof config?.apiKey === "string" && config.apiKey.trim()) {
    next.apiKey = encrypt(config.apiKey.trim());
  } else if (current.apiKey) {
    next.apiKey = current.apiKey;
  }
  data.provider = next;
  const matched = matchProviderByBaseUrl(next.baseUrl);
  if (matched) {
    try {
      registry.saveProvider(data, {
        id: matched,
        baseUrl: next.baseUrl,
        model: next.model,
        apiKey: config?.apiKey ? String(config.apiKey).trim() : undefined
      }, { encrypt, decrypt });
    } catch (err) {
      // Registry mirror failure must not break provider saving.
    }
  }
  save(data);
  return true;
});

ipcMain.handle("provider:test", async (_, config) => {
  const candidate = config && typeof config === "object" ? config : {};
  const data = load();
  const matched = matchProviderByBaseUrl(candidate.baseUrl || resolveProviderConfig(candidate).baseUrl);
  const result = await runtime.testProvider(data, { decrypt }, matched, candidate);
  return result;
});

ipcMain.handle("provider:revoke", () => {
  const data = load();
  if (data.provider) {
    delete data.provider;
    save(data);
  }
  return true;
});

ipcMain.handle("providers:list", () => {
  return { providers: registry.listProviders(load(), { decrypt }), routing: registry.getRouting(load()) };
});

ipcMain.handle("providers:save", (_, input) => {
  const data = load();
  const saved = registry.saveProvider(data, input, { encrypt });
  appendAudit(data, createAuditEntry("providers", "save", { id: input && input.id }, "SUCCESS"), 500);
  save(data);
  return saved;
});

ipcMain.handle("providers:test", async (_, id) => {
  const data = load();
  return runtime.testProvider(data, { decrypt }, String(id || "").trim());
});

ipcMain.handle("providers:revoke-key", (_, id) => {
  const data = load();
  const store = registry.providerStore(data);
  const current = store[id] && typeof store[id] === "object" ? store[id] : {};
  data.ai = data.ai && typeof data.ai === "object" ? data.ai : {};
  data.ai.providers = { ...store, [id]: { ...current } };
  delete data.ai.providers[id].apiKey;
  save(data);
  return true;
});

ipcMain.handle("providers:models", async (_, id) => {
  const data = load();
  return listModelsByProvider(data, { decrypt }, String(id || "").trim());
});

ipcMain.handle("models:list", async () => {
  const data = load();
  const models = await listLocalModels(data, { decrypt });
  const rec = await recommend(data, { decrypt });
  return { models, recommend: rec };
});

ipcMain.handle("models:download", async (_, id, model) => {
  const data = load();
  await downloadModel(data, { decrypt }, String(id || ""), String(model || ""));
  return true;
});

ipcMain.handle("models:remove", async (_, id, model) => {
  const data = load();
  await removeModel(data, { decrypt }, String(id || ""), String(model || ""));
  return true;
});

ipcMain.handle("models:recommend", async () => recommend(load(), { decrypt }));

ipcMain.handle("system:hardware", async () => hardware.detect());

ipcMain.handle("status:overview", async () => {
  const data = load();
  const online = await runtime.probeOnline(data);
  return {
    ...runtime.currentStatus(data, { decrypt }),
    online,
    hardware: await hardware.detect()
  };
});

ipcMain.handle("status:online", async () => runtime.probeOnline(load(), true));

ipcMain.handle("routing:load", () => {
  const data = load();
  return registry.getRouting(data);
});

ipcMain.handle("routing:save", (_, input) => {
  const data = load();
  const saved = registry.saveRouting(data, input || {});
  save(data);
  return saved;
});

ipcMain.handle("modes:load", () => {
  const data = load();
  return runtime.loadModes(data);
});

ipcMain.handle("modes:save", (_, input) => {
  const data = load();
  const modes = runtime.saveModes(data, input || {});
  save(data);
  return { modes };
});

ipcMain.handle("key:save", (_, key) => {
  const data = load();
  data.apiKey = encrypt(key);
  save(data);
  removeKeyFiles();
  return true;
});

ipcMain.handle("key:revoke", () => {
  const data = load();
  if (data.apiKey) {
    delete data.apiKey;
    save(data);
  }
  removeKeyFiles();
  return true;
});

ipcMain.handle("key:test", async (_, key) => {
  const candidate = typeof key === "string" ? key.trim() : "";
  const apiKey = candidate || resolveApiKey();
  if (!apiKey) {
    return { ok: false, status: 0, message: "API key not set" };
  }
  const data = load();
  return runtime.testProvider(data, { decrypt }, "groq", { apiKey });
});

ipcMain.handle("key:status", () => {
  return Boolean(resolveApiKey());
});

ipcMain.handle("agent:load", () => {
  const data = load();
  const config = loadAgentConfig(data);
  return {
    ...config,
    auditLog: Array.isArray(data.auditLog) ? data.auditLog.slice(-config.maxAuditEntries) : [],
    tools: listTools()
  };
});

ipcMain.handle("agent:save", (_, input) => {
  const data = load();
  data.agentConfig = sanitizeAgentConfig(input);
  appendAudit(
    data,
    createAuditEntry("agent", "configuration.save", { mode: data.agentConfig.mode }, "SUCCESS"),
    data.agentConfig.maxAuditEntries
  );
  save(data);
  return data.agentConfig;
});

ipcMain.handle("agent:permission-check", (_, actionName, target) => {
  const data = load();
  const config = loadAgentConfig(data);
  const action = String(actionName || "").toUpperCase();
  const result = canPerform(config, action, target);
  appendAudit(
    data,
    createAuditEntry("permissions", action, { target }, result.allowed ? "ALLOWED" : "DENIED"),
    config.maxAuditEntries
  );
  save(data);
  return result;
});

ipcMain.handle("agent:audit", () => {
  const data = load();
  const config = loadAgentConfig(data);
  return Array.isArray(data.auditLog) ? data.auditLog.slice(-config.maxAuditEntries).reverse() : [];
});

ipcMain.handle("agent:audit:clear", () => {
  const data = load();
  data.auditLog = [];
  save(data);
  return true;
});

ipcMain.handle("agent:tools", () => listTools());

ipcMain.handle("chat:load", () => {
  const data = load();
  return data.chats || null;
});

ipcMain.handle("chat:save", (_, chats) => {
  const data = load();
  data.chats = chats;
  save(data);
  return true;
});

ipcMain.handle("ui:load", () => {
  const data = load();
  return data.ui && typeof data.ui === "object" ? data.ui : {};
});

ipcMain.handle("ui:save", (_, ui) => {
  const data = load();
  data.ui = ui && typeof ui === "object" ? ui : {};
  save(data);
  return true;
});

ipcMain.handle("skills:list", () => skillsApi.listSkills());
ipcMain.handle("skills:get", (_, id) => skillsApi.getSkill(id));
ipcMain.handle("skills:search", (_, query, category, risk) =>
  skillsApi.searchSkills(query, category, risk)
);
ipcMain.handle("skills:categories", () => skillsApi.getCategories());
ipcMain.handle("skills:stats", () => skillsApi.getStats());

ipcMain.handle("memory:save", (_, input) => {
  const data = load();
  const item = memory.addMemory(data, input || {});
  save(data);
  return item;
});

ipcMain.handle("memory:list", (_, opts) => memory.list(load(), opts || {}));

ipcMain.handle("memory:search", (_, query, opts) => memory.search(load(), String(query || ""), opts || {}));

ipcMain.handle("memory:forget", (_, id) => {
  const data = load();
  const item = memory.archive(data, String(id || ""));
  save(data);
  return Boolean(item);
});

ipcMain.handle("memory:delete", (_, id) => {
  const data = load();
  const result = memory.removeHard(data, String(id || ""));
  save(data);
  return result;
});

ipcMain.handle("memory:update", (_, id, patch) => {
  const data = load();
  const item = memory.update(data, String(id || ""), patch || {});
  save(data);
  return item;
});

ipcMain.handle("memory:clear", (_, layer) => {
  const data = load();
  const result = memory.clear(data, String(layer || ""));
  save(data);
  return result;
});

ipcMain.handle("memory:stats", () => memory.stats(load()));

ipcMain.handle("memory:harvest", (_, input) => {
  const data = load();
  const result = memory.harvestConversation(data, input || {});
  save(data);
  return result;
});

ipcMain.handle("memory:approve", (_, id) => {
  const data = load();
  const item = memory.approve(data, String(id || ""));
  save(data);
  return item;
});

ipcMain.handle("knowledge:ingestFile", (_, filePath, opts) => {
  const data = load();
  const result = knowledge.ingestFile(data, String(filePath || ""), opts || {});
  save(data);
  return result;
});

ipcMain.handle("knowledge:ingestText", (_, text, opts) => {
  const data = load();
  const result = knowledge.ingestText(data, String(text || ""), opts || {});
  save(data);
  return result;
});

ipcMain.handle("knowledge:documents", () => {
  const data = load();
  return knowledge.listDocuments(data);
});

ipcMain.handle("knowledge:search", (_, query, opts) => {
  const data = load();
  return knowledge.search(data, String(query || ""), opts || {});
});

ipcMain.handle("knowledge:remove", (_, docId) => {
  const data = load();
  const result = knowledge.removeDocument(data, String(docId || ""));
  save(data);
  return result;
});

ipcMain.handle("knowledge:stats", () => {
  const data = load();
  return knowledge.stats(data);
});

ipcMain.handle("tools:list", () => tools.listTools());

ipcMain.handle("tools:execute", (_, input) => {
  const data = load();
  const result = tools.execute(String((input && input.name) || ""), (input && input.args) || {}, {
    confirmed: input && input.confirmed === true,
    data,
    saveData: () => save(data)
  });
  return result;
});

ipcMain.handle("heretic:decensor", async (_, input) => {
  const data = load();
  const result = await tools.execute("heretic_decensor", input || {}, {
    confirmed: input && input.confirmed === true,
    data,
    saveData: () => save(data)
  });
  return result;
});

ipcMain.handle("agents:run", async (_, input) => {
  const data = load();
  const result = await agents.run(data, input || {}, {
    decrypt,
    saveData: () => save(data)
  });
  return result;
});

ipcMain.handle("agents:history", () => {
  const data = load();
  const history = (data.ai && data.ai.agents) || {};
  return { runs: history.runs || [], lastRun: history.lastRun || null };
});

ipcMain.handle("research:run", async (_, input) => {
  const query = String((input && input.query) || "").trim();
  if (!query) return { ok: false, error: "Query is required" };
  const report = await research.research(query, input || {});
  if (input && input.saveToMemory === true) {
    const data = load();
    const layers = research.distillSources(report);
    const saved = [];
    for (const layer of layers) {
      const item = memory.addMemory(data, {
        layer: "knowledge",
        text: `[Research] ${layer.title}\n${layer.preview}`,
        source: "research",
        sourceRef: { url: layer.url },
        status: "pending"
      });
      saved.push(item.id);
    }
    save(data);
    report.memoryCandidateIds = saved;
  }
  return { ok: true, report };
});

ipcMain.handle("research:fetch", async (_, input) => {
  const { fetchText } = require("../../core/research/fetch");
  const { detectInjection } = require("../../core/research/guard");
  const url = String((input && input.url) || "").trim();
  if (!url) return { ok: false, error: "URL is required" };
  try {
    const fetched = await fetchText(url, { timeoutMs: (input && input.timeoutMs) });
    return {
      ok: true,
      fetched: {
        url: fetched.url,
        title: fetched.title,
        text: fetched.text,
        contentType: fetched.contentType,
        redirected: fetched.hops > 0
      },
      injection: detectInjection(fetched.text + " " + fetched.title)
    };
  } catch (err) {
    return {
      ok: false,
      error: (err && err.message) || String(err),
      code: (err && err.code) || null,
      status: (err && err.status) || null
    };
  }
});

ipcMain.handle("evals:save", (_, input) => {
  const data = load();
  const record = evalStore.saveRecord(data, input || {});
  save(data);
  return record;
});

ipcMain.handle("evals:list", (_, opts) => evalStore.list(load(), opts || {}));

ipcMain.handle("evals:stats", () => evalStore.stats(load()));

ipcMain.handle("evals:feedback", (_, input) => {
  const data = load();
  const item = evalStore.addFeedback(data, input || {});
  save(data);
  return item;
});

ipcMain.handle("proposals:generate", () => {
  const data = load();
  const created = improve.generateProposals(data);
  save(data);
  return created;
});

ipcMain.handle("proposals:list", () => improve.listProposals(load()));

ipcMain.handle("proposals:apply", (_, input) => {
  const data = load();
  const result = improve.applyProposal(data, String((input && input.id) || ""), input || {});
  save(data);
  return result;
});

ipcMain.handle("proposals:remove", (_, id) => {
  const data = load();
  const result = improve.removeProposal(data, String(id || ""));
  save(data);
  return result;
});

ipcMain.handle("versions:list", () => versions.listVersions(load()));

ipcMain.handle("versions:snapshot", (_, input) => {
  const data = load();
  const snap = versions.snapshot(data, input || {});
  save(data);
  return snap;
});

ipcMain.handle("versions:active", () => versions.getActiveVersion(load()));

ipcMain.handle("versions:revert", (_, id) => {
  const data = load();
  const snap = versions.revertVersion(data, String(id || ""));
  save(data);
  return snap;
});

const nexus = require("../../core/nexus");
ipcMain.handle("nexus:bootstrap", () => {
  const data = load();
  const stats = nexus.engine.bootstrap(data);
  save(data);
  return stats;
});
ipcMain.handle("nexus:intent", (_, text) => nexus.intent.classifyIntent(String(text || "")));
ipcMain.handle("nexus:route", (_, text) => {
  const data = load();
  nexus.engine.bootstrap(data);
  save(data);
  return nexus.router.route(data, String(text || ""));
});
ipcMain.handle("nexus:skills", (_, opts) => {
  const data = load();
  nexus.engine.bootstrap(data);
  save(data);
  return nexus.skillRegistry.listSkills(data, opts || {});
});
ipcMain.handle("nexus:process", async (_, input) => {
  const data = load();
  const text = String((input && input.text) || "").trim();
  const result = await nexus.engine.processRequest(data, { decrypt }, text, {
    messages: input && Array.isArray(input.messages) ? input.messages : undefined,
    runtimeOpts: input && input.runtimeOpts ? input.runtimeOpts : undefined
  });
  save(data);
  return result;
});
