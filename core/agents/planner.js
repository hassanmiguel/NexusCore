"use strict";

// Task planner: given a high-level task and the available tools, asks the
// model for a JSON step plan. Falls back to a deterministic structure when
// the model output can't be parsed (common with small local models).

function extractJsonBlock(text) {
  const source = String(text || "");
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : source;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch (err) {
    return null;
  }
}

function parsePlan(raw) {
  const parsed = typeof raw === "object" && raw !== null ? raw : extractJsonBlock(raw);
  if (!parsed) return null;
  const steps = Array.isArray(parsed.steps) ? parsed.steps : [];
  if (steps.length === 0) return null;
  const normalized = [];
  for (const step of steps) {
    const title = String(step.title || step.step || "").trim();
    if (!title) continue;
    normalized.push({
      title,
      detail: String(step.detail || step.description || "").trim(),
      tool: String(step.tool || "").trim() || null
    });
  }
  if (normalized.length === 0) return null;
  return { goal: String(parsed.goal || "").trim() || null, steps: normalized };
}

function fallbackPlan(task, toolsList) {
  const toolNames = toolsList.map(tool => tool.name);
  const steps = [];
  const hasKb = toolNames.includes("knowledge_search");
  const hasMem = toolNames.includes("memory_search");
  const hasInfo = toolNames.includes("system_info");

  if (hasMem) steps.push({ title: "Recall relevant memory", detail: "Search the user's approved memories for context about this task.", tool: "memory_search" });
  if (hasKb) steps.push({ title: "Query the knowledge base", detail: "Search ingested documents for information relevant to the task.", tool: "knowledge_search" });
  if (hasInfo) steps.push({ title: "Gather system context", detail: "Collect system information that may inform the answer.", tool: "system_info" });
  steps.push({ title: "Analyze findings", detail: "Synthesize retrieved information and reason about the task.", tool: null });
  steps.push({ title: "Compose final answer", detail: "Produce a complete, accurate response to the task.", tool: null });
  return { goal: task, steps, fallback: true };
}

module.exports = { extractJsonBlock, parsePlan, fallbackPlan };