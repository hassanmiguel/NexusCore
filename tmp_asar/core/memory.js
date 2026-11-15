const sqlite3 = require('sqlite3').verbose();
const { app } = require("electron");
const path = require("path");

const dbPath = app && app.getPath ? path.join(app.getPath("userData"), "wormgpt-history.db") : path.join(process.cwd(), "wormgpt-history.db");
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT,
    role TEXT,
    content TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(conversation_id) REFERENCES conversations(id)
  )`);
});

exports.saveMessage = (conversationId, role, content) => {
  return new Promise((resolve, reject) => {
    db.run(`INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)`, 
      [conversationId, role, content], 
      function(err) {
        if (err) reject(err); else resolve(this.lastID);
      }
    );
  });
};

exports.getConversation = (conversationId) => {
  return new Promise((resolve, reject) => {
    db.all(`SELECT role, content, timestamp FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC`, 
      [conversationId], 
      (err, rows) => {
        if (err) reject(err); else resolve(rows);
      }
    );
  });
};

exports.createConversation = (id, title) => {
  return new Promise((resolve, reject) => {
    db.run(`INSERT OR IGNORE INTO conversations (id, title) VALUES (?, ?)`, 
      [id, title], 
      function(err) {
        if (err) reject(err); else resolve();
      }
    );
  });
};

exports.listConversations = () => {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM conversations ORDER BY created_at DESC`, [], (err, rows) => {
      if (err) reject(err); else resolve(rows);
    });
  });
};

module.exports = {
  saveMessage,
  getConversation,
  createConversation,
  listConversations
};
