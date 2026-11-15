import { useEffect } from "react";

export const KEYBOARD_SHORTCUTS = [
  { keys: ["Ctrl", "N"], description: "New chat", action: "newChat" },
  { keys: ["Ctrl", "Shift", "N"], description: "New chat (alternative)", action: "newChat" },
  { keys: ["Ctrl", "Enter"], description: "Send message", action: "send" },
  { keys: ["Escape"], description: "Stop generation / Close dialogs", action: "stop" },
  { keys: ["Ctrl", "K"], description: "Focus search", action: "search" },
  { keys: ["Ctrl", "/"], description: "Focus search (alternative)", action: "search" },
  { keys: ["Ctrl", "Shift", "P"], description: "Open prompt templates", action: "templates" },
  { keys: ["Ctrl", "M"], description: "Toggle model selector", action: "modelSelector" },
  { keys: ["Ctrl", "Shift", "S"], description: "Toggle settings", action: "settings" },
  { keys: ["Ctrl", "Shift", "A"], description: "Toggle agent panel", action: "agent" },
  { keys: ["Ctrl", "Shift", "K"], description: "Toggle skill library", action: "skills" },
  { keys: ["Ctrl", "Shift", "E"], description: "Export current chat", action: "export" },
  { keys: ["Ctrl", "Delete"], description: "Clear all conversations", action: "clear" },
  { keys: ["Ctrl", "Shift", "C"], description: "Copy last response", action: "copyLast" },
  { keys: ["Ctrl", "Shift", "V"], description: "Paste image", action: "pasteImage" },
  { keys: ["F1"], description: "Show keyboard shortcuts", action: "help" },
];

export function useKeyboardShortcuts(handlers) {
  useEffect(() => {
    function handleKeyDown(event) {
      // Don't trigger shortcuts when typing in input fields
      const target = event.target;
      const isInput = target.tagName === "INPUT" || 
                      target.tagName === "TEXTAREA" || 
                      target.isContentEditable ||
                      target.closest("input, textarea, [contenteditable]");
      
      if (isInput && !event.metaKey && !event.ctrlKey) {
        return;
      }

      const pressed = [];
      if (event.ctrlKey || event.metaKey) pressed.push("Ctrl");
      if (event.shiftKey) pressed.push("Shift");
      if (event.altKey) pressed.push("Alt");
      if (event.key !== "Control" && event.key !== "Shift" && event.key !== "Alt" && event.key !== "Meta") {
        pressed.push(event.key.length === 1 ? event.key.toUpperCase() : event.key);
      }

      const shortcut = KEYBOARD_SHORTCUTS.find(s => 
        s.keys.length === pressed.length &&
        s.keys.every(k => pressed.includes(k))
      );

      if (shortcut && handlers[shortcut.action]) {
        event.preventDefault();
        handlers[shortcut.action](event);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handlers]);
}

export function formatShortcut(keys) {
  return keys.map(k => k === "Ctrl" ? (navigator.platform.includes("Mac") ? "⌘" : "Ctrl") : k).join(" + ");
}