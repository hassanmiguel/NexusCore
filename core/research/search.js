"use strict";

// Web search via DuckDuckGo's HTML endpoint (no API key required).
// Parses organic results into { title, url, snippet } objects.

const { isExternalUrl, detectSuspiciousUrl } = require("./guard");

const SEARCH_URL = "https://html.duckduckgo.com/html/";
const MAX_QUERY_LENGTH = 120;

async function searchWeb(query, opts = {}) {
  const text = String(query || "").trim().slice(0, MAX_QUERY_LENGTH);
  if (!text) return { query: "", results: [] };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs || 15000);
  let response;
  try {
    response = await globalThis.fetch(SEARCH_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (WormGPT Research Agent; +local-first)",
        accept: "text/html",
        "content-type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({ q: text }).toString()
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const err = new Error(`Search provider returned HTTP ${response.status}`);
    err.status = response.status;
    throw err;
  }

  const html = await response.text();
  const results = parseResults(html, opts.maxResults || 8);
  return { query: text, results };
}

function parseResults(html, maxResults) {
  const extracted = [];
  const refRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
  const blockRegex = /<div[^>]+class="result results_links[^"]*"[^>]*>([\s\S]*?)(?=<div class="result results_links[^"]*"|$)/gi;

  const blocks = [];
  let blockMatch;
  while ((blockMatch = blockRegex.exec(html)) !== null) {
    blocks.push(blockMatch[1]);
  }

  for (const raw of blocks) {
    const link = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(raw);
    if (!link) continue;
    const url = decodeDdg(link[1]);
    const title = stripTags(link[2]);
    const snip = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i.exec(raw);
    const snippet = snip ? stripTags(snip[1]) : "";
    if (!url) continue;
    const safe = detectSuspiciousUrl(url);
    if (safe.flagged) continue;
    if (!isExternalUrl(url).ok) continue;
    extracted.push({ title, url, snippet: snippet.slice(0, 500) });
    if (extracted.length >= maxResults) break;
  }

  return extracted;
}

function stripTags(raw) {
  return String(raw || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeDdg(raw) {
  const match = String(raw || "").match(/uddg=([^&]+)/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch (err) {
    return null;
  }
}

module.exports = { searchWeb, parseResults, stripTags, decodeDdg };