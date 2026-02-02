# AI Game Studio — Bootstrap Prompt

Copy everything below this line and paste it as your first message to a fresh Claude instance in a new empty repository.

---

## Project: AI Game Studio

Build an **AI Game Development Studio** — a Node.js application where multiple specialized AI agents collaborate to build games from a high-level text description. The user watches the process in real-time through a web dashboard. Think "AI Town" but for game development.

### What this project IS

- A multi-agent orchestration framework specifically for building games
- Language-agnostic: agents can build games in JavaScript, TypeScript, Python, or any language — the tech stack is defined per-project via config
- Observable: every agent action (file read, file write, LLM call, task transition) is streamed to a real-time web dashboard via WebSocket
- Template-based: new game projects start from scaffolds that define directory structure, starter files, module boundaries, and toolchain commands
- The output is an actual working game in a workspace directory

### What this project is NOT

- Not a game itself — it's a tool that builds games
- Not a chat interface — the user sets a goal and watches agents work
- Not tied to any specific game genre or programming language

---

### Architecture

```
Studio.create({ template, goal }) → wires everything → studio.start()
     │
     ├── EventBus          Pub/sub — every event flows through here
     ├── Timeline           Append-only log subscribed to EventBus
     ├── Workspace          Guarded filesystem (FileGuard enforces role permissions)
     ├── Toolchain          Runs project-level commands (build, test, lint)
     ├── AgentPool          Spawns and manages agents
     ├── Orchestrator       Tick loop: match idle agents → tasks, drive turns
     └── StudioServer       Express + WebSocket → streams events to web UI
```

### Agent System

Each agent has:
- **Role definition**: identity, domain expertise, approach guidelines, boundaries
- **File permissions**: `allowedPaths` and `forbiddenPaths` with glob patterns
- **LLM interaction**: system prompt built from role + project config, tool use for file operations
- **Task execution**: orchestrator assigns tasks, agent takes LLM turns until complete/blocked

Default crew (4 agents):

| Role | What they do | Can write | Cannot write |
|------|-------------|-----------|-------------|
| **Architect** | Plans features, decomposes into tasks, designs module boundaries | `docs/`, `design/`, `project.json`, `*.md` | Implementation code |
| **Programmer** | Implements game logic, state, core systems | Source files (`*.js`/`*.ts`/`*.py` per project) | Style files, tests, design docs |
| **Designer** | Game mechanics, content data, UI/UX, visual styling | Style files, `data/`, `assets/`, `content/` | Core logic, networking, AI, tests |
| **Tester** | Writes tests, finds bugs, validates features | `tests/`, `src/simulation/` | Game logic, UI, content |

**Key design decision**: Role path patterns use placeholders like `{sourceExt}`, `{styleExt}`, `{dataExt}` that are resolved at runtime from the project config. This is how the same role definitions work across JavaScript, TypeScript, Python, etc.

### File Permission System (FileGuard)

- Roles define `allowedPaths` and `forbiddenPaths` as glob patterns
- Patterns can contain `{sourceExt}`, `{styleExt}`, `{dataExt}` placeholders
- At runtime, FileGuard resolves these against the project config's extension arrays
- Example: `src/**/*{sourceExt}` with `sourceExtensions: ['.ts', '.tsx']` → `['src/**/*.ts', 'src/**/*.tsx']`
- Reading is permissive (only blocked by forbiddenPaths)
- Writing is strict (must match allowedPaths AND not match forbiddenPaths)

### Orchestrator

Tick-based loop (configurable interval, default 2s):
1. Find idle agents
2. Match them to pending tasks via `TaskQueue.nextFor(roleName)` — respects dependencies
3. Assign task, drive agent turns (LLM calls with tool use)
4. Handle results: completed → mark done, blocked → create help-request task for target role, error → mark failed
5. Enforce max turns per task to prevent infinite loops
6. When architect completes a `plan_feature` task, parse output for sub-tasks

Task states: `pending → assigned → active → completed|blocked|failed`
Blocked tasks can return to pending. Failed tasks can be retried.

### Project Config (the language-agnostic core)

Every project has a config that defines:

```javascript
{
  language: 'typescript',           // or 'javascript', 'python', etc.
  sourceExtensions: ['.ts', '.tsx'],
  styleExtensions: ['.css', '.html', '.svg'],
  dataExtensions: ['.json', '.yaml'],
  toolchain: {
    install: 'npm install',
    build: 'npm run build',
    test: 'npx vitest run',
    run: 'npx vite',
    lint: 'npx eslint src/',
    typecheck: 'npx tsc --noEmit',
  },
  modules: { ... }  // loaded from template
}
```

The Toolchain class wraps command execution with timeouts, output capture, and event emission. Agents do NOT run toolchain commands directly — only the Orchestrator does.

### Template System

Templates are directories containing a `scaffold.json` that defines:
- `project` — the project config (language, extensions, toolchain commands)
- `directories` — folders to create
- `modules` — logical modules with descriptions and role permissions
- `files` — starter files with `{{variable}}` interpolation

Include at least three templates:
1. **vanilla-js** — Browser game, ES6 modules, no build step, vitest for testing
2. **typescript** — Browser game, strict TS, Vite bundler, vitest
3. **python-pygame** — Desktop game, Pygame, pytest, mypy

### Event System

Every observable action becomes an immutable Event with: `{ id, type, agentId, taskId, data, timestamp }`

Event types organized by domain:
- `agent:spawned`, `agent:idle`, `agent:thinking`, `agent:error`
- `task:created`, `task:assigned`, `task:in_progress`, `task:completed`, `task:failed`, `task:blocked`
- `file:created`, `file:modified`, `file:deleted`, `file:read`, `file:access_denied`
- `message:sent`, `request:created`, `request:fulfilled`
- `llm:request`, `llm:response`, `llm:error`
- `build:started`, `build:succeeded`, `build:failed`
- `test:passed`, `test:failed`
- `studio:started`, `studio:goal_set`, `studio:paused`, `studio:stopped`

EventBus supports: `on(type, cb)`, `onAny(cb)`, `emit(event)`
Timeline supports: `all()`, `byType()`, `byAgent()`, `byTask()`, `between()`, `recent()`, `serialize()`, `replayInto()`

### Web Dashboard

Express server + WebSocket. On connect, send recent event history. Stream all new events.

UI layout (dark theme, monospace font):
- **Left panel**: Agent cards with status dots (idle=gray, thinking=yellow pulse, error=red)
- **Center top**: Kanban task board (Pending | Active | Done columns)
- **Center bottom**: Live event timeline feed (newest first, capped at 200)
- **Right panel**: File activity feed (color-coded: green=created, yellow=modified, red=denied)

### LLM Provider

Abstract `LLMProvider` base class with `chat({ system, messages, tools })` method.
`ClaudeProvider` implementation using `@anthropic-ai/sdk`.
Interface returns `{ content, stopReason, usage }`.

### Agent Tools

Each agent gets these LLM tools:
- `read_file(path)` — read file via Workspace (guarded)
- `write_file(path, content)` — write file via Workspace (guarded)
- `list_files(path)` — list directory contents
- `complete_task(summary)` — signal task completion
- `request_help(targetRole, request)` — ask another agent for help (creates a new high-priority task)

### Tech Stack for the Studio Itself

- Node.js, ES modules
- `@anthropic-ai/sdk` for Claude
- `express` for HTTP server
- `ws` for WebSocket
- No frontend framework — vanilla JS for the dashboard

### Directory Structure

```
ai-game-studio/
├── package.json
├── README.md
├── config/
│   └── studio.config.js        Default configuration
├── src/
│   ├── index.js                 Entry point, Studio class, CLI
│   ├── agents/
│   │   ├── Agent.js             LLM interaction, tool execution, system prompt builder
│   │   ├── AgentPool.js         Agent lifecycle, spawn, lookup
│   │   └── roles/
│   │       ├── index.js         Role registry
│   │       ├── architect.js
│   │       ├── programmer.js
│   │       ├── designer.js
│   │       └── tester.js
│   ├── orchestrator/
│   │   ├── Orchestrator.js      Tick loop, agent-task matching, turn execution
│   │   └── TaskQueue.js         Priority queue, dependency tracking, state machine
│   ├── workspace/
│   │   ├── Workspace.js         Guarded filesystem operations
│   │   ├── FileGuard.js         Role-based access control with placeholder resolution
│   │   ├── Toolchain.js         Build/test/lint command execution
│   │   └── ProjectTemplate.js   Template scaffolding with variable interpolation
│   ├── timeline/
│   │   ├── Event.js             Immutable events, EventType enum
│   │   ├── EventBus.js          Pub/sub
│   │   └── Timeline.js          Append-only log with filtering and replay
│   ├── llm/
│   │   ├── LLMProvider.js       Abstract interface
│   │   └── ClaudeProvider.js    Anthropic SDK wrapper
│   └── ui/
│       ├── server.js            Express + WebSocket
│       └── public/
│           ├── index.html
│           ├── studio.css
│           └── studio.js
└── templates/
    ├── vanilla-js/
    │   └── scaffold.json
    ├── typescript/
    │   └── scaffold.json
    └── python-pygame/
        └── scaffold.json
```

### CLI Usage

```bash
node src/index.js --goal "Build a card game about food chains" --template vanilla-js
node src/index.js --goal "Build a tower defense game" --template typescript
node src/index.js --goal "Build a roguelike dungeon crawler" --template python-pygame
```

### Programmatic Usage

```javascript
import { Studio } from './src/index.js';

const studio = await Studio.create({
  template: 'typescript',
  project: { name: 'food-chain-cards' },
  llm: { model: 'claude-sonnet-4-20250514' },
});

await studio.start('Build a card game where players build food chain ecosystems');
```

### Key Invariants

1. Agents NEVER bypass FileGuard — all file I/O goes through Workspace
2. Agents NEVER run shell commands — only the Orchestrator uses Toolchain
3. Every action is an Event on the EventBus — nothing happens silently
4. Role definitions are language-agnostic — placeholders resolved at runtime
5. The same role definitions work for JS, TS, Python, or any future language
6. Templates define the full project config including toolchain commands
7. The Orchestrator is the single authority — agents propose, orchestrator decides

### Design Principles (learned from building a card game with this role system)

- **Strict module boundaries prevent agents from stepping on each other.** This is the single most important design decision. Without file guards, agents will rewrite each other's code.
- **Central action dispatch.** All work flows through the Orchestrator, just like a game's ActionBus. This makes the system observable and debuggable.
- **Data-driven roles.** Role definitions are plain objects, not classes. This makes them easy to add, modify, and serialize.
- **Blackboard communication.** Agents communicate through the shared workspace (files they write), not through direct messages. Cross-domain requests go through the Orchestrator as tasks.
- **Observable everything.** The Timeline is an append-only log of every event. This enables replay, debugging, and the real-time UI.

---

Build this project. Create all files, make sure they're internally consistent, and verify the structure is complete. The goal is a working skeleton that can be run with `node src/index.js --goal "..." --template vanilla-js` (it will need an ANTHROPIC_API_KEY env var to actually call Claude, but the structure and wiring should all work).
