import { Event, EventType } from '../timeline/Event.js';

/**
 * An AI agent in the studio. Each agent has a role, a set of
 * file permissions, and a personality. The agent interacts with
 * the workspace through guarded file operations, and with the
 * LLM through the provider abstraction.
 *
 * Language-agnostic: the agent receives project config (language,
 * extensions, toolchain) and injects it into its system prompt so
 * the LLM knows what tech stack to use.
 */
export class Agent {
  /**
   * @param {object} opts
   * @param {string} opts.id
   * @param {object} opts.role
   * @param {import('../timeline/EventBus.js').EventBus} opts.eventBus
   * @param {import('../workspace/Workspace.js').Workspace} opts.workspace
   * @param {import('../llm/LLMProvider.js').LLMProvider} opts.llmProvider
   * @param {object} [opts.projectConfig] - Project config (language, extensions, toolchain)
   */
  constructor({ id, role, eventBus, workspace, llmProvider, projectConfig = {} }) {
    this.id = id;
    this.role = role;
    this.status = 'idle'; // idle | thinking | blocked | error
    this.currentTaskId = null;
    this._eventBus = eventBus;
    this._workspace = workspace;
    this._llm = llmProvider;
    this._projectConfig = projectConfig;
    this._conversationHistory = [];

    this._emit(EventType.AGENT_SPAWNED, { role: role.name });
  }

  /**
   * Execute one turn of work on a task.
   * The orchestrator calls this repeatedly until the agent
   * signals completion or gets reassigned.
   *
   * @param {object} task - The task to work on
   * @param {string} task.id
   * @param {string} task.description
   * @param {object} task.context - Additional context from orchestrator
   * @returns {Promise<AgentTurnResult>}
   */
  async executeTurn(task) {
    this.status = 'thinking';
    this.currentTaskId = task.id;
    this._emit(EventType.AGENT_THINKING, { taskId: task.id });

    try {
      // Build the messages for this turn
      const messages = this._buildMessages(task);

      // Call LLM with tool definitions
      const response = await this._llm.chat({
        system: this._buildSystemPrompt(),
        messages,
        tools: this._getToolDefinitions(),
      });

      // Process the response — execute tool calls, collect results
      const result = await this._processResponse(response, task);

      // Store conversation turn
      this._conversationHistory.push(
        { role: 'user', content: messages[messages.length - 1].content },
        { role: 'assistant', content: response.content }
      );

      this.status = 'idle';
      return result;
    } catch (err) {
      this.status = 'error';
      this._emit(EventType.AGENT_ERROR, {
        taskId: task.id,
        error: err.message,
      });
      return { status: 'error', error: err.message };
    }
  }

  /**
   * Build the system prompt from the agent's role definition.
   */
  _buildSystemPrompt() {
    const r = this.role;
    const p = this._projectConfig;

    const lines = [
      `You are ${r.name}, a specialized AI agent in a game development studio.`,
      ``,
      `Identity: ${r.identity}`,
      ``,
    ];

    // Inject project tech stack context
    if (p.language) {
      lines.push(
        `## Project Tech Stack`,
        `- Language: ${p.language}`,
        `- Source extensions: ${(p.sourceExtensions || []).join(', ')}`,
        `- Style extensions: ${(p.styleExtensions || []).join(', ')}`,
        `- Data extensions: ${(p.dataExtensions || []).join(', ')}`,
      );
      if (p.toolchain) {
        const cmds = Object.entries(p.toolchain)
          .filter(([, v]) => v)
          .map(([k, v]) => `  ${k}: ${v}`);
        if (cmds.length) {
          lines.push(`- Toolchain commands:`, ...cmds);
        }
      }
      lines.push(``);
    }

    lines.push(
      `Your domain and responsibilities:`,
      ...r.domain.map((d) => `- ${d}`),
      ``,
      `Approach:`,
      ...r.approach.map((a) => `- ${a}`),
      ``,
      `Boundaries (you MUST NOT violate these):`,
      ...r.boundaries.map((b) => `- ${b}`),
      ``,
      `You can read and write files within your allowed paths.`,
      `Allowed paths: ${r.allowedPaths.join(', ')}`,
      `Forbidden paths: ${r.forbiddenPaths.join(', ')}`,
      ``,
      `When you are done with your current task, call the 'complete_task' tool.`,
      `If you are blocked and need another agent's help, call the 'request_help' tool.`,
    );

    return lines.join('\n');
  }

  /**
   * Build the messages array for the LLM call.
   */
  _buildMessages(task) {
    const contextMsg = {
      role: 'user',
      content: [
        `Current task: ${task.description}`,
        task.context?.notes ? `\nContext:\n${task.context.notes}` : '',
        task.context?.files
          ? `\nRelevant files:\n${task.context.files.join('\n')}`
          : '',
      ].join(''),
    };

    return [...this._conversationHistory, contextMsg];
  }

  /**
   * Tool definitions available to this agent.
   * Workspace operations are guarded by FileGuard.
   */
  _getToolDefinitions() {
    return [
      {
        name: 'read_file',
        description: 'Read the contents of a file in the workspace',
        input_schema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path relative to workspace root' },
          },
          required: ['path'],
        },
      },
      {
        name: 'write_file',
        description: 'Write content to a file in the workspace (creates or overwrites)',
        input_schema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path relative to workspace root' },
            content: { type: 'string', description: 'File content' },
          },
          required: ['path', 'content'],
        },
      },
      {
        name: 'list_files',
        description: 'List files in a directory',
        input_schema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Directory path relative to workspace root' },
          },
          required: ['path'],
        },
      },
      {
        name: 'complete_task',
        description: 'Signal that the current task is complete',
        input_schema: {
          type: 'object',
          properties: {
            summary: { type: 'string', description: 'Brief summary of what was accomplished' },
          },
          required: ['summary'],
        },
      },
      {
        name: 'request_help',
        description: 'Request help from another agent role',
        input_schema: {
          type: 'object',
          properties: {
            targetRole: { type: 'string', description: 'The role name you need help from' },
            request: { type: 'string', description: 'What you need them to do' },
          },
          required: ['targetRole', 'request'],
        },
      },
    ];
  }

  /**
   * Process an LLM response — execute any tool calls via workspace.
   */
  async _processResponse(response, task) {
    const toolUses = response.content?.filter((b) => b.type === 'tool_use') || [];

    for (const toolUse of toolUses) {
      const { name, input } = toolUse;

      if (name === 'complete_task') {
        this._emit(EventType.TASK_COMPLETED, {
          taskId: task.id,
          summary: input.summary,
        });
        return { status: 'completed', summary: input.summary };
      }

      if (name === 'request_help') {
        this._emit(EventType.REQUEST_CREATED, {
          taskId: task.id,
          targetRole: input.targetRole,
          request: input.request,
        });
        return {
          status: 'blocked',
          helpRequest: { targetRole: input.targetRole, request: input.request },
        };
      }

      if (name === 'read_file') {
        const result = this._workspace.readFile(input.path, this.id, this.role);
        this._emit(
          result.denied ? EventType.FILE_ACCESS_DENIED : EventType.FILE_READ,
          { path: input.path, denied: result.denied }
        );
      }

      if (name === 'write_file') {
        const result = this._workspace.writeFile(input.path, input.content, this.id, this.role);
        this._emit(
          result.denied ? EventType.FILE_ACCESS_DENIED : EventType.FILE_MODIFIED,
          { path: input.path, denied: result.denied }
        );
      }

      if (name === 'list_files') {
        this._workspace.listFiles(input.path, this.id, this.role);
      }
    }

    return { status: 'continue' };
  }

  /** Convenience for emitting events tagged with this agent */
  _emit(type, data = {}) {
    this._eventBus.emit(
      new Event({ type, agentId: this.id, taskId: this.currentTaskId, data })
    );
  }

  /** Reset conversation history (e.g., when switching tasks) */
  resetContext() {
    this._conversationHistory = [];
  }
}

/**
 * @typedef {object} AgentTurnResult
 * @property {'completed'|'continue'|'blocked'|'error'} status
 * @property {string} [summary]
 * @property {object} [helpRequest]
 * @property {string} [error]
 */
