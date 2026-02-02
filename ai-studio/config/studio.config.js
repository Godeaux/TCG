/**
 * Studio configuration.
 * Override by passing a config object to Studio.create().
 */
export const defaultConfig = {
  /** LLM provider settings */
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

  /**
   * Project definition — describes the tech stack, conventions,
   * and toolchain for the game being built.
   * This is the core abstraction that makes the studio language-agnostic.
   *
   * Can also be loaded from a template's project.json.
   */
  project: {
    /** Human-readable project name */
    name: 'my-game',

    /** Language/runtime: 'javascript', 'typescript', 'python', 'rust', 'godot', etc. */
    language: 'javascript',

    /** File extensions this project uses */
    sourceExtensions: ['.js', '.mjs'],

    /** Style/markup extensions (for designer role) */
    styleExtensions: ['.css', '.html', '.svg'],

    /** Data extensions (for designer/content role) */
    dataExtensions: ['.json', '.yaml', '.toml'],

    /**
     * Toolchain commands — shell commands the studio runs.
     * Each is optional; if absent the studio skips that step.
     * Agents do NOT run these directly — the Orchestrator does.
     */
    toolchain: {
      /** Install dependencies */
      install: null,       // e.g. 'npm install', 'pip install -r requirements.txt'
      /** Build the project */
      build: null,         // e.g. 'npm run build', 'tsc', 'cargo build'
      /** Run tests */
      test: null,          // e.g. 'npm test', 'pytest', 'cargo test'
      /** Run/preview the game */
      run: null,           // e.g. 'npx serve .', 'python main.py'
      /** Lint/format */
      lint: null,          // e.g. 'npx eslint src/', 'ruff check .'
      /** Type check (if separate from build) */
      typecheck: null,     // e.g. 'tsc --noEmit', 'mypy src/'
    },

    /**
     * Module map — defines the logical modules in this project
     * and which roles can write to them. Loaded from template
     * or defined manually.
     */
    modules: {},
  },
};
