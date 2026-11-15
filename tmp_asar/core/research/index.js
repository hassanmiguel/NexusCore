"use strict";

// Research orchestration: search the web, fetch+extract top sources with
// per-URL safety checks, detect prompt injection in fetched content, and
// record everything with full provenance (url, title, fetchedAt).

const { searchWeb } = require("./search");
const { fetchText } = require("./fetch");
const { detectInjection, sanitizeText } = require("./guard");

function logReason(detected) {
  if (!detected) return null;
  return `flagged for ${detected.severity} risk (${detected.hints.join(", ")})`;
}

/**
 * Perform research on a query. Returns sources with provenance.
 */
async function research(query, opts = {}) {
  const maxSources = Number.isFinite(opts.maxSources) ? opts.maxSources : 4;
  const skipInjections = opts.skipInjections === true;

  const search = await searchWeb(query, { maxResults: Math.max(maxSources, 6) });
  const sources = [];

  for (const result of search.results.slice(0, maxSources)) {
    if (sources.length >= maxSources) break;
    let fetched = null;
    let error = null;
    try {
      fetched = await fetchText(result.url, { timeoutMs: opts.timeoutMs });
      const injection = detectInjection(fetched.text + " " + fetched.title);
      const flagged = skipInjections ? false : Boolean(injection);
      const text = flagged ? "" : fetched.text;
      sources.push({
        title: result.title || fetched.title,
        url: fetched.url || result.url,
        snippet: result.snippet,
        text: sanitizeText(text).slice(0, opts.maxText || 8000),
        charCount: text.length,
        fetchedAt: new Date().toISOString(),
        contentType: fetched.contentType,
        injection: injection ? { severity: injection.severity, hints: injection.hints } : null
      });
    } catch (err) {
      error = {
        message: err && err.message ? err.message : String(err),
        code: err && err.code ? err.code : null,
        status: err && err.status ? err.status : null
      };
    }
    if (error !== null) {
      sources.push({
        title: result.title,
        url: result.url,
        snippet: result.snippet,
        text: "",
        charCount: 0,
        fetchedAt: new Date().toISOString(),
        error
      });
    }
  }

  return {
    query,
    ranAt: new Date().toISOString(),
    sourceCount: sources.length,
    sources
  };
}

/**
 * Build a "research context" string for the LLM: per-source provenance blocks
 * with explicit source boundaries. Reject-injection text is dropped.
 */
function toContext(report, opts = {}) {
  const maxChars = opts.maxChars || 12000;
  let output = "";
  for (const source of report.sources) {
    if (!source.text && !source.error) continue;
    if (source.error) {
      output += `\n[SOURCE ERROR] ${source.url}: ${source.error.message}\n`;
      continue;
    }
    output += `\n[SOURCE] ${source.title}\nURL: ${source.url}\nFetched: ${source.fetchedAt}\n--- BEGIN ---\n${source.text}\n--- END ---\n`;
    if (output.length >= maxChars) {
      output = output.slice(0, maxChars);
      break;
    }
  }
  return output.trim();
}

/**
 * Summarize research into a memory-worthy knowledge note.
 */
function distillSources(report, maxSourceChars = 600) {
  const layers = [];
  for (const source of report.sources) {
    if (!source.text) continue;
    layers.push({
      title: source.title,
      url: source.url,
      preview: sanitizeText(source.text).slice(0, maxSourceChars)
    });
  }
  return layers;
}

module.exports = { research, toContext, distillSources };