"use strict";

const skillRegistry = require("./skill-registry");
const router = require("./router");
const { classifyIntent, classifyIntentWithModel } = require("./intent");

async function processRequest(data, crypto, text, opts = {}) {
  const runtime = opts.runtime || require("../ai/runtime");
  skillRegistry.bootstrapCapabilities(data);
  skillRegistry.bootstrapFromMarkdown(data);

  const intentResult = opts.useModelClassification && typeof opts.chat === "function"
    ? await classifyIntentWithModel(text, opts.chat)
    : (opts.intentResult || classifyIntent(text));

  const routing = router.route(data, text, { intentResult });

  // Retrieve relevant memory and knowledge before answering.
  let contextParts = [];
  try {
    const memory = require("../memory/store");
    const mem = memory.search(data, String(text || ""), { k: 3 });
    if (mem && Array.isArray(mem.results) && mem.results.length) {
      contextParts.push("Relevant memory:\n" + mem.results.map(item => `- ${item.text}`).join("\n"));
    }
  } catch (err) {
    // Memory retrieval is optional.
  }
  try {
    const knowledge = require("../knowledge/index");
    const kb = knowledge.search(data, String(text || ""), { k: 3 });
    if (kb && Array.isArray(kb.results) && kb.results.length) {
      contextParts.push("Relevant knowledge:\n" + kb.results.map(item => `- ${item.text}`).join("\n"));
    }
  } catch (err) {
    // Knowledge retrieval is optional.
  }

  const userMessages = Array.isArray(opts.messages)
    ? opts.messages.filter(item => item && item.role !== "system")
    : [{ role: "user", content: String(text || "") }];

  const systemContent = [
    "You are NexusCore, an advanced multi-capability AI assistant.",
    "Use the retrieved context when relevant. Be accurate and concise.",
    contextParts.join("\n\n")
  ].filter(Boolean).join("\n\n");

  const messages = [{ role: "system", content: systemContent }, ...userMessages];

  let result;
  try {
    result = await runtime.chatWithFallback(data, crypto, messages, {
      userText: String(text || ""),
      ...opts.runtimeOpts
    });
  } catch (err) {
    result = { content: `NexusCore could not complete the request: ${err.message || String(err)}`, providerId: null, providerLabel: null };
  }

  return {
    ok: true,
    intent: intentResult.intent,
    confidence: intentResult.confidence,
    skills: routing.skills,
    context: contextParts.join("\n\n"),
    reply: result.content,
    providerId: result.providerId || null,
    providerLabel: result.providerLabel || null
  };
}

function bootstrap(data) {
  skillRegistry.bootstrapCapabilities(data);
  skillRegistry.bootstrapFromMarkdown(data);
  skillRegistry.bootstrapFromIndex(data);
  return skillRegistry.stats(data);
}

module.exports = { processRequest, bootstrap };
