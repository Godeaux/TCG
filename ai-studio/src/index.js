import { EventBus } from './timeline/EventBus.js';
import { Timeline } from './timeline/Timeline.js';
import { AgentPool } from './agents/AgentPool.js';
import { Workspace } from './workspace/Workspace.js';
import { Toolchain } from './workspace/Toolchain.js';
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
 * Language-agnostic: the project config defines the tech stack,
 * file extensions, and toolchain commands. Templates provide
 * starter scaffolds for different game types and languages.
 *
 * Usage:
 *   const studio = await Studio.create({
 *     template: 'vanilla-js',
 *     project: { name: 'my-game', language: 'javascript' },
 *   });
 *   await studio.start('Build a card game about food chains');
 *
 * Or from CLI:
 *   node src/index.js --goal "Build a tower defense game" --template vanilla-js
 */
export class Studio {
  constructor({ eventBus, timeline, workspace, toolchain, agentPool, orchestrator, server, config }) {
    this.eventBus = eventBus;
    this.timeline = timeline;
    this.workspace = workspace;
    this.toolchain = toolchain;
    this.agentPool = agentPool;
    this.orchestrator = orchestrator;
    this.server = server;
    this.config = config;
  }

  static async create(opts = {}) {
    // Deep merge config
    const config = {
      ...defaultConfig,
      ...opts,
      llm: { ...defaultConfig.llm, ...opts.llm },
      ui: { ...defaultConfig.ui, ...opts.ui },
      project: { ...defaultConfig.project, ...opts.project },
    };
    if (opts.project?.toolchain) {
      config.project.toolchain = { ...defaultConfig.project.toolchain, ...opts.project.toolchain };
    }

    const eventBus = new EventBus();
    const timeline = new Timeline(eventBus);

    const workspaceDir = path.resolve(config.workspaceDir || './workspace');
    const workspace = new Workspace(workspaceDir, config.project);

    // Scaffold from template if specified
    if (config.template) {
      const templateDir = path.resolve(__dirname, '..', 'templates', config.template);
      const vars = {
        name: config.project.name || 'my-game',
        genre: config.genre || '',
        language: config.project.language || 'javascript',
      };
      ProjectTemplate.scaffold(templateDir, workspaceDir, vars);
    }

    // Toolchain
    const toolchain = new Toolchain(
      config.project.toolchain,
      workspaceDir,
      eventBus,
    );

    // LLM
    const llmProvider = new ClaudeProvider({
      model: config.llm?.model,
      apiKey: config.llm?.apiKey,
    });

    // Agents — pass project config so they know the tech stack
    const agentPool = new AgentPool({
      eventBus,
      workspace,
      llmProvider,
      projectConfig: config.project,
    });
    if (config.agents) {
      for (const roleName of config.agents) {
        agentPool.spawn(roleName);
      }
    } else {
      agentPool.spawnDefaultCrew();
    }

    // Orchestrator
    const orchestrator = new Orchestrator({ agentPool, eventBus, config, toolchain });

    // UI server
    let server = null;
    if (config.ui?.enabled) {
      server = new StudioServer({ port: config.ui.port, eventBus, timeline });
    }

    return new Studio({ eventBus, timeline, workspace, toolchain, agentPool, orchestrator, server, config });
  }

  async start(goal) {
    if (this.server) this.server.start();

    // Console fallback viewer
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
    console.error('Usage: node src/index.js --goal "Build a card game" [--template vanilla-js]');
    process.exit(1);
  }

  const templateIdx = args.indexOf('--template');
  const template = templateIdx !== -1 ? args[templateIdx + 1] : 'vanilla-js';

  const langIdx = args.indexOf('--language');
  const language = langIdx !== -1 ? args[langIdx + 1] : undefined;

  const projectOpts = language ? { project: { language } } : {};

  Studio.create({ template, ...projectOpts }).then((studio) => studio.start(goal));
}
