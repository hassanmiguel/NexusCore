"use strict";

// Safe HTTP fetch for research: hard caps, timeouts, redirect limits,
// SSRF guard on every hop, and readable-text extraction from HTML.

const { isExternalUrl, sanitizeText } = require("./guard");

const MAX_BYTES = 1.5 * 1024 * 1024; // 1.5 MB cap
const REQUEST_TIMEOUT_MS = 15000;
const MAX_REDIRECTS = 5;
const DEFAULT_UA = "Mozilla/5.0 (WormGPT Research Agent; +local-first)";

async function fetchText(rawUrl, opts = {}) {
  let current = String(rawUrl || "").trim();
  const history = [];

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const check = isExternalUrl(current);
    if (!check.ok) {
      const err = new Error(`Blocked URL: ${check.reason}`);
      err.code = "BLOCKED_URL";
      throw err;
    }
    current = check.url.href;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs || REQUEST_TIMEOUT_MS);
    let response;
    try {
      response = await globalThis.fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "user-agent": opts.userAgent || DEFAULT_UA,
          accept: "text/html,text/plain,application/json,application/xml;q=0.9,*/*;q=0.8"
        }
      });
    } finally {
      clearTimeout(timer);
    }

    const status = response.status;
    if (status >= 300 && status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error(`Redirect without Location at hop ${hop}`);
      history.push(current);
      current = new URL(location, current).href;
      continue;
    }
    if (status >= 400) {
      const err = new Error(`HTTP ${status} for ${current}`);
      err.status = status;
      throw err;
    }

    const contentType = response.headers.get("content-type") || "text/plain";
    const total = Number(response.headers.get("content-length") || 0);
    if (total > MAX_BYTES) throw new Error("Content too large");

    let body = "";
    const reader = response.body && response.body.getReader ? response.body.getReader() : null;
    if (reader) {
      const decoder = new TextDecoder("utf-8", { fatal: false });
      let collected = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        collected += value.byteLength;
        if (collected > MAX_BYTES) throw new Error("Content exceeded size cap");
        body += decoder.decode(value, { stream: true });
      }
      body += decoder.decode();
    } else {
      body = await response.text();
      if (body.length > MAX_BYTES) throw new Error("Content exceeded size cap");
    }

    const text = contentType.includes("html")
      ? stripHtml(body)
      : body;
    return {
      url: current,
      status,
      contentType,
      title: extractTitle(body),
      text: sanitizeText(text),
      hops: history.length
    };
  }

  throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`);
}

function stripHtml(raw) {
  let text = String(raw || "");
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ");
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ");
  text = text.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, " ");
  text = text.replace(/<!--[\s\S]*?-->/g, " ");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n");
  text = text.replace(/<[^>]+>/g, " ");
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#0?39;/g, "'");
  return text.replace(/\s+/g, " ").trim();
}

function extractTitle(raw) {
  const match = String(raw || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? sanitizeText(stripHtml(match[1])) : "";
}

module.exports = { fetchText, stripHtml, extractTitle, MAX_BYTES };