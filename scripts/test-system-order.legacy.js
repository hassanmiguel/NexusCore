const assert = require('node:assert/strict');
const { trim, ensureSystemFirst } = require('./core/trim');

const ordered = ensureSystemFirst([
  { role: 'user', content: 'hi' },
  { role: 'system', content: 'You are helpful.' },
  { role: 'assistant', content: 'hello' }
]);
assert.deepStrictEqual(ordered[0], { role: 'system', content: 'You are helpful.' });

const trimmed = trim([
  { role: 'user', content: 'one' },
  { role: 'system', content: 'Use concise language.' },
  { role: 'user', content: 'two' },
  { role: 'assistant', content: 'reply' }
], 3);
assert.strictEqual(trimmed[0].role, 'system');
assert.strictEqual(trimmed.length >= 2, true);

console.log('system ordering regression checks passed');
