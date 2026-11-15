"use strict";

// Versioned config snapshots for key settings: routing, modes, prompts,
// provider selections. Lets the user roll back to a known-good state.

function createId() {
  return "snap_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

function ensureVersions(data) {
  data.ai = data.ai && typeof data.ai === "object" ? data.ai : {};
  data.ai.versions = data.ai.versions && typeof data.ai.versions === "object"
    ? data.ai.versions
    : { snapshots: [], activeId: null, schema: 1 };
  return data.ai.versions;
}

function snapshot(data, input = {}) {
  const store = ensureVersions(data);
  const entry = {
    id: createId(),
    label: String(input.label || "update").slice(0, 120),
    sections: input.sections && typeof input.sections === "object" ? input.sections : {},
    createdAt: new Date().toISOString(),
    revertedAt: null
  };
  store.snapshots.push(entry);
  store.snapshots = store.snapshots.slice(-80);
  store.activeId = entry.id;
  return entry;
}

function listVersions(data) {
  return ensureVersions(data).snapshots || [];
}

function latestVersion(data) {
  const snapshots = ensureVersions(data).snapshots || [];
  return snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
}

function getActiveVersion(data) {
  const store = ensureVersions(data);
  const activeId = store.activeId;
  if (!activeId) return null;
  return (store.snapshots || []).find(item => item.id === activeId) || null;
}

function revertVersion(data, id) {
  const store = ensureVersions(data);
  const target = (store.snapshots || []).find(item => item.id === id);
  if (!target) return null;
  store.activeId = id;
  target.revertedAt = new Date().toISOString();
  return target;
}

function diffVersions(data, idA, idB) {
  const store = ensureVersions(data);
  const a = (store.snapshots || []).find(item => item.id === idA);
  const b = (store.snapshots || []).find(item => item.id === idB);
  if (!a || !b) return null;
  const keys = new Set([...Object.keys(a.sections || {}), ...Object.keys(b.sections || {})]);
  const changes = [];
  for (const key of keys) {
    const before = a.sections[key];
    const after = b.sections[key];
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    changes.push({ section: key, before: before || null, after: after || null });
  }
  return { a: { id: a.id, label: a.label, createdAt: a.createdAt }, b: { id: b.id, label: b.label, createdAt: b.createdAt }, changes };
}

module.exports = {
  snapshot,
  listVersions,
  latestVersion,
  getActiveVersion,
  revertVersion,
  diffVersions
};