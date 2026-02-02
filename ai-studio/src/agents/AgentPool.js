import { Agent } from './Agent.js';
import { roles } from './roles/index.js';

/**
 * Manages the pool of active agents in the studio.
 * Creates agents from role definitions, tracks their status,
 * and provides lookup by ID or role.
 */
export class AgentPool {
  constructor({ eventBus, workspace, llmProvider, projectConfig = {} }) {
    /** @type {Map<string, Agent>} */
    this._agents = new Map();
    this._eventBus = eventBus;
    this._workspace = workspace;
    this._llmProvider = llmProvider;
    this._projectConfig = projectConfig;
  }

  /**
   * Spawn an agent with a given role.
   * @param {string} roleName - Key from the roles registry
   * @param {string} [id] - Custom ID, or auto-generated from role
   * @returns {Agent}
   */
  spawn(roleName, id) {
    const role = roles[roleName];
    if (!role) throw new Error(`Unknown role: ${roleName}`);

    const agentId = id || `${roleName}-${this._agents.size + 1}`;
    const agent = new Agent({
      id: agentId,
      role,
      eventBus: this._eventBus,
      workspace: this._workspace,
      llmProvider: this._llmProvider,
      projectConfig: this._projectConfig,
    });

    this._agents.set(agentId, agent);
    return agent;
  }

  /** Spawn the default studio crew — one agent per core role. */
  spawnDefaultCrew() {
    const defaultRoles = ['architect', 'programmer', 'designer', 'tester'];
    return defaultRoles.map((r) => this.spawn(r));
  }

  /** Get agent by ID */
  get(id) { return this._agents.get(id); }

  /** Get all agents with a given role name */
  byRole(roleName) {
    return [...this._agents.values()].filter((a) => a.role.name === roleName);
  }

  /** Get all idle agents */
  idle() { return [...this._agents.values()].filter((a) => a.status === 'idle'); }

  /** Get all agents */
  all() { return [...this._agents.values()]; }
}
