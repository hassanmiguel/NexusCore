"use strict";

// NexusCore intent classification.
// Combines lightweight, dependency-free heuristics with an optional LLM
// refinement step. The heuristic layer is intentionally extensible: new
// intent patterns can be registered at runtime without rebuilding the engine.

const INTENT_PATTERNS = [
  { intent: "greeting", weight: 3, patterns: [/\b(hi|hello|hey|howdy|greetings|good (morning|afternoon|evening))\b/i] },
  { intent: "farewell", weight: 2, patterns: [/\b(bye|goodbye|see you|thanks|thank you)\b/i] },
  { intent: "image_generation", weight: 4, patterns: [/\b(generate|create|draw|make|render|design)\b.*\b(image|picture|photo|illustration|logo|art|visual)\b/i, /\b(image|picture|photo|illustration|logo|art)\b.*\b(of|showing)\b/i] },
  { intent: "image_understanding", weight: 4, patterns: [/\b(analyze|describe|explain|what is in|inspect)\b.*\b(image|picture|photo|screenshot)\b/i, /\b(image|picture|photo|screenshot)\b.*\b(analyze|describe)\b/i] },
  { intent: "coding", weight: 4, patterns: [/\b(write|create|generate|build|implement|code|program)\b.*\b(python|javascript|typescript|java|c\+\+|rust|go|sql|html|css|lua|php|code|program|script|function|class)\b/i, /\b(debug|fix|refactor|optimize|test)\b.*\b(code|function|program|bug|error)\b/i] },
  { intent: "website", weight: 4, patterns: [/\b(build|create|make|design)\b.*\b(website|web ?app|webpage|landing page|site)\b/i, /\b(website|web app|frontend|backend)\b/i] },
  { intent: "document", weight: 3, patterns: [/\b(analyze|read|summarize|process|parse)\b.*\b(document|pdf|docx|file|text)\b/i, /\b(document|pdf)\b/i] },
  { intent: "research", weight: 3, patterns: [/\b(research|search|find|latest|news|look up|retrieve)\b/i] },
  { intent: "math", weight: 3, patterns: [/\b(solve|calculate|compute|math|equation|integral|derivative)\b/i, /\d+\s*[\+\-\*\/\^]\s*\d+/] },
  { intent: "debug", weight: 4, patterns: [/\b(debug|trace|stack trace|error|exception|not working|fails)\b/i] }
];

const INTENT_SKILLS = {
  greeting: ["conversation"],
  farewell: ["conversation"],
  image_generation: ["image_generation", "creative_design"],
  image_understanding: ["computer_vision", "image_understanding"],
  coding: ["coding", "planning", "testing"],
  website: ["frontend_development", "backend_development", "planning", "testing"],
  document: ["document_processing", "knowledge_retrieval"],
  research: ["research", "knowledge_retrieval", "reasoning"],
  math: ["mathematical_reasoning", "reasoning"],
  debug: ["code_analysis", "debugging", "reasoning"],
  knowledge: ["knowledge_retrieval", "reasoning"],
  conversation: ["conversation", "reasoning"],
  agent_task: ["planning", "coding", "tool_execution", "testing"]
};

function normalize(text) {
  return String(text || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function scoreIntents(text) {
  const scores = new Map();
  for (const entry of INTENT_PATTERNS) {
    let score = 0;
    for (const pattern of entry.patterns) {
      if (pattern.test(text)) score += entry.weight;
    }
    if (score > 0) scores.set(entry.intent, (scores.get(entry.intent) || 0) + score);
  }
  return scores;
}

function classifyIntent(text, opts = {}) {
  const normalized = normalize(text);
  const scores = scoreIntents(normalized);

  // Default to knowledge/reasoning for questions, conversation otherwise.
  let intent = "conversation";
  let confidence = 0.4;
  if (scores.size > 0) {
    const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);
    intent = sorted[0][0];
    confidence = Math.min(0.99, 0.5 + sorted[0][1] * 0.08);
  } else if (/[?]/.test(normalized) || /^(what|why|how|when|where|who|explain)\b/.test(normalized)) {
    intent = "knowledge";
    confidence = 0.6;
  }

  // Detect multi-step/agent tasks: verbs + multiple deliverables.
  if (/\b(build|create|implement|develop)\b/.test(normalized) && /\b(and|with|including)\b/.test(normalized)) {
    intent = intent === "conversation" ? "agent_task" : intent;
    if (intent === "agent_task") confidence = Math.max(confidence, 0.7);
  }

  const skills = INTENT_SKILLS[intent] || INTENT_SKILLS.conversation;
  return {
    intent,
    confidence: Number(confidence.toFixed(3)),
    scores: Object.fromEntries(scores),
    skills: [...skills]
  };
}

async function classifyIntentWithModel(text, chat) {
  if (typeof chat !== "function") return classifyIntent(text);
  const base = classifyIntent(text);
  try {
    const raw = await chat({
      system: "Classify the user's intent. Reply with ONLY a JSON object: {\"intent\":\"...\",\"confidence\":0.0-1.0}.",
      messages: [{ role: "user", content: text }]
    });
    const match = String(raw || "").match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (parsed && typeof parsed.intent === "string") {
        const intent = parsed.intent;
        const confidence = Number(parsed.confidence);
        return {
          intent,
          confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : base.confidence,
          scores: base.scores,
          skills: INTENT_SKILLS[intent] || base.skills
        };
      }
    }
  } catch (err) {
    // Fall back to heuristic classification.
  }
  return base;
}

function registerIntentPattern(intent, pattern, weight = 3) {
  INTENT_PATTERNS.push({ intent, weight, patterns: [pattern] });
  if (!INTENT_SKILLS[intent]) INTENT_SKILLS[intent] = ["reasoning"];
}

module.exports = {
  INTENT_PATTERNS,
  INTENT_SKILLS,
  classifyIntent,
  classifyIntentWithModel,
  registerIntentPattern,
  normalize
};
