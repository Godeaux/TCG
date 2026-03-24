/**
 * LLM Client — talks to OpenAI-compatible API endpoints
 *
 * Works with both Anthropic (via proxy) and local Ollama.
 * Handles the chat completions format.
 */

import config from './config.js';

/**
 * Send a chat completion request.
 * @param {Array} messages - [{role: 'system'|'user'|'assistant', content: '...'}]
 * @param {object} options - { temperature, maxTokens }
 * @returns {string} The assistant's response text
 */
export async function chatCompletion(messages, options = {}) {
  const { temperature = 0.7, maxTokens = 2000 } = options;

  const response = await fetch(`${config.llm.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.llm.apiKey}`,
    },
    body: JSON.stringify({
      model: config.llm.model,
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

/**
 * Parse a JSON response from the LLM.
 * Handles markdown code fences and loose JSON.
 */
export function parseJsonResponse(text) {
  // Try extracting from code fence first
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : text.trim();

  try {
    return JSON.parse(jsonStr);
  } catch {
    // Try finding JSON object/array in the text
    const objMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]);
      } catch {
        // Give up
      }
    }
    return null;
  }
}
