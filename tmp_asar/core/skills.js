const fs = require("fs");
const path = require("path");
const { app } = require("electron");

const INDEX_FILE = "skills_index.json";
const SKILLS_DIR = "skills";
const MAX_SKILL_BYTES = 120000;

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

let cachedBase = null;
let cachedIndex = null;

function resolveBase() {
  if (cachedBase) return cachedBase;
  const candidates = [];
  try {
    if (app && app.getAppPath) candidates.push(app.getAppPath());
  } catch (err) {
    // Ignore app path lookup failures.
  }
  if (process.cwd()) candidates.push(process.cwd());
  try {
    if (app && app.isPackaged && app.getPath) {
      candidates.push(path.join(app.getPath("exe"), ".."));
    }
  } catch (err) {
    // Ignore exe path lookup failures.
  }

  for (const base of candidates) {
    try {
      const index = path.join(base, INDEX_FILE);
      const dir = path.join(base, SKILLS_DIR);
      if (fs.existsSync(index) || fs.existsSync(dir)) {
        cachedBase = base;
        return base;
      }
    } catch (err) {
      // Ignore unreadable candidate paths.
    }
  }
  cachedBase = process.cwd();
  return cachedBase;
}

function skillsDir() {
  return path.join(resolveBase(), SKILLS_DIR);
}

function normalizeEntry(entry) {
  const safe = entry && typeof entry === "object" ? entry : {};
  return {
    id: typeof safe.id === "string" && safe.id ? safe.id : safe.name || "",
    name: typeof safe.name === "string" && safe.name ? safe.name : safe.id || "",
    path: typeof safe.path === "string" ? safe.path : "",
    category: typeof safe.category === "string" ? safe.category : "",
    description: typeof safe.description === "string" ? safe.description : "",
    risk: typeof safe.risk === "string" ? safe.risk : "safe",
    source: typeof safe.source === "string" ? safe.source : ""
  };
}

function loadIndex() {
  if (cachedIndex) return cachedIndex;
  const file = path.join(resolveBase(), INDEX_FILE);
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    if (Array.isArray(raw)) {
      cachedIndex = raw
        .map(normalizeEntry)
        .filter(entry => entry.id);
      return cachedIndex;
    }
  } catch (err) {
    // Fall through to a filesystem scan.
  }

  const entries = [];
  let names = [];
  try {
    names = fs.readdirSync(skillsDir());
  } catch (err) {
    names = [];
  }
  for (const name of names) {
    let stat = null;
    try {
      stat = fs.statSync(path.join(skillsDir(), name));
    } catch (err) {
      stat = null;
    }
    if (!stat || !stat.isDirectory()) continue;
    if (!fs.existsSync(path.join(skillsDir(), name, "SKILL.md"))) continue;
    entries.push(
      normalizeEntry({ id: name, name, path: `skills/${name}`, source: "local" })
    );
  }
  cachedIndex = entries;
  return cachedIndex;
}

function toSummary(entry) {
  return {
    id: entry.id,
    name: entry.name,
    category: entry.category,
    description: entry.description,
    risk: entry.risk,
    source: entry.source
  };
}

function listSkills() {
  return loadIndex().map(toSummary);
}

function getSkill(id) {
  const safe = String(id || "").trim();
  if (!ID_PATTERN.test(safe)) throw new Error("Invalid skill id");
  const file = path.join(skillsDir(), safe, "SKILL.md");
  if (!fs.existsSync(file)) throw new Error(`Skill not found: ${safe}`);
  const text = fs.readFileSync(file, "utf8");
  const entry =
    loadIndex().find(item => item.id === safe) ||
    normalizeEntry({ id: safe, name: safe });
  return {
    ...toSummary(entry),
    content: text.length > MAX_SKILL_BYTES ? text.slice(0, MAX_SKILL_BYTES) : text,
    length: text.length
  };
}

function searchSkills(query, category, risk) {
  const q = String(query || "").toLowerCase().trim();
  let results = loadIndex();
  if (category) results = results.filter(item => item.category === category);
  if (risk) results = results.filter(item => item.risk === risk);
  if (q) {
    results = results.filter(
      item =>
        (item.id || "").toLowerCase().includes(q) ||
        (item.name || "").toLowerCase().includes(q) ||
        (item.category || "").toLowerCase().includes(q) ||
        (item.description || "").toLowerCase().includes(q)
    );
  }
  return results.slice(0, 800).map(toSummary);
}

function getCategories() {
  const seen = new Set();
  loadIndex().forEach(item => {
    if (item.category) seen.add(item.category);
  });
  return Array.from(seen).sort();
}

function getStats() {
  return { total: loadIndex().length, base: resolveBase() };
}

module.exports = { listSkills, getSkill, searchSkills, getCategories, getStats };