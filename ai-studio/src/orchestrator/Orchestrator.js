import { Event, EventType } from '../timeline/Event.js';
import { TaskQueue } from './TaskQueue.js';

/**
 * The Orchestrator is the heart of the studio.
 * It runs a tick loop that:
 *   1. Checks for idle agents
 *   2. Finds tasks they can work on (respecting dependencies)
 *   3. Assigns tasks and drives agent turns
 *   4. Handles help requests (cross-agent communication)
 *   5. Detects completion or deadlock
 */
export class Orchestrator {
  /**
   * @param {object} opts
   * @param {import('../agents/AgentPool.js').AgentPool} opts.agentPool
   * @param {import('../timeline/EventBus.js').EventBus} opts.eventBus
   * @param {object} opts.config
   */
  constructor({ agentPool, eventBus, config }) {
    this._pool = agentPool;
    this._eventBus = eventBus;
    this._config = config;
    this._taskQueue = new TaskQueue();
    this._running = false;
    this._tickTimer = null;
    this._turnsPerTask = new Map(); // taskId → turn count
  }

  /** Access the task queue (for adding tasks externally) */
  get tasks() {
    return this._taskQueue;
  }

  /**
   * Set a high-level goal. The architect agent will decompose
   * it into tasks for other agents.
   */
  async setGoal(goalDescription) {
    this._eventBus.emit(
      new Event({
        type: EventType.STUDIO_GOAL_SET,
        data: { goal: goalDescription },
      })
    );

    // Create an initial planning task for the architect
    this._taskQueue.add({
      description: `Plan implementation for: ${goalDescription}`,
      type: 'plan_feature',
      assignToRole: 'architect',
      priority: 100,
      context: { goal: goalDescription },
    });
  }

  /**
   * Start the orchestration loop.
   */
  start() {
    if (this._running) return;
    this._running = true;
    this._eventBus.emit(new Event({ type: EventType.STUDIO_STARTED }));
    this._tick();
  }

  /**
   * Pause the orchestration loop.
   */
  pause() {
    this._running = false;
    clearTimeout(this._tickTimer);
    this._eventBus.emit(new Event({ type: EventType.STUDIO_PAUSED }));
  }

  /**
   * Stop the studio entirely.
   */
  stop() {
    this._running = false;
    clearTimeout(this._tickTimer);
    this._eventBus.emit(new Event({ type: EventType.STUDIO_STOPPED }));
  }

  /**
   * One tick of the orchestration loop.
   * Find idle agents, match them with tasks, execute turns.
   */
  async _tick() {
    if (!this._running) return;

    try {
      const idleAgents = this._pool.idle();

      // Match idle agents to available tasks
      for (const agent of idleAgents) {
        const task = this._taskQueue.nextFor(agent.role.name);
        if (!task) continue;

        // Assign and start
        this._taskQueue.transition(task.id, 'assigned', { agentId: agent.id });
        this._taskQueue.transition(task.id, 'active');
        this._turnsPerTask.set(task.id, 0);

        this._eventBus.emit(
          new Event({
            type: EventType.TASK_ASSIGNED,
            agentId: agent.id,
            taskId: task.id,
            data: { description: task.description },
          })
        );

        // Execute agent turn
        await this._executeAgentTurn(agent, task);
      }

      // Check for active tasks that need more turns
      for (const agent of this._pool.all()) {
        if (agent.status !== 'idle' || !agent.currentTaskId) continue;
        const task = this._taskQueue.get(agent.currentTaskId);
        if (task?.status === 'active') {
          await this._executeAgentTurn(agent, task);
        }
      }

      // Check for completion
      if (this._taskQueue.allDone()) {
        this.stop();
        return;
      }
    } catch (err) {
      console.error('Orchestrator tick error:', err);
    }

    // Schedule next tick
    this._tickTimer = setTimeout(
      () => this._tick(),
      this._config.tickInterval || 2000
    );
  }

  /**
   * Execute one agent turn and handle the result.
   */
  async _executeAgentTurn(agent, task) {
    const turnCount = (this._turnsPerTask.get(task.id) || 0) + 1;
    this._turnsPerTask.set(task.id, turnCount);

    // Enforce max turns
    if (turnCount > (this._config.maxTurnsPerTask || 20)) {
      this._taskQueue.transition(task.id, 'failed', {
        result: { reason: 'Max turns exceeded' },
      });
      agent.resetContext();
      return;
    }

    const result = await agent.executeTurn(task);

    switch (result.status) {
      case 'completed':
        this._taskQueue.transition(task.id, 'completed', { result });
        agent.resetContext();
        this._handleArchitectOutput(task, result);
        break;

      case 'blocked':
        this._taskQueue.transition(task.id, 'blocked');
        agent.resetContext();
        this._handleHelpRequest(task, result.helpRequest);
        break;

      case 'error':
        this._taskQueue.transition(task.id, 'failed', { result });
        agent.resetContext();
        break;

      case 'continue':
        // Agent needs more turns — will be picked up next tick
        break;
    }
  }

  /**
   * When the architect completes a planning task, parse the output
   * for sub-tasks and add them to the queue.
   */
  _handleArchitectOutput(task, result) {
    if (task.type !== 'plan_feature') return;

    // The architect's summary might contain structured task definitions.
    // In a real implementation, you'd parse structured output from the LLM.
    // For now, tasks can be added manually or via a structured tool call.
  }

  /**
   * When an agent requests help, create a new task for the target role.
   */
  _handleHelpRequest(blockedTask, helpRequest) {
    const newTask = this._taskQueue.add({
      description: helpRequest.request,
      type: 'assist',
      assignToRole: helpRequest.targetRole,
      priority: blockedTask.priority + 10, // higher priority than the blocked task
      context: {
        requestedBy: blockedTask.assignedAgentId,
        blockedTaskId: blockedTask.id,
      },
    });

    this._eventBus.emit(
      new Event({
        type: EventType.REQUEST_CREATED,
        taskId: newTask.id,
        data: {
          targetRole: helpRequest.targetRole,
          request: helpRequest.request,
          blockedTaskId: blockedTask.id,
        },
      })
    );
  }
}
