/**
 * QA Harness Configuration
 */
export default {
  // Game URL — serve the project with any static server
  gameUrl: 'http://localhost:8080',

  // Two test accounts for multiplayer
  accounts: {
    player1: { username: 'qa-tester-1', pin: '1234' },
    player2: { username: 'qa-tester-2', pin: '1234' },
  },

  // LLM endpoint (OpenAI-compatible API)
  // Phase A: Opus for validation
  llm: {
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-opus-4-6',
    apiKey: process.env.ANTHROPIC_API_KEY || '',
  },

  // Phase B: Local Qwen for 24/7 (uncomment to switch)
  // llm: {
  //   baseUrl: 'http://localhost:11434/v1',
  //   model: 'qwen3.5-tuned',
  //   apiKey: 'ollama',
  // },

  // How many games to run (null = infinite)
  gameLimit: null,

  // Delay between actions (ms) — give animations time to settle
  actionDelay: 1500,

  // Delay between games (ms)
  gameDelay: 3000,

  // Bug report deduplication — skip filing if same fingerprint exists
  deduplicateBugs: true,

  // Browser settings
  browser: {
    headless: false, // set true for 24/7 unattended
    slowMo: 0,
  },
};
