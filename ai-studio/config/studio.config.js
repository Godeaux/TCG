/**
 * Studio configuration.
 * Override by passing a config object to Studio.create().
 */
export const defaultConfig = {
  /** LLM provider to use */
  llm: {
    provider: 'claude',
    model: 'claude-sonnet-4-20250514',
    maxConcurrentCalls: 3,
  },

  /** How many agents can work simultaneously */
  maxConcurrentAgents: 3,

  /** Tick interval in ms — how often the orchestrator checks for work */
  tickInterval: 2000,

  /** Workspace root (relative to where studio is invoked) */
  workspaceDir: './workspace',

  /** Web UI settings */
  ui: {
    enabled: true,
    port: 3000,
  },

  /** Maximum turns an agent gets per task before forced handoff */
  maxTurnsPerTask: 20,

  /** Whether to log full LLM request/response (expensive in storage) */
  verboseLLMLogging: false,
};
