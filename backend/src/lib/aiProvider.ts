/**
 * AI provider abstraction — switches between Grok (xAI), Anthropic Claude,
 * and OpenAI based on which env var is present. Lets us swap providers
 * with a single env-var change on Render, no code edits.
 *
 * Preference order matches what the user asked for first: Grok → Claude → GPT.
 * The team-side "Ask AI" panel doesn't care which one answers; it just sends
 * a question and shows the reply.
 */

export type AiProvider = 'xai' | 'anthropic' | 'openai';

export interface AiAskOpts {
  systemPrompt: string;
  question: string;
  /** Optional prior turns for multi-turn conversation. */
  history?: { role: 'user' | 'assistant'; content: string }[];
  /** Response token cap. Default 800. */
  maxTokens?: number;
}

export interface AiAskResult {
  answer: string;
  provider: AiProvider;
  model: string;
}

/** Pick the first configured provider. Returns null if none. */
export function getConfiguredProvider(): { provider: AiProvider; model: string } | null {
  if (process.env.XAI_API_KEY) {
    // Default to grok-4-fast-non-reasoning — current production xAI model with
    // good speed/cost balance. Override with XAI_MODEL env var if you want
    // a different one (e.g. grok-4 for reasoning, grok-3-mini for cheapest).
    return { provider: 'xai', model: process.env.XAI_MODEL || 'grok-4-fast-non-reasoning' };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return { provider: 'anthropic', model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest' };
  }
  if (process.env.OPENAI_API_KEY) {
    return { provider: 'openai', model: process.env.OPENAI_MODEL || 'gpt-4o-mini' };
  }
  return null;
}

/** Send a single ask. Throws on transport/HTTP errors. */
export async function askAi(opts: AiAskOpts): Promise<AiAskResult> {
  const cfg = getConfiguredProvider();
  if (!cfg) {
    const err: any = new Error(
      'No AI provider configured. Set one of XAI_API_KEY (Grok), ANTHROPIC_API_KEY (Claude), or OPENAI_API_KEY in backend env.',
    );
    err.code = 'NO_AI_PROVIDER';
    throw err;
  }
  const maxTokens = opts.maxTokens || 800;

  if (cfg.provider === 'xai' || cfg.provider === 'openai') {
    // xAI is OpenAI-compatible — same payload shape, different base URL + key.
    const baseUrl = cfg.provider === 'xai' ? 'https://api.x.ai/v1' : 'https://api.openai.com/v1';
    const apiKey  = cfg.provider === 'xai' ? process.env.XAI_API_KEY! : process.env.OPENAI_API_KEY!;
    const messages = [
      { role: 'system', content: opts.systemPrompt },
      ...(opts.history || []),
      { role: 'user', content: opts.question },
    ];
    const r = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: cfg.model, messages, max_tokens: maxTokens, temperature: 0.5 }),
    });
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      throw new Error(`${cfg.provider} HTTP ${r.status}: ${text.slice(0, 400)}`);
    }
    const j: any = await r.json();
    const answer = j?.choices?.[0]?.message?.content?.trim() || '(empty response)';
    return { answer, provider: cfg.provider, model: cfg.model };
  }

  // Anthropic — different request shape.
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: maxTokens,
      system: opts.systemPrompt,
      messages: [
        ...(opts.history || []).map((m) => ({ role: m.role, content: m.content })),
        { role: 'user', content: opts.question },
      ],
    }),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`anthropic HTTP ${r.status}: ${text.slice(0, 400)}`);
  }
  const j: any = await r.json();
  const answer = (j?.content || []).map((b: any) => b?.text || '').join('').trim() || '(empty response)';
  return { answer, provider: 'anthropic', model: cfg.model };
}
