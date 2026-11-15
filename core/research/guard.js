"use strict";

// Safety layer for web research: SSRF guards, protocol allow-list,
// sanitization, and prompt-injection detection on fetched content.

const PRIVATE_RANGES = [
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^192\.168\.\d{1,3}\.\d{1,3}$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/,
  /^169\.254\.\d{1,3}\.\d{1,3}$/,
  /^0\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^::1$/,
  /^::$/,
  /^fc00:/,
  /^fe80:/,
  /^2001:db8:/
];

function isIpAddress(host) {
  return /^[0-9.]+$/.test(host) || host.includes(":");
}

function blockedHost(host) {
  const normalized = String(host || "").toLowerCase().replace(/^\[([^\]]+)\]$/, "$1").trim();
  if (!normalized) return "empty host";
  if (/^(localhost|localhost\.localdomain)$/.test(normalized)) return "localhost";
  if (/\.local$/.test(normalized)) return "local TLD";
  if (/^(\.?)((10|127)\.|192\.168\.)/.test(normalized)) return "private IPv4";
  if (/^169\.254\.|^0\./.test(normalized)) return "link-local/unspecified";
  return null;
}

function isExternalUrl(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl || "").trim());
  } catch (err) {
    return { ok: false, reason: "not a valid URL" };
  }
  const protocol = url.protocol;
  if (protocol !== "http:" && protocol !== "https:") {
    return { ok: false, reason: `protocol not allowed (${protocol})` };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "URL must not contain credentials" };
  }
  if (isIpAddress(url.hostname) && PRIVATE_RANGES.some(range => range.test(url.hostname))) {
    return { ok: false, reason: "private/reserved IP blocked (SSRF guard)" };
  }
  const hostBlock = blockedHost(url.hostname);
  if (hostBlock) return { ok: false, reason: `blocked host (${hostBlock})` };
  return { ok: true, url };
}

const INJECTION_HINTS = [
  "ignore previous instructions",
  "ignore all previous",
  "disregard your instructions",
  "disregard the above",
  "you are now",
  "act as if you",
  "you are not an ai",
  "override your system",
  "new system prompt",
  "reveal your system prompt",
  "developer mode",
  "dan mode",
  "jailbreak act",
  "forget everything",
  "i am the developer",
  "instructions in this page",
  "follow the following prompt",
  "as an ai, you"
];

function detectInjection(text) {
  const source = String(text || "").toLowerCase();
  const hits = INJECTION_HINTS.filter(hint => source.includes(hint));
  if (hits.length === 0) return null;
  return {
    flagged: true,
    hints: hits,
    severity: hits.length >= 3 ? "high" : hits.length >= 2 ? "medium" : "low"
  };
}

function detectSuspiciousUrl(rawUrl) {
  const { ok, url, reason } = isExternalUrl(rawUrl);
  if (!ok) return { flagged: true, reason };
  if (/blob:|data:/i.test(url.protocol)) return { flagged: true, reason: "non-http data URL" };
  return { flagged: false };
}

function sanitizeText(raw) {
  return String(raw || "")
    .replace(/\u0000/g, "")
    .replace(/[^\x20-\x7E\n\r\t]/g, " ")
    .replace(/[\r\n]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 100000);
}

module.exports = {
  isExternalUrl,
  blockedHost,
  detectInjection,
  detectSuspiciousUrl,
  sanitizeText,
  INJECTION_HINTS
};