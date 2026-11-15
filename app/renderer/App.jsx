import { useEffect, useRef, useState } from "react";
import TitleBar from "./components/TitleBar.jsx";
import Sidebar from "./components/Sidebar.jsx";
import Chat from "./components/Chat.jsx";
import ModelSelector from "./components/ModelSelector.jsx";
import KeyboardShortcutsHelp from "./components/KeyboardShortcutsHelp.jsx";
import { useKeyboardShortcuts, KEYBOARD_SHORTCUTS } from "./hooks/useKeyboardShortcuts.js";
import system from "../../core/prompts.js";
import { isValidTheme, themeRgb, DEFAULT_FONT_SIZE } from "./theme.js";

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function ensureMessages(messages, prompt = system.content) {
  const list = Array.isArray(messages) ? messages : [];
  const rest = list.filter(item => item && item.role !== "system");
  return [{ role: "system", content: prompt }, ...rest];
}

function createThread(number, prompt = system.content) {
  return {
    id: createId(),
    title: `Chat ${number}`,
    messages: [{ role: "system", content: prompt }]
  };
}

function normalizeThreads(raw) {
  if (!Array.isArray(raw)) return null;
  if (raw.length === 0) return [];
  return raw.map((thread, index) => {
    const safe = thread && typeof thread === "object" ? thread : {};
    const title =
      typeof safe.title === "string" && safe.title.trim()
        ? safe.title
        : `Chat ${index + 1}`;
    return {
      id: typeof safe.id === "string" ? safe.id : createId(),
      title,
      messages: ensureMessages(safe.messages)
    };
  });
}

function getNextChatNumber(threads) {
  let max = 0;
  threads.forEach(thread => {
    const match = /^Chat\s+(\d+)/i.exec(thread.title);
    if (match) {
      const value = Number(match[1]);
      if (!Number.isNaN(value)) {
        max = Math.max(max, value);
      }
    }
  });
  return max ? max + 1 : threads.length + 1;
}

function isAutoTitle(title) {
  return /^chat\s+\d+$/i.test(String(title || "").trim());
}

function suggestTitle(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (clean.length <= 46) return clean;
  return `${clean.slice(0, 46).trimEnd()}...`;
}

function isAbortError(err) {
  return err && (err.name === "AbortError" || err.code === "ERR_ABORTED");
}

const initialThreads = [createThread(1), createThread(2)];

export default function App() {
  const [threads, setThreads] = useState(initialThreads);
  const [activeId, setActiveId] = useState(initialThreads[0].id);
  const [nextChatNumber, setNextChatNumber] = useState(3);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [keyStatus, setKeyStatus] = useState("unknown");
  const [hasLoaded, setHasLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [systemPrompt, setSystemPrompt] = useState(system.content);
  const [modelLabel, setModelLabel] = useState("");
  const [accent, setAccent] = useState("crimson");
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const [skillsEnabled, setSkillsEnabled] = useState([]);
  const [autoSkills, setAutoSkills] = useState(true);
  const [activeProviderId, setActiveProviderId] = useState("");
  const [activeModel, setActiveModel] = useState("");
  const [lastUsage, setLastUsage] = useState(null);
  const [totalTokens, setTotalTokens] = useState({ prompt: 0, completion: 0, total: 0 });
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  const stopRef = useRef(null);
  const saveTimerRef = useRef(null);
  const latestRef = useRef({});
  const prevSendingRef = useRef(false);
  const skillCatalogRef = useRef(null);
  const skillContentCacheRef = useRef(new Map());

  const MAX_SKILL_CHARS = 8000;
  const MAX_CONTEXT_CHARS = 40000;

  const activeThread = threads.find(thread => thread.id === activeId) || threads[0];
  const visibleMessages = activeThread
    ? activeThread.messages.filter(m => m.role !== "system")
    : [];

  async function refreshProviderInfo() {
    if (!window.wormgpt) return;
    try {
      const info = await window.wormgpt.loadProvider();
      if (info && typeof info.model === "string" && info.model.trim()) {
        setModelLabel(info.model.trim());
      } else {
        setModelLabel("");
      }
    } catch (err) {
      setModelLabel("");
    }
    if (window.wormgpt.keyStatus) {
      try {
        const hasKey = await window.wormgpt.keyStatus();
        setKeyStatus(hasKey ? "saved" : "missing");
      } catch (err) {
        setKeyStatus("missing");
      }
    }
  }

  async function handleProviderChange(providerId, model) {
    setActiveProviderId(providerId);
    setActiveModel(model);
    if (window.wormgpt?.saveProvider) {
      try {
        await window.wormgpt.saveProvider({ 
          baseUrl: "", // Will be resolved by provider ID
          model: model,
          providerId: providerId
        });
        refreshProviderInfo();
      } catch (err) {
        console.error("Failed to save provider:", err);
      }
    }
  }

  async function handleModelChange(providerId, model) {
    setActiveModel(model);
    if (window.wormgpt?.saveProvider) {
      try {
        await window.wormgpt.saveProvider({ 
          model: model,
          providerId: providerId
        });
        refreshProviderInfo();
      } catch (err) {
        console.error("Failed to save model:", err);
      }
    }
  }

  async function refreshProviders() {
    refreshProviderInfo();
  }

  useEffect(() => {
    refreshProviderInfo();
    if (window.wormgpt?.loadUi) {
      window.wormgpt.loadUi().then(ui => {
        if (ui && typeof ui === "object") {
          if (isValidTheme(ui.accent)) setAccent(ui.accent);
          if (Number.isFinite(ui.fontSize) && ui.fontSize > 0) setFontSize(ui.fontSize);
          if (Array.isArray(ui.enabledSkills)) setSkillsEnabled(ui.enabledSkills);
          if (typeof ui.autoSkills === "boolean") setAutoSkills(ui.autoSkills);
        }
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--accent-rgb", themeRgb(accent));
    document.documentElement.style.setProperty("--font-scale", String(fontSize));
  }, [accent, fontSize]);

  useEffect(() => {
    if (!hasLoaded || !window.wormgpt?.saveUi) return;
    window.wormgpt.saveUi({ accent, fontSize, enabledSkills: skillsEnabled, autoSkills }).catch(() => {});
  }, [accent, fontSize, hasLoaded, skillsEnabled, autoSkills]);

  useEffect(() => {
    let cancelled = false;

    async function loadChats() {
      if (!window.wormgpt || !window.wormgpt.loadChats) {
        setHasLoaded(true);
        return;
      }
      try {
        const stored = await window.wormgpt.loadChats();
        if (cancelled) return;
        if (stored && stored.threads !== undefined) {
            const normalized = normalizeThreads(stored.threads);
            if (typeof stored.prompt === "string" && stored.prompt.trim()) {
              setSystemPrompt(stored.prompt);
            }
          if (normalized !== null) {
            setThreads(normalized);
            const nextNumber =
              typeof stored.nextChatNumber === "number" && stored.nextChatNumber > 0
                ? stored.nextChatNumber
                : getNextChatNumber(normalized);
            setNextChatNumber(nextNumber);
            const active =
              normalized.find(thread => thread.id === stored.activeId)?.id ||
              (normalized[0] ? normalized[0].id : null);
            setActiveId(active);
          }
        }
      } catch (err) {
        // Ignore load failures and keep defaults.
      } finally {
        if (!cancelled) {
          setHasLoaded(true);
        }
      }
    }

    loadChats();
    return () => {
      cancelled = true;
    };
  }, []);

  latestRef.current = { threads, activeId, nextChatNumber, systemPrompt };

  useEffect(() => {
    if (!hasLoaded || !window.wormgpt || !window.wormgpt.saveChats) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const data = latestRef.current;
      window.wormgpt.saveChats({
        threads: data.threads,
        activeId: data.activeId,
        nextChatNumber: data.nextChatNumber,
        prompt: data.systemPrompt
      });
    }, 700);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [threads, activeId, nextChatNumber, systemPrompt, hasLoaded]);

  useEffect(() => {
    if (!hasLoaded || !window.wormgpt?.saveChats) return;
    if (prevSendingRef.current && !isSending) {
      const data = latestRef.current;
      window.wormgpt.saveChats({
        threads: data.threads,
        activeId: data.activeId,
        nextChatNumber: data.nextChatNumber,
        prompt: data.systemPrompt
      });
    }
    prevSendingRef.current = isSending;
  }, [isSending, hasLoaded]);

  function handleNew() {
    const next = createThread(nextChatNumber, systemPrompt);
    setThreads(prev => [next, ...prev]);
    setActiveId(next.id);
    setNextChatNumber(prev => prev + 1);
    setError("");
  }

  function handleClear() {
    if (threads.length > 0 && !window.confirm("Delete ALL conversations? This cannot be undone.")) {
      return;
    }
    setThreads([]);
    setActiveId(null);
    setNextChatNumber(1);
    setError("");
  }

  function handleSelect(id) {
    setActiveId(id);
    setError("");
  }

  function handleRename(id) {
    const thread = threads.find(item => item.id === id);
    const title = window.prompt("Rename conversation", thread?.title || "Conversation");
    if (!title || !title.trim()) return;
    setThreads(prev => prev.map(item => item.id === id ? { ...item, title: title.trim() } : item));
  }

  function handleDuplicate(id) {
    const source = threads.find(item => item.id === id);
    if (!source) return;
    const copy = {
      ...source,
      id: createId(),
      title: `Copy of ${source.title}`,
      messages: source.messages.map(item => ({ ...item }))
    };
    const next = [];
    threads.forEach(item => {
      next.push(item);
      if (item.id === id) next.push(copy);
    });
    setThreads(next);
    setActiveId(copy.id);
    setError("");
  }

  function handleDelete(id) {
    const remaining = threads.filter(item => item.id !== id);
    setThreads(remaining);
    if (activeId === id) {
      setActiveId(remaining[0]?.id || null);
    }
    setError("");
  }

  function handleExport() {
    if (!activeThread) return;
    const blob = new Blob([JSON.stringify({ threads: [activeThread] }, null, 2)], {
      type: "application/json;charset=utf-8"
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${activeThread.title.replace(/[^a-z0-9_-]+/gi, "-") || "conversation"}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function handleImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(String(reader.result || ""));
        const normalized = normalizeThreads(imported.threads || imported);
        if (!normalized) throw new Error("Invalid chat file");
        setThreads(normalized);
        setActiveId(normalized[0]?.id || null);
        setNextChatNumber(getNextChatNumber(normalized));
        setError("");
      } catch (err) {
        setError("Could not import that chat file.");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }

  // Keyboard shortcuts
  useKeyboardShortcuts({
    newChat: () => handleNew(),
    send: () => {
      // Handled by Input component
    },
    stop: () => stopGeneration(),
    search: () => {
      const searchInput = document.querySelector(".sidebar__search");
      if (searchInput) searchInput.focus();
    },
    templates: () => {
      // This would need a ref to the sidebar to toggle templates
      // For now, we'll just show a toast or similar
    },
    modelSelector: () => {
      const selector = document.querySelector(".model-selector__trigger");
      if (selector) selector.focus();
    },
    settings: () => setShowSettings(prev => !prev),
    agent: () => {
      // Toggle agent panel
    },
    skills: () => {
      // Toggle skills panel
    },
    export: () => handleExport(),
    clear: () => handleClear(),
    copyLast: () => {
      const lastAssistant = [...threads].reverse().find(t => 
        t.messages.some(m => m.role === "assistant")
      );
      if (lastAssistant) {
        const lastMsg = [...lastAssistant.messages].reverse().find(m => m.role === "assistant");
        if (lastMsg && window.wormgpt?.copyText) {
          window.wormgpt.copyText(lastMsg.content);
        }
      }
    },
    pasteImage: () => {
      // Handled by browser paste event
    },
    help: () => setShowShortcutsHelp(true)
  });

  async function ensureSkillCatalog() {
    if (skillCatalogRef.current) return skillCatalogRef.current;
    const list = await window.wormgpt.listSkills();
    const map = new Map((Array.isArray(list) ? list : []).map(skill => [skill.id, skill]));
    skillCatalogRef.current = map;
    return map;
  }

  async function fetchSkillContent(id) {
    const cache = skillContentCacheRef.current;
    if (cache.has(id)) return cache.get(id);
    const skill = await window.wormgpt.getSkill(id);
    const content = typeof skill?.content === "string" ? skill.content.slice(0, MAX_SKILL_CHARS) : "";
    cache.set(id, content);
    return content;
  }

  async function buildSkillContext(baseMessages, userText) {
    let catalog;
    try {
      catalog = await ensureSkillCatalog();
    } catch (err) {
      catalog = null;
    }
    if (!catalog || catalog.size === 0) return baseMessages;

    const mentioned = [];
    const seen = new Set();
    const pattern = /@([A-Za-z0-9][A-Za-z0-9._-]{0,79})/g;
    let match;
    while ((match = pattern.exec(userText || ""))) {
      const id = match[1];
      if (!seen.has(id) && catalog.has(id)) {
        seen.add(id);
        mentioned.push(id);
      }
    }

    const pinned = [];
    if (autoSkills) {
      for (const id of skillsEnabled) {
        if (!seen.has(id)) {
          seen.add(id);
          pinned.push(id);
        }
      }
    }

    if (mentioned.length === 0 && pinned.length === 0) return baseMessages;

    const order = [...mentioned, ...pinned.slice(0, 4)];
    const contents = await Promise.all(
      order.map(id => fetchSkillContent(id).catch(() => ""))
    );

    const lines = [
      "SKILL LIBRARY (Agentic Awesome Skills): the user activated these skill(s) for the current request. Follow each skill's instructions and playbooks when answering; ignore sections that are not relevant."
    ];
    for (let i = 0; i < order.length; i += 1) {
      const text = contents[i] || "";
      if (!text) continue;
      const section = `\n=== Skill: ${order[i]} ===\n${text}`;
      if (lines.join("\n").length + section.length > MAX_CONTEXT_CHARS) break;
      lines.push(section);
    }

    const block = lines.join("\n");
    const result = [
      { role: "system", content: baseMessages[0]?.content || systemPrompt }
    ];
    result.push({ role: "system", content: block });
    result.push(...baseMessages.slice(1));
    return result;
  }

  async function generate(threadId, baseMessages, userText) {
    const stopFlag = { value: false };
    stopRef.current = stopFlag;
    setIsSending(true);
    setError("");

    let apiMessages = baseMessages;
    try {
      apiMessages = await buildSkillContext(baseMessages, userText);
    } catch (err) {
      // Skill context failures should never block chatting.
    }

    try {
      let streamedReply = "";
      let lastMeta = null;
      const unsubscribeChunk = window.wormgpt.onChatChunk
        ? window.wormgpt.onChatChunk(chunk => {
            streamedReply += chunk;
            setThreads(prev => prev.map(current => current.id === threadId
              ? { ...current, messages: [...apiMessages, { role: "assistant", content: streamedReply }] }
              : current));
          })
        : null;
      const unsubscribeMeta = window.wormgpt.onChatMeta
        ? window.wormgpt.onChatMeta(meta => {
            if (meta) lastMeta = meta;
          })
        : null;
      let reply;
      try {
        reply = window.wormgpt.streamChat
          ? await window.wormgpt.streamChat(apiMessages)
          : await window.wormgpt.chat(apiMessages);
      } finally {
        if (unsubscribeChunk) unsubscribeChunk();
        if (unsubscribeMeta) unsubscribeMeta();
      }
      
      // Track token usage
      const usage = reply?.usage || lastMeta;
      if (usage) {
        setLastUsage(usage);
        setTotalTokens(prev => ({
          prompt: prev.prompt + (usage.promptTokens || 0),
          completion: prev.completion + (usage.completionTokens || 0),
          total: prev.total + (usage.totalTokens || 0)
        }));
      }
      
      setThreads(prev =>
        prev.map(thread =>
          thread.id === threadId
            ? {
                ...thread,
                messages: [
                  ...apiMessages,
                  { role: "assistant", content: reply || streamedReply, timestamp: new Date().toISOString() }
                ]
              }
            : thread
        )
      );
    } catch (err) {
      if (!stopFlag.value && !isAbortError(err)) {
        setError(err && err.message ? err.message : "Request failed");
      }
    } finally {
      setIsSending(false);
    }
  }

  function send(text, image = null) {
    if (isSending) return;
    const trimmed = text ? text.trim() : "";
    if (!trimmed && !image) return;

    let content = trimmed;
    if (image) {
      content = trimmed 
        ? `${trimmed}\n\n[Image: ${image.name} (${image.type}, ${Math.round(image.size / 1024)}KB)]`
        : `[Image: ${image.name} (${image.type}, ${Math.round(image.size / 1024)}KB)]`;
    }

    const userMessage = {
      role: "user",
      content,
      timestamp: new Date().toISOString()
    };

    let thread = activeThread;
    let threadId;
    let apiMessages;

    if (!thread) {
      const created = createThread(nextChatNumber, systemPrompt);
      threadId = created.id;
      apiMessages = [
        { role: "system", content: systemPrompt },
        userMessage
      ];
      setThreads(prev => [{ ...created, messages: apiMessages }, ...prev]);
      setActiveId(created.id);
      setNextChatNumber(prev => prev + 1);
      setError("");
    } else {
      threadId = thread.id;
      apiMessages = [
        { role: "system", content: systemPrompt },
        ...thread.messages.filter(message => message.role !== "system"),
        userMessage
      ];
      setThreads(prev => prev.map(current => current.id === threadId ? { ...current, messages: apiMessages } : current));
      if (isAutoTitle(thread.title)) {
        const title = suggestTitle(trimmed || `Image: ${image?.name}`);
        setThreads(prev => prev.map(current => current.id === threadId ? { ...current, title } : current));
      }
    }

    generate(threadId, apiMessages, trimmed || `Analyze this image: ${image?.name}`);
  }

  function regenerate(id) {
    if (isSending) return;
    const thread = threads.find(item => item.id === id);
    if (!thread) return;
    const nonSystem = thread.messages.filter(item => item.role !== "system");
    let lastUserIndex = -1;
    for (let i = nonSystem.length - 1; i >= 0; i -= 1) {
      if (nonSystem[i].role === "user") {
        lastUserIndex = i;
        break;
      }
    }
    if (lastUserIndex === -1) return;
    const history = nonSystem.slice(0, lastUserIndex + 1);
    const lastUserText = history[history.length - 1]?.content || "";
    const apiMessages = [{ role: "system", content: systemPrompt }, ...history];
    setThreads(prev => prev.map(current => current.id === id ? { ...current, messages: apiMessages } : current));
    generate(id, apiMessages, lastUserText);
  }

  function stopGeneration() {
    if (stopRef.current) stopRef.current.value = true;
    if (window.wormgpt?.stopChat) window.wormgpt.stopChat();
  }

  function handleEditMessage(threadId, messageIndex, newContent) {
    setThreads(prev => prev.map(thread => {
      if (thread.id !== threadId) return thread;
      const messages = [...thread.messages];
      if (messageIndex < 0 || messageIndex >= messages.length) return thread;
      if (newContent === null) {
        // Cancel edit - no change needed, just exit edit mode
        return thread;
      }
      messages[messageIndex] = { ...messages[messageIndex], content: newContent };
      return { ...thread, messages };
    }));
  }

  function handleBranchMessage(threadId, messageIndex) {
    const thread = threads.find(t => t.id === threadId);
    if (!thread) return;
    const messages = thread.messages.filter(m => m.role !== "system");
    if (messageIndex < 0 || messageIndex >= messages.length) return;
    
    // Create new thread with messages up to and including the selected message
    const branchedMessages = [
      { role: "system", content: systemPrompt },
      ...messages.slice(0, messageIndex + 1)
    ];
    
    const newThread = {
      id: createId(),
      title: `Branch of ${thread.title}`,
      messages: branchedMessages
    };
    
    setThreads(prev => [newThread, ...prev]);
    setActiveId(newThread.id);
    setNextChatNumber(prev => prev + 1);
    
    // If the branched message is a user message, continue the conversation
    const branchedMessage = messages[messageIndex];
    if (branchedMessage.role === "user") {
      // The next AI response will be generated when user sends a message
    }
  }

  return (
    <div className="shell">
      <TitleBar />
      <div className="app">
        <Sidebar
          threads={threads}
          activeId={activeId}
          onSelect={handleSelect}
          onNew={handleNew}
          onClear={handleClear}
          search={search}
          onSearch={setSearch}
          onRename={handleRename}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
          onExport={handleExport}
          onImport={handleImport}
          showSettings={showSettings}
          onToggleSettings={() => setShowSettings(show => !show)}
          keyStatus={keyStatus}
          onKeySaved={refreshProviderInfo}
          systemPrompt={systemPrompt}
          onSystemPromptChange={setSystemPrompt}
          accent={accent}
          onAccentChange={setAccent}
          fontSize={fontSize}
          onFontSizeChange={setFontSize}
          skillsEnabled={skillsEnabled}
          onToggleSkill={(id, enabled) =>
            setSkillsEnabled(prev =>
              enabled ? [...new Set([...prev, id])] : prev.filter(item => item !== id)
            )
          }
          autoSkills={autoSkills}
          onToggleAutoSkills={setAutoSkills}
        />
        <Chat
          messages={visibleMessages}
          onSend={send}
          onStop={stopGeneration}
          onRegenerate={() => regenerate(activeThread ? activeThread.id : null)}
          isSending={isSending}
          error={error}
          title={activeThread ? activeThread.title : ""}
          count={visibleMessages.length}
          model={modelLabel}
          skills={skillsEnabled.length}
          activeProviderId={activeProviderId}
          activeModel={activeModel}
          onProviderChange={handleProviderChange}
          onModelChange={handleModelChange}
          onRefreshProviders={refreshProviders}
          onEditMessage={handleEditMessage}
          onBranchMessage={handleBranchMessage}
          activeThreadId={activeThread ? activeThread.id : null}
          lastUsage={lastUsage}
          totalTokens={totalTokens}
        />
        <KeyboardShortcutsHelp isOpen={showShortcutsHelp} onClose={() => setShowShortcutsHelp(false)} />
      </div>
    </div>
  );
}