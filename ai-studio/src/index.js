import { EventBus } from './timeline/EventBus.js';
import { Timeline } from './timeline/Timeline.js';
import { AgentPool } from './agents/AgentPool.js';
import { Workspace } from './workspace/Workspace.js';
import { ProjectTemplate } from './workspace/ProjectTemplate.js';
import { Orchestrator } from './orchestrator/Orchestrator.js';
import { ClaudeProvider } from './llm/ClaudeProvider.js';
import { StudioServer } from './ui/server.js';
import { defaultConfig } from '../config/studio.config.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * AI Game Studio — main entry point.
 *
 * Usage:
 *   const studio = await Studio.create({ goal: 'Build a card game about food chains' });
 *   studio.start();
 *
 * Or from CLI:
 *   node src/index.js --goal "Build a tower defense game"
 */
export class Studio {
  constructor({ eventBus, timeline, workspace, agentPool, orchestrator, server, config }) {
    this.eventBus = eventBus;
    this.timeline = timeline;
    this.workspace = workspace;
    this.agentPool = agentPool;
    this.orchestrator = orchestrator;
    this.server = server;
    this.config = config;
  }

  /**
   * Create and wire up a complete studio instance.
   */
  static async create(opts = {}) {
    const config = { ...defaultConfig, ...opts };

    // Core event system
    const eventBus = new EventBus();
    const timeline = new Timeline(eventBus);

    // Workspace
    const workspaceDir = path.resolve(config.workspaceDir || './workspace');
    const workspace = new Workspace(workspaceDir);

    // Scaffold from template if workspace is empty
    if (config.template) {
      const templateDir = path.resolve(
        __dirname, '..', 'templates', config.template
      );
      ProjectTemplate.scaffold(templateDir, workspaceDir, {
        name: config.projectName || 'my-game',
        genre: config.genre || '',
      });
    }

    // LLM provider
    const llmProvider = new ClaudeProvider({
      model: config.llm?.model,
      apiKey: config.llm?.apiKey,
    });

    // Agents
    const agentPool = new AgentPool({ eventBus, workspace, llmProvider });
    if (config.agents) {
      for (const roleName of config.agents) {
        agentPool.spawn(roleName);
      }
    } else {
      agentPool.spawnDefaultCrew();
    }

    // Orchestrator
    const orchestrator = new Orchestrator({ agentPool, eventBus, config });

    // UI server
    let server = null;
    if (config.ui?.enabled) {
      server = new StudioServer({
        port: config.ui.port,
        eventBus,
        timeline,
      });
    }

    return new Studio({ eventBus, timeline, workspace, agentPool, orchestrator, server, config });
  }

  /**
   * Start the studio with a goal.
   */
  async start(goal) {
    if (this.server) this.server.start();

    // Log to console as a simple fallback viewer
    this.eventBus.onAny((event) => {
      const time = new Date(event.timestamp).toLocaleTimeString();
      const agent = event.agentId ? `[${event.agentId}]` : '[studio]';
      const shortType = event.type.split(':')[1];
      const detail = event.data?.path || event.data?.description || event.data?.goal || '';
      console.log(`${time} ${agent} ${shortType} ${detail}`);
    });

    if (goal) {
      await this.orchestrator.setGoal(goal);
    }

    this.orchestrator.start();
  }
}

// CLI entry point
const args = process.argv.slice(2);
if (args.includes('--goal')) {
  const goalIdx = args.indexOf('--goal');
  const goal = args[goalIdx + 1];
  if (!goal) {
    console.error('Usage: node src/index.js --goal "Build a card game"');
    process.exit(1);
  }

  const templateIdx = args.indexOf('--template');
  const template = templateIdx !== -1 ? args[templateIdx + 1] : 'turn-based';

  Studio.create({ template }).then((studio) => studio.start(goal));
}
