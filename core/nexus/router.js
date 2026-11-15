"use strict";

const { classifyIntent } = require("./intent");
const skillRegistry = require("./skill-registry");

function selectSkills(data, intentResult) {
  const skills = skillRegistry.listSkills(data, { enabledOnly: true });
  const wanted = new Set((intentResult && intentResult.skills) || []);
  // Map high-level capability skill names to registry ids.
  const matched = [];
  for (const skill of skills) {
    const activation = Array.isArray(skill.activation) ? skill.activation : [];
    const name = String(skill.name || "").toLowerCase();
    const id = String(skill.id || "").toLowerCase();
    let score = 0;
    for (const s of wanted) {
      if (activation.includes(s)) score += 2;
      if (name.includes(s) || id.includes(s)) score += 1;
    }
    if (score > 0) matched.push({ skill, score });
  }
  matched.sort((a, b) => b.score - a.score);
  return matched.map(item => item.skill);
}

function route(data, text, opts = {}) {
  const intentResult = opts.intentResult || classifyIntent(text);
  const skills = selectSkills(data, intentResult);
  return {
    intent: intentResult.intent,
    confidence: intentResult.confidence,
    skills: skills.map(skill => skill.id),
    skillObjects: skills
  };
}

module.exports = { selectSkills, route };
