let nextId = 1;

/**
 * An immutable event in the studio timeline.
 * Every observable thing that happens — agent actions, file changes,
 * task transitions, inter-agent messages — becomes an Event.
 */
export class Event {
  constructor({ type, agentId = null, taskId = null, data = {} }) {
    this.id = nextId++;
    this.type = type;
    this.agentId = agentId;
    this.taskId = taskId;
    this.data = Object.freeze({ ...data });
    this.timestamp = Date.now();
    Object.freeze(this);
  }
}

/**
 * All event types in the system.
 * Grouped by domain for clarity.
 */
export const EventType = Object.freeze({
  // Agent lifecycle
  AGENT_SPAWNED: 'agent:spawned',
  AGENT_IDLE: 'agent:idle',
  AGENT_THINKING: 'agent:thinking',
  AGENT_ERROR: 'agent:error',

  // Task lifecycle
  TASK_CREATED: 'task:created',
  TASK_ASSIGNED: 'task:assigned',
  TASK_IN_PROGRESS: 'task:in_progress',
  TASK_COMPLETED: 'task:completed',
  TASK_FAILED: 'task:failed',
  TASK_BLOCKED: 'task:blocked',

  // Workspace
  FILE_CREATED: 'file:created',
  FILE_MODIFIED: 'file:modified',
  FILE_DELETED: 'file:deleted',
  FILE_READ: 'file:read',
  FILE_ACCESS_DENIED: 'file:access_denied',

  // Agent communication
  MESSAGE_SENT: 'message:sent',
  REQUEST_CREATED: 'request:created',
  REQUEST_FULFILLED: 'request:fulfilled',

  // LLM
  LLM_REQUEST: 'llm:request',
  LLM_RESPONSE: 'llm:response',
  LLM_ERROR: 'llm:error',

  // Build / validation
  BUILD_STARTED: 'build:started',
  BUILD_SUCCEEDED: 'build:succeeded',
  BUILD_FAILED: 'build:failed',
  TEST_PASSED: 'test:passed',
  TEST_FAILED: 'test:failed',

  // Studio-level
  STUDIO_STARTED: 'studio:started',
  STUDIO_GOAL_SET: 'studio:goal_set',
  STUDIO_PAUSED: 'studio:paused',
  STUDIO_STOPPED: 'studio:stopped',
});
