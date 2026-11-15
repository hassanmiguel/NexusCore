import { useState } from "react";
import Settings from "./Settings.jsx";
import AgentPanel from "./AgentPanel.jsx";
import SkillsPanel from "./SkillsPanel.jsx";
import PromptTemplates from "./PromptTemplates.jsx";
import FolderManager from "./FolderManager.jsx";

export default function Sidebar({
  threads,
  activeId,
  onSelect,
  onNew,
  onClear,
  search,
  onSearch,
  onRename,
  onDuplicate,
  onDelete,
  onExport,
  onImport,
  showSettings,
  onToggleSettings,
  showStorageEye,
  onToggleStorageEye,
  keyStatus,
  onKeySaved,
  systemPrompt,
  onSystemPromptChange,
  accent,
  onAccentChange,
  fontSize,
  onFontSizeChange,
  skillsEnabled,
  onToggleSkill,
  autoSkills,
  onToggleAutoSkills
}) {
  const [showAgent, setShowAgent] = useState(false);
  const [showSkills, setShowSkills] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showFolders, setShowFolders] = useState(false);
  const [activeFolderId, setActiveFolderId] = useState("all");
  const statusLabel =
    keyStatus === "saved"
      ? "API key saved"
      : keyStatus === "missing"
        ? "API key missing"
        : "Checking key";
  const statusClass =
    keyStatus === "saved"
      ? "is-ok"
      : keyStatus === "missing"
        ? "is-missing"
        : "is-unknown";

  function handleSelectTemplate(content) {
    onSystemPromptChange(content);
    setShowTemplates(false);
  }

  function getThreadFolder(threadId) {
    try {
      const stored = localStorage.getItem("wormgpt_thread_folders");
      const mapping = stored ? JSON.parse(stored) : {};
      return mapping[threadId] || "unfiled";
    } catch {
      return "unfiled";
    }
  }

  function filteredThreads() {
    const folderFiltered = threads.filter(t => 
      activeFolderId === "all" || getThreadFolder(t.id) === activeFolderId
    );
    return folderFiltered.filter(thread => 
      `${thread.title} ${thread.messages.map(message => message.content).join(" ")}`.toLowerCase().includes(search.toLowerCase())
    );
  }

  return (
    <aside className="sidebar">
      <button type="button" className="sidebar__new" onClick={onNew}>
        + New Chat
      </button>
      <div className="sidebar__section">
        <div className="sidebar__label">Chats</div>
        <input className="sidebar__search" placeholder="Search conversations" value={search} onChange={e => onSearch(e.target.value)} />
        <div className="sidebar__list">
          {filteredThreads().map(thread => (
            <div key={thread.id} className={`sidebar__item ${thread.id === activeId ? "is-active" : ""}`}>
              <button
                type="button"
                className="sidebar__item-open"
                onClick={() => onSelect(thread.id)}
                onContextMenu={event => { event.preventDefault(); onRename(thread.id); }}
              >
                <span className="sidebar__title">{thread.title}</span>
                <span className="sidebar__item-count">{thread.messages.filter(m => m.role !== "system").length}</span>
              </button>
              <div className="sidebar__item-actions">
                <button type="button" title="Rename" onClick={() => onRename(thread.id)}>↻</button>
                <button type="button" title="Duplicate" onClick={() => onDuplicate(thread.id)}>⧉</button>
                <button type="button" title="Delete" className="is-danger" onClick={() => onDelete(thread.id)}>✕</button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="sidebar__status">
        <span className={`status-dot ${statusClass}`} />
        <span>{statusLabel}</span>
      </div>
      <div className="sidebar__actions">
        <button type="button" className="ghost" onClick={onClear}>
          Clear Conversations
        </button>
        <button type="button" className="ghost" onClick={onExport}>
          Export Current Chat
        </button>
        <label className="ghost sidebar__file-button">
          Import Chats
          <input type="file" accept=".json,application/json" onChange={onImport} />
        </label>
        <button type="button" className="ghost" onClick={onToggleSettings}>
          {showSettings ? "Hide Settings" : "Settings"}
        </button>
        <button type="button" className="ghost" onClick={onToggleStorageEye}>
          {showStorageEye ? "Hide Storage Eye" : "Storage Eye"}
        </button>
        <button type="button" className="ghost" onClick={() => setShowAgent(value => !value)}>
          {showAgent ? "Hide Agent" : "Agent Controls"}
        </button>
        <button type="button" className="ghost" onClick={() => setShowSkills(value => !value)}>
          {showSkills ? "Hide Skills" : `Skill Library${skillsEnabled.length ? ` (${skillsEnabled.length})` : ""}`}
        </button>
        <button type="button" className="ghost" onClick={() => setShowTemplates(value => !value)}>
          {showTemplates ? "Hide Templates" : "Prompt Templates"}
        </button>
        <button type="button" className="ghost" onClick={() => setShowFolders(value => !value)}>
          {showFolders ? "Hide Folders" : "Folders"}
        </button>
      </div>
      {showSkills && (
        <SkillsPanel
          enabledSkills={skillsEnabled}
          onToggleSkill={onToggleSkill}
          autoSkills={autoSkills}
          onToggleAutoSkills={onToggleAutoSkills}
        />
      )}
      {showTemplates && (
        <PromptTemplates onSelectTemplate={handleSelectTemplate} />
      )}
      {showFolders && (
        <FolderManager
          threads={threads}
          activeFolderId={activeFolderId}
          onSelectFolder={setActiveFolderId}
        />
      )}
      {showSettings && (
        <Settings
          onKeySaved={onKeySaved}
          systemPrompt={systemPrompt}
          onSystemPromptChange={onSystemPromptChange}
          accent={accent}
          onAccentChange={onAccentChange}
          fontSize={fontSize}
          onFontSizeChange={onFontSizeChange}
        />
      )}
      {showAgent && <AgentPanel />}
    </aside>
  );
}