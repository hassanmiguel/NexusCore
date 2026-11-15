import { useState, useEffect } from "react";

const DEFAULT_FOLDERS = [
  { id: "all", name: "All Chats", color: "#666", system: true },
  { id: "unfiled", name: "Unfiled", color: "#888", system: true }
];

export default function FolderManager({ 
  threads, 
  activeFolderId, 
  onSelectFolder, 
  onCreateFolder, 
  onDeleteFolder,
  onRenameFolder,
  onMoveToFolder,
  folderColors = ["#e8a8b8", "#b8d4e8", "#c8b5e8", "#d4e8b8", "#f0e0a0", "#a0e0d0", "#e8c8a8", "#f0c0a0"]
}) {
  const [folders, setFolders] = useState(() => {
    try {
      const stored = localStorage.getItem("wormgpt_folders");
      return stored ? JSON.parse(stored) : [...DEFAULT_FOLDERS];
    } catch {
      return [...DEFAULT_FOLDERS];
    }
  });
  const [showCreate, setShowCreate] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderColor, setNewFolderColor] = useState(folderColors[0]);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");

  useEffect(() => {
    localStorage.setItem("wormgpt_folders", JSON.stringify(folders));
  }, [folders]);

  function getThreadFolder(threadId) {
    try {
      const stored = localStorage.getItem("wormgpt_thread_folders");
      const mapping = stored ? JSON.parse(stored) : {};
      return mapping[threadId] || "unfiled";
    } catch {
      return "unfiled";
    }
  }

  function getFolderThreads(folderId) {
    if (folderId === "all") return threads;
    return threads.filter(t => getThreadFolder(t.id) === folderId);
  }

  function getFolderCount(folderId) {
    return getFolderThreads(folderId).length;
  }

  function handleCreate() {
    if (!newFolderName.trim()) return;
    const newFolder = {
      id: `folder-${Date.now()}`,
      name: newFolderName.trim(),
      color: newFolderColor,
      system: false
    };
    setFolders(prev => [...prev, newFolder]);
    onCreateFolder?.(newFolder);
    setShowCreate(false);
    setNewFolderName("");
    setNewFolderColor(folderColors[0]);
  }

  function handleRename() {
    if (!editName.trim() || !editingId) return;
    setFolders(prev => prev.map(f => 
      f.id === editingId ? { ...f, name: editName.trim() } : f
    ));
    onRenameFolder?.(editingId, editName.trim());
    setEditingId(null);
  }

  function handleDelete(id) {
    const folder = folders.find(f => f.id === id);
    if (!folder || folder.system) return;
    if (!window.confirm(`Delete folder "${folder.name}"? Threads will move to Unfiled.`)) return;
    
    // Move threads to unfiled
    try {
      const stored = localStorage.getItem("wormgpt_thread_folders");
      const mapping = stored ? JSON.parse(stored) : {};
      Object.keys(mapping).forEach(threadId => {
        if (mapping[threadId] === id) {
          mapping[threadId] = "unfiled";
        }
      });
      localStorage.setItem("wormgpt_thread_folders", JSON.stringify(mapping));
    } catch {}
    
    setFolders(prev => prev.filter(f => f.id !== id));
    onDeleteFolder?.(id);
    if (activeFolderId === id) onSelectFolder("all");
  }

  function handleMoveThread(threadId, folderId) {
    try {
      const stored = localStorage.getItem("wormgpt_thread_folders");
      const mapping = stored ? JSON.parse(stored) : {};
      mapping[threadId] = folderId;
      localStorage.setItem("wormgpt_thread_folders", JSON.stringify(mapping));
    } catch {}
    onMoveToFolder?.(threadId, folderId);
  }

  const nonSystemFolders = folders.filter(f => f.id !== "all");
  
  return (
    <div className="folder-manager">
      <div className="folder-manager__header">
        <span className="folder-manager__title">Folders</span>
        <button type="button" className="folder-manager__add" onClick={() => setShowCreate(true)}>
          + New
        </button>
      </div>

      {showCreate && (
        <div className="folder-manager__create">
          <input
            type="text"
            placeholder="Folder name"
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleCreate()}
            className="folder-manager__input"
            autoFocus
          />
          <div className="folder-manager__colors">
            {folderColors.map(color => (
              <button
                key={color}
                type="button"
                className={`folder-manager__color ${newFolderColor === color ? "is-selected" : ""}`}
                style={{ background: color }}
                onClick={() => setNewFolderColor(color)}
              />
            ))}
          </div>
          <div className="folder-manager__actions">
            <button type="button" className="ghost" onClick={() => setShowCreate(false)}>Cancel</button>
            <button type="button" onClick={handleCreate}>Create</button>
          </div>
        </div>
      )}

      <div className="folder-manager__list">
        {nonSystemFolders.map(folder => {
          const isActive = activeFolderId === folder.id;
          const count = getFolderCount(folder.id);
          const isEditing = editingId === folder.id;
          
          return (
            <div key={folder.id} className={`folder-manager__item ${isActive ? "is-active" : ""} ${isEditing ? "is-editing" : ""}`}>
              {isEditing ? (
                <div className="folder-manager__edit">
                  <input
                    type="text"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleRename()}
                    onBlur={handleRename}
                    className="folder-manager__edit-input"
                    autoFocus
                  />
                </div>
              ) : (
                <button
                  type="button"
                  className="folder-manager__button"
                  onClick={() => onSelectFolder(folder.id)}
                  onContextMenu={e => { e.preventDefault(); setEditingId(folder.id); setEditName(folder.name); }}
                >
                  <span className="folder-manager__color-dot" style={{ background: folder.color }} />
                  <span className="folder-manager__name">{folder.name}</span>
                  <span className="folder-manager__count">{count}</span>
                </button>
              )}
              {!folder.system && !isEditing && (
                <div className="folder-manager__item-actions">
                  <button type="button" className="ghost" onClick={() => { setEditingId(folder.id); setEditName(folder.name); }}>✎</button>
                  <button type="button" className="ghost is-danger" onClick={() => handleDelete(folder.id)}>✕</button>
                </div>
              )}
            </div>
          );
        })}
        
        <div className={`folder-manager__item ${activeFolderId === "unfiled" ? "is-active" : ""}`}>
          <button
            type="button"
            className="folder-manager__button"
            onClick={() => onSelectFolder("unfiled")}
          >
            <span className="folder-manager__color-dot" style={{ background: "#888" }} />
            <span className="folder-manager__name">Unfiled</span>
            <span className="folder-manager__count">{getFolderCount("unfiled")}</span>
          </button>
        </div>
      </div>

      <div className="folder-manager__move-hint">
        Drag threads to folders or right-click thread → Move to folder
      </div>
    </div>
  );
}