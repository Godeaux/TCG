/**
 * Abstract LLM provider interface.
 * Implementations wrap specific APIs (Claude, OpenAI, local models, etc.)
 * All agents interact with LLMs through this interface.
 */
export class LLMProvider {
  /**
   * Send a chat request to the LLM.
   *
   * @param {object} opts
   * @param {string} opts.system - System prompt
   * @param {Array<{role: string, content: string}>} opts.messages - Conversation history
   * @param {Array<object>} [opts.tools] - Tool definitions
   * @returns {Promise<LLMResponse>}
   */
  async chat(_opts) {
    throw new Error('LLMProvider.chat() must be implemented by subclass');
  }
}

/**
 * @typedef {object} LLMResponse
 * @property {Array<ContentBlock>} content
 * @property {string} stopReason
 * @property {object} usage - Token counts
 */

/**
 * @typedef {object} ContentBlock
 * @property {'text'|'tool_use'} type
 * @property {string} [text]
 * @property {string} [name] - Tool name
 * @property {object} [input] - Tool input
 */
