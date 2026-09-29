const API_KEY = process.env.FLWR_MODEL_API_KEY || process.env.LLM_API_KEY || '';
const BASE_URL = (process.env.LLM_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
const DEFAULT_MODEL = process.env.AGENT_MODEL || process.env.COORDINATOR_MODEL || 'openai/gpt-5.6-sol';

export function llmAvailable() {
  return Boolean(API_KEY);
}

/**
 * One-shot chat completion. Returns the assistant's text, or null if no
 * provider is configured or the call fails — callers must have a fallback.
 */
export async function chat({ instructions, input, model = DEFAULT_MODEL, timeoutMs = 15000 }) {
  if (!API_KEY) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: instructions },
          { role: 'user', content: input },
        ],
        max_tokens: 400,
      }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
