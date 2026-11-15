import { KEYBOARD_SHORTCUTS, formatShortcut } from "../hooks/useKeyboardShortcuts.js";

export default function KeyboardShortcutsHelp({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="shortcuts-modal" onClick={onClose}>
      <div className="shortcuts-modal__content" onClick={e => e.stopPropagation()}>
        <div className="shortcuts-modal__header">
          <h2>Keyboard Shortcuts</h2>
          <button type="button" className="shortcuts-modal__close" onClick={onClose}>✕</button>
        </div>
        <div className="shortcuts-modal__body">
          <div className="shortcuts-modal__category">
            <h3>Chat</h3>
            <ul>
              {KEYBOARD_SHORTCUTS.filter(s => ["newChat", "send", "stop", "copyLast"].includes(s.action)).map(s => (
                <li key={s.action}>
                  <kbd>{formatShortcut(s.keys)}</kbd>
                  <span>{s.description}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="shortcuts-modal__category">
            <h3>Navigation</h3>
            <ul>
              {KEYBOARD_SHORTCUTS.filter(s => ["search", "modelSelector", "export", "clear", "pasteImage"].includes(s.action)).map(s => (
                <li key={s.action}>
                  <kbd>{formatShortcut(s.keys)}</kbd>
                  <span>{s.description}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="shortcuts-modal__category">
            <h3>Panels</h3>
            <ul>
              {KEYBOARD_SHORTCUTS.filter(s => ["templates", "settings", "agent", "skills"].includes(s.action)).map(s => (
                <li key={s.action}>
                  <kbd>{formatShortcut(s.keys)}</kbd>
                  <span>{s.description}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="shortcuts-modal__category">
            <h3>Help</h3>
            <ul>
              {KEYBOARD_SHORTCUTS.filter(s => s.action === "help").map(s => (
                <li key={s.action}>
                  <kbd>{formatShortcut(s.keys)}</kbd>
                  <span>{s.description}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}