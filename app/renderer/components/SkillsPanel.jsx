import { useEffect, useMemo, useState } from "react";

const RISKS = [
  { value: "", label: "All risk levels" },
  { value: "safe", label: "Safe" },
  { value: "moderate", label: "Moderate" },
  { value: "critical", label: "Critical" },
  { value: "offensive", label: "Offensive" }
];

export default function SkillsPanel({ enabledSkills, onToggleSkill, autoSkills, onToggleAutoSkills }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [risk, setRisk] = useState("");
  const [categories, setCategories] = useState([]);
  const [results, setResults] = useState([]);
  const [total, setTotal] = useState(0);
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadMounted() {
      try {
        const [stats, cats, list] = await Promise.all([
          window.wormgpt.skillStats(),
          window.wormgpt.skillCategories(),
          window.wormgpt.searchSkills("", "", "")
        ]);
        if (cancelled) return;
        setTotal(stats.total);
        setCategories(cats);
        setResults(list);
        if (list.length === 0) {
          setStatus("No skills found. Make sure the skills folder shipped with the app.");
        }
      } catch (err) {
        if (!cancelled) {
          setStatus(err?.message || "Skill library unavailable.");
        }
      }
    }
    loadMounted();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const list = await window.wormgpt.searchSkills(query, category, risk);
        if (!cancelled) setResults(list);
      } catch (err) {
        if (!cancelled) setStatus(err?.message || "Search failed.");
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, category, risk]);

  const enabledSet = useMemo(() => new Set(enabledSkills || []), [enabledSkills]);

  function toggle(id) {
    const next = enabledSet.has(id);
    onToggleSkill(id, !next);
  }

  async function showPreview(id) {
    if (preview && preview.id === id) {
      setPreview(null);
      return;
    }
    try {
      const skill = await window.wormgpt.getSkill(id);
      setPreview({ id: skill.id, name: skill.name, description: skill.description, content: skill.content });
    } catch (err) {
      setStatus(err?.message || "Could not read skill.");
    }
  }

  function copyMention(id) {
    window.wormgpt.copyText(`@${id}`);
    setStatus(`Copied @${id} - paste it with your question.`);
  }

  return (
    <div className="skill-panel">
      <div className="settings__title">Skill Library — {total} skills</div>
      <label className="agent-panel__toggle">
        <input type="checkbox" checked={Boolean(autoSkills)} onChange={e => onToggleAutoSkills(e.target.checked)} />
        Auto-include pinned skills in every request
      </label>
      <div className="skill-panel__tip">
        Type <code className="md__inline-code">@skill-name</code> in your message to summon that skill. Pin skills below as shortcuts.
      </div>
      <input className="sidebar__search" placeholder="Search skills..." value={query} onChange={e => setQuery(e.target.value)} />
      <div className="skill-panel__filters">
        <select value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {categories.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={risk} onChange={e => setRisk(e.target.value)}>
          {RISKS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </div>
      <div className="skill-panel__list">
        {results.length === 0 && <div className="skill-panel__empty">{status || "No matches."}</div>}
        {results.length > 0 && results.length >= 800 && (
          <div className="skill-panel__empty">Showing first 800 matches - narrow your search.</div>
        )}
        {results.map(skill => (
          <div key={skill.id} className={`skill-row ${enabledSet.has(skill.id) ? "is-enabled" : ""}`}>
            <button
              type="button"
              className="skill-row__main"
              onClick={() => showPreview(skill.id)}
              title="Click to preview"
            >
              <span className="skill-row__name">{skill.name}</span>
              <span className="skill-row__desc">{skill.description || "No description"}</span>
              <div className="skill-row__meta">
                {skill.category && <span className="skill-tag">{skill.category}</span>}
                {skill.risk && <span className={`skill-tag is-${skill.risk}`}>{skill.risk}</span>}
              </div>
            </button>
            <div className="skill-row__actions">
              <button type="button" title="Copy @mention" onClick={() => copyMention(skill.id)}>@</button>
              <button type="button" title={enabledSet.has(skill.id) ? "Unpin skill" : "Pin skill"} onClick={() => toggle(skill.id)}>
                {enabledSet.has(skill.id) ? "★" : "☆"}
              </button>
            </div>
          </div>
        ))}
      </div>
      {preview && (
        <div className="skill-panel__preview">
          <div className="skill-panel__preview-head">
            <strong>{preview.name}</strong>
            <button type="button" className="ghost" onClick={() => setPreview(null)}>Close</button>
          </div>
          <div className="skill-panel__preview-body">{preview.content}</div>
        </div>
      )}
      {status && <div className="settings__status is-info">{status}</div>}
    </div>
  );
}