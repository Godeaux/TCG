let nextTaskId = 1;

/**
 * Task states:
 *   pending    → waiting to be assigned
 *   assigned   → given to an agent, not yet started
 *   active     → agent is working on it
 *   blocked    → agent needs help from another role
 *   completed  → done
 *   failed     → could not be completed
 */
const VALID_TRANSITIONS = {
  pending: ['assigned', 'failed'],
  assigned: ['active', 'pending'],
  active: ['completed', 'blocked', 'failed'],
  blocked: ['pending', 'failed'],
  completed: [],
  failed: ['pending'],
};

export class Task {
  constructor({ description, type, assignToRole = null, dependsOn = [], context = {}, priority = 0 }) {
    this.id = `task-${nextTaskId++}`;
    this.description = description;
    this.type = type;
    this.assignToRole = assignToRole;
    this.dependsOn = dependsOn;
    this.context = context;
    this.priority = priority;
    this.status = 'pending';
    this.assignedAgentId = null;
    this.result = null;
    this.createdAt = Date.now();
    this.completedAt = null;
  }
}

/**
 * Priority queue of tasks with dependency tracking.
 */
export class TaskQueue {
  constructor() {
    /** @type {Map<string, Task>} */
    this._tasks = new Map();
  }

  /**
   * Add a task to the queue.
   * @returns {Task}
   */
  add(taskOpts) {
    const task = new Task(taskOpts);
    this._tasks.set(task.id, task);
    return task;
  }

  /**
   * Add multiple tasks from a plan (e.g., architect output).
   * @param {Array<object>} taskDefs - Array of task definitions
   * @returns {Task[]}
   */
  addPlan(taskDefs) {
    return taskDefs.map((def) => this.add(def));
  }

  /**
   * Get the next task that can be worked on by a given role.
   * Respects dependencies — a task is only ready if all dependsOn are completed.
   */
  nextFor(roleName) {
    const candidates = [...this._tasks.values()]
      .filter((t) => t.status === 'pending')
      .filter((t) => !t.assignToRole || t.assignToRole === roleName)
      .filter((t) => this._dependenciesMet(t))
      .sort((a, b) => b.priority - a.priority);

    return candidates[0] || null;
  }

  /**
   * Transition a task to a new state.
   */
  transition(taskId, newStatus, extras = {}) {
    const task = this._tasks.get(taskId);
    if (!task) throw new Error(`Unknown task: ${taskId}`);

    const allowed = VALID_TRANSITIONS[task.status];
    if (!allowed.includes(newStatus)) {
      throw new Error(`Invalid transition: ${task.status} → ${newStatus}`);
    }

    task.status = newStatus;
    if (extras.agentId) task.assignedAgentId = extras.agentId;
    if (extras.result) task.result = extras.result;
    if (newStatus === 'completed') task.completedAt = Date.now();
  }

  /** Get a task by ID */
  get(taskId) {
    return this._tasks.get(taskId);
  }

  /** Get all tasks */
  all() {
    return [...this._tasks.values()];
  }

  /** Get tasks by status */
  byStatus(status) {
    return [...this._tasks.values()].filter((t) => t.status === status);
  }

  /** Check if all tasks are done (completed or failed) */
  allDone() {
    return [...this._tasks.values()].every(
      (t) => t.status === 'completed' || t.status === 'failed'
    );
  }

  _dependenciesMet(task) {
    return task.dependsOn.every((depId) => {
      const dep = this._tasks.get(depId);
      return dep && dep.status === 'completed';
    });
  }
}
