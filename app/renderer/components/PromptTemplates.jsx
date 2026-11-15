import { useState, useEffect } from "react";

const BUILTIN_TEMPLATES = [
  {
    id: "coding-assistant",
    name: "Code Assistant",
    description: "Expert programming assistant for any language",
    category: "coding",
    content: `You are an expert software engineer. Write clean, efficient, well-documented code. Follow best practices and design patterns. Explain your reasoning and trade-offs.`
  },
  {
    id: "code-review",
    name: "Code Reviewer",
    description: "Thorough code review with suggestions",
    category: "coding",
    content: `You are a senior engineer doing a code review. Analyze for: correctness, performance, security, maintainability, and style. Provide specific, actionable feedback with code examples.`
  },
  {
    id: "debugging",
    name: "Debugging Assistant",
    description: "Help debug and fix issues",
    category: "coding",
    content: `You are a debugging expert. Given code and error messages, identify root causes and provide fixes. Ask clarifying questions if needed. Explain the bug and why your fix works.`
  },
  {
    id: "technical-writer",
    name: "Technical Writer",
    description: "Clear technical documentation and guides",
    category: "writing",
    content: `You are a technical writer. Create clear, concise documentation, tutorials, and guides. Use proper structure, examples, and diagrams where helpful. Target audience: developers.`
  },
  {
    id: "creative-writer",
    name: "Creative Writer",
    description: "Stories, poems, and creative content",
    category: "writing",
    content: `You are a creative writer. Write engaging stories, poems, and creative pieces. Focus on vivid imagery, compelling characters, and emotional resonance. Adapt to any genre or style.`
  },
  {
    id: "researcher",
    name: "Research Assistant",
    description: "Deep research and analysis",
    category: "analysis",
    content: `You are a research analyst. Provide thorough, well-sourced analysis on any topic. Structure findings clearly, cite sources, identify biases, and present balanced perspectives.`
  },
  {
    id: "data-analyst",
    name: "Data Analyst",
    description: "Data analysis and visualization guidance",
    category: "analysis",
    content: `You are a data analyst. Help with data cleaning, analysis, visualization, and interpretation. Suggest appropriate statistical methods and tools. Explain insights in plain language.`
  },
  {
    id: "teacher",
    name: "Teacher/Tutor",
    description: "Explain concepts clearly with examples",
    category: "learning",
    content: `You are an expert teacher. Explain complex topics clearly with analogies, examples, and step-by-step breakdowns. Adapt to the learner's level. Check understanding with questions.`
  },
  {
    id: "architect",
    name: "System Architect",
    description: "Software architecture and design",
    category: "coding",
    content: `You are a system architect. Design scalable, maintainable systems. Consider trade-offs, patterns, and long-term evolution. Provide diagrams (ASCII/mermaid) and rationale.`
  },
  {
    id: "security-expert",
    name: "Security Expert",
    description: "Security analysis and best practices",
    category: "coding",
    content: `You are a security expert. Identify vulnerabilities, suggest mitigations, and promote secure coding practices. Cover OWASP Top 10, threat modeling, and compliance.`
  }
];

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "coding", label: "Coding" },
  { id: "writing", label: "Writing" },
  { id: "analysis", label: "Analysis" },
  { id: "learning", label: "Learning" }
];

export default function PromptTemplates({ onSelectTemplate }) {
  const [templates, setTemplates] = useState([]);
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customContent, setCustomContent] = useState("");
  const [customCategory, setCustomCategory] = useState("coding");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editCategory, setEditCategory] = useState("coding");

  useEffect(() => {
    loadTemplates();
  }, []);

  function loadTemplates() {
    try {
      const stored = localStorage.getItem("wormgpt_prompt_templates");
      const custom = stored ? JSON.parse(stored) : [];
      setTemplates([...BUILTIN_TEMPLATES, ...custom]);
    } catch (err) {
      setTemplates(BUILTIN_TEMPLATES);
    }
  }

  function saveCustomTemplates(custom) {
    localStorage.setItem("wormgpt_prompt_templates", JSON.stringify(custom));
    loadTemplates();
  }

  function getCustomTemplates() {
    return templates.filter(t => !BUILTIN_TEMPLATES.find(b => b.id === t.id));
  }

  function filteredTemplates() {
    let result = templates;
    if (category !== "all") {
      result = result.filter(t => t.category === category);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(t => 
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.content.toLowerCase().includes(q)
      );
    }
    return result;
  }

  function handleSelect(template) {
    if (onSelectTemplate) onSelectTemplate(template.content);
  }

  function startCustom() {
    setShowCustom(true);
    setCustomName("");
    setCustomContent("");
    setCustomCategory("coding");
  }

  function saveCustom() {
    if (!customName.trim() || !customContent.trim()) return;
    const custom = getCustomTemplates();
    const newTemplate = {
      id: `custom-${Date.now()}`,
      name: customName.trim(),
      description: customContent.slice(0, 80) + (customContent.length > 80 ? "..." : ""),
      category: customCategory,
      content: customContent.trim(),
      custom: true
    };
    saveCustomTemplates([...custom, newTemplate]);
    setShowCustom(false);
  }

  function startEdit(template) {
    setEditingId(template.id);
    setEditName(template.name);
    setEditContent(template.content);
    setEditCategory(template.category);
  }

  function saveEdit() {
    if (!editName.trim() || !editContent.trim()) return;
    const custom = getCustomTemplates();
    const updated = custom.map(t => 
      t.id === editingId ? { ...t, name: editName.trim(), content: editContent.trim(), category: editCategory } : t
    );
    saveCustomTemplates(updated);
    setEditingId(null);
  }

  function deleteTemplate(id) {
    if (!window.confirm("Delete this template?")) return;
    const custom = getCustomTemplates();
    saveCustomTemplates(custom.filter(t => t.id !== id));
  }

  const isCustom = editingId && getCustomTemplates().some(t => t.id === editingId);

  return (
    <div className="prompt-templates">
      <div className="prompt-templates__header">
        <div className="prompt-templates__title">Prompt Templates</div>
        <button type="button" className="ghost" onClick={startCustom}>
          + New Template
        </button>
      </div>

      <div className="prompt-templates__toolbar">
        <select value={category} onChange={e => setCategory(e.target.value)} className="prompt-templates__category">
          {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <input
          type="text"
          placeholder="Search templates..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="prompt-templates__search"
        />
      </div>

      {showCustom && (
        <div className="prompt-templates__editor">
          <input
            type="text"
            placeholder="Template name"
            value={customName}
            onChange={e => setCustomName(e.target.value)}
            className="prompt-templates__input"
          />
          <select value={customCategory} onChange={e => setCustomCategory(e.target.value)} className="prompt-templates__category">
            {CATEGORIES.filter(c => c.id !== "all").map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <textarea
            placeholder="Prompt content..."
            value={customContent}
            onChange={e => setCustomContent(e.target.value)}
            className="prompt-templates__textarea"
            rows={6}
          />
          <div className="prompt-templates__actions">
            <button type="button" className="ghost" onClick={() => setShowCustom(false)}>Cancel</button>
            <button type="button" onClick={saveCustom}>Save Template</button>
          </div>
        </div>
      )}

      {editingId && (
        <div className="prompt-templates__editor">
          <input
            type="text"
            placeholder="Template name"
            value={editName}
            onChange={e => setEditName(e.target.value)}
            className="prompt-templates__input"
          />
          <select value={editCategory} onChange={e => setEditCategory(e.target.value)} className="prompt-templates__category">
            {CATEGORIES.filter(c => c.id !== "all").map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <textarea
            placeholder="Prompt content..."
            value={editContent}
            onChange={e => setEditContent(e.target.value)}
            className="prompt-templates__textarea"
            rows={6}
          />
          <div className="prompt-templates__actions">
            <button type="button" className="ghost" onClick={() => setEditingId(null)}>Cancel</button>
            <button type="button" onClick={saveEdit}>Save Changes</button>
          </div>
        </div>
      )}

      <div className="prompt-templates__list">
        {filteredTemplates().map(template => (
          <div key={template.id} className={`prompt-templates__card ${template.custom ? "is-custom" : ""}`}>
            <div className="prompt-templates__card-main" onClick={() => handleSelect(template)}>
              <div className="prompt-templates__card-name">
                {template.name}
                {template.custom && <span className="prompt-templates__custom-badge">Custom</span>}
              </div>
              <div className="prompt-templates__card-category">{CATEGORIES.find(c => c.id === template.category)?.label}</div>
              <div className="prompt-templates__card-desc">{template.description}</div>
            </div>
            {template.custom && (
              <div className="prompt-templates__card-actions">
                <button type="button" className="ghost" onClick={(e) => { e.stopPropagation(); startEdit(template); }}>Edit</button>
                <button type="button" className="ghost is-danger" onClick={(e) => { e.stopPropagation(); deleteTemplate(template.id); }}>Delete</button>
              </div>
            )}
          </div>
        ))}
        {filteredTemplates().length === 0 && (
          <div className="prompt-templates__empty">No templates found</div>
        )}
      </div>
    </div>
  );
}