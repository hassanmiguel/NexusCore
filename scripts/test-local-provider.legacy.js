const { streamRequest } = require('./core/groq');

(async () => {
  try {
    await streamRequest(
      { baseUrl: 'http://localhost:11434/v1', model: 'llama3.2' },
      [{ role: 'user', content: 'hello' }],
      () => {}
    );
    console.log('unexpected success');
    process.exit(1);
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    console.log(msg);
    if (msg.includes('Ollama is not running')) {
      process.exit(0);
    }
    process.exit(1);
  }
})();
