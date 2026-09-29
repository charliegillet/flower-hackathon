// Model access for the legacy single-bank negotiation.
//
// - FLWR_MODEL_API_KEY is only ever sent to Flower's own Responses API.
// - Any other OpenAI-compatible provider must be configured explicitly with its
//   own key: LLM_BASE_URL + LLM_API_KEY (chat/completions).
const FLOWER_RESPONSES_URL = 'https://api.flower.ai/v1/responses';
const FLOWER_KEY = process.env.FLWR_MODEL_API_KEY || '';
const OTHER_BASE_URL = (process.env.LLM_BASE_URL || '').replace(/\/$/, '');
const OTHER_KEY = process.env.LLM_API_KEY || '';
const DEFAULT_MODEL = process.env.AGENT_MODEL || process.env.FALLBACK_MODEL || 'openai/gpt-5.6-sol';

export function llmAvailable() {
  return Boolean((OTHER_BASE_URL && OTHER_KEY) || FLOWER_KEY);
}

async function flowerResponses({ instructions, input, model, signal }) {
  const res = await fetch(FLOWER_RESPONSES_URL, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${FLOWER_KEY}` },
    body: JSON.stringify({ model, instructions, input, max_output_tokens: 600 }),
  });
  if (!res.ok) return null;
  const json = await res.json();
  const text = (json.output || [])
    .flatMap((item) => item.content || [])
    .filter((c) => c.type === 'output_text')
    .map((c) => c.text)
    .join('');
  return text.trim() || null;
}

async function chatCompletions({ instructions, input, model, signal }) {
  const res = await fetch(`${OTHER_BASE_URL}/chat/completions`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OTHER_KEY}` },
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
}

/**
 * One-shot model call. Returns the assistant's text, or null if no provider is
 * configured or the call fails — callers must have a fallback.
 */
export async function chat({ instructions, input, model = DEFAULT_MODEL, timeoutMs = 20000 }) {
  if (!llmAvailable()) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const call = OTHER_BASE_URL && OTHER_KEY ? chatCompletions : flowerResponses;
    return await call({ instructions, input, model, signal: ctrl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
