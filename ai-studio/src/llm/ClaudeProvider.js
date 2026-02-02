import { LLMProvider } from './LLMProvider.js';

/**
 * Claude (Anthropic) LLM provider.
 * Wraps the @anthropic-ai/sdk client.
 */
export class ClaudeProvider extends LLMProvider {
  /**
   * @param {object} opts
   * @param {string} [opts.model] - Model ID
   * @param {string} [opts.apiKey] - API key (defaults to ANTHROPIC_API_KEY env var)
   */
  constructor({ model = 'claude-sonnet-4-20250514', apiKey } = {}) {
    super();
    this._model = model;
    this._apiKey = apiKey || process.env.ANTHROPIC_API_KEY;
    this._client = null; // Lazy init
  }

  async _getClient() {
    if (!this._client) {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      this._client = new Anthropic({ apiKey: this._apiKey });
    }
    return this._client;
  }

  async chat({ system, messages, tools }) {
    const client = await this._getClient();

    const params = {
      model: this._model,
      max_tokens: 4096,
      system,
      messages,
    };

    if (tools?.length) {
      params.tools = tools;
    }

    const response = await client.messages.create(params);

    return {
      content: response.content,
      stopReason: response.stop_reason,
      usage: response.usage,
    };
  }
}
