# AI Game Studio

Multi-agent AI game development studio. Watch specialized AI agents collaborate to build games in real-time.

## Concept

A simulation where multiple AI agents — each with a distinct role (Architect, Programmer, Designer, Tester) — work together on a shared codebase to build a game from a high-level goal. You observe their work through a real-time web dashboard showing agent status, task progress, file changes, and a full event timeline.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Orchestrator                     │
│  Task queue · Dependency graph · Agent assignment │
└──────────┬──────────────┬──────────────┬─────────┘
           │              │              │
    ┌──────▼──────┐ ┌─────▼─────┐ ┌─────▼─────┐
    │  Architect  │ │Programmer │ │  Designer  │  ...
    │  (planner)  │ │  (coder)  │ │ (content)  │
    └──────┬──────┘ └─────┬─────┘ └─────┬─────┘
           │              │              │
    ┌──────▼──────────────▼──────────────▼─────────┐
    │              Workspace (FileGuard)             │
    │  Role-based access control · Path traversal    │
    │  prevention · Shared filesystem                │
    └──────────────────┬───────────────────────────┘
                       │
    ┌──────────────────▼───────────────────────────┐
    │           EventBus → Timeline                  │
    │  Every action logged · WebSocket to UI         │
    └──────────────────┬───────────────────────────┘
                       │
    ┌──────────────────▼───────────────────────────┐
    │              Web Dashboard                     │
    │  Agent cards · Task board · Event feed ·       │
    │  File activity                                 │
    └──────────────────────────────────────────────┘
```

## Quick Start

```bash
cd ai-studio
npm install
export ANTHROPIC_API_KEY=your-key-here

# Start with a goal
node src/index.js --goal "Build a simple rock-paper-scissors card game"

# Open http://localhost:3000 to watch
```

## Programmatic Usage

```javascript
import { Studio } from './src/index.js';

const studio = await Studio.create({
  template: 'turn-based',
  projectName: 'my-card-game',
  genre: 'card game',
  llm: { model: 'claude-sonnet-4-20250514' },
  agents: ['architect', 'programmer', 'designer', 'tester'],
});

await studio.start('Build a deck-building card game with 3 factions');
```

## Agent Roles

| Role | Responsibility | Writes to | Cannot touch |
|------|---------------|-----------|-------------|
| **Architect** | Plans features, designs systems, decomposes tasks | `docs/`, `design/`, `project.json` | Implementation code |
| **Programmer** | Implements game logic, state, core systems | `src/**/*.js` | CSS, HTML, tests |
| **Designer** | Game mechanics, content, UI/UX, visual style | `*.css`, `*.html`, `data/` | Core systems, networking |
| **Tester** | Writes tests, finds bugs, validates features | `tests/`, `simulation/` | Game logic, UI, content |

## Key Design Decisions

- **Blackboard communication**: Agents communicate through the shared workspace (files), not direct messages. Cross-domain requests go through the orchestrator.
- **Role-based file guards**: Agents can only write to paths their role allows. A programmer can't edit CSS; a designer can't modify game logic.
- **Observable everything**: Every file read, write, LLM call, and task transition is an event on the timeline. The web UI streams these in real-time.
- **Template-based scaffolding**: New game projects start from templates that define directory structure, starter files, and module boundaries.

## Adding New Roles

Create a file in `src/agents/roles/`:

```javascript
export const soundDesigner = {
  name: 'soundDesigner',
  displayName: 'Sound Designer',
  identity: 'You are a game audio specialist...',
  domain: ['Sound effects', 'Music', 'Audio mixing'],
  approach: ['Sound reinforces gameplay...'],
  boundaries: ['Never modify game logic...'],
  allowedPaths: ['assets/audio/**', 'src/audio/**'],
  forbiddenPaths: ['src/core/**'],
  taskTypes: ['create_sfx', 'design_music'],
};
```

Then register it in `roles/index.js`.

## Project Structure

```
ai-studio/
├── src/
│   ├── agents/          Agent runtime and role definitions
│   │   ├── Agent.js     Base agent (LLM interaction, tool execution)
│   │   ├── AgentPool.js Agent lifecycle management
│   │   └── roles/       Role configs (architect, programmer, etc.)
│   ├── orchestrator/    Task management and coordination
│   │   ├── Orchestrator.js  Main loop — assigns tasks, drives turns
│   │   └── TaskQueue.js     Priority queue with dependency tracking
│   ├── workspace/       Shared filesystem with access control
│   │   ├── Workspace.js     File operations
│   │   ├── FileGuard.js     Role-based permission enforcement
│   │   └── ProjectTemplate.js  Template scaffolding
│   ├── timeline/        Observable event system
│   │   ├── Event.js     Event types and immutable event objects
│   │   ├── EventBus.js  Pub/sub for real-time streaming
│   │   └── Timeline.js  Append-only log with filtering and replay
│   ├── llm/             LLM provider abstraction
│   │   ├── LLMProvider.js   Abstract interface
│   │   └── ClaudeProvider.js  Anthropic Claude implementation
│   ├── ui/              Web dashboard
│   │   ├── server.js    Express + WebSocket server
│   │   └── public/      Static UI (HTML/CSS/JS)
│   └── index.js         Entry point and Studio class
├── templates/           Game project templates
│   └── turn-based/      Starter template for turn-based games
└── config/
    └── studio.config.js Default configuration
```
