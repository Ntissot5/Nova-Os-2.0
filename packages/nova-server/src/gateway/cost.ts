// Coût des appels au modèle, en dollars, à partir de l'usage renvoyé par l'API (D-016, D-017).
// Tarifs Anthropic par million de tokens (entrée, sortie). Lecture du cache : 0.1× l'entrée
// (0.05× sur Opus 5.5) ; écriture du cache (5 min) : 1.25× l'entrée.

const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
};

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export function costUSD(model: string, u: Usage) {
  const p = PRICES[model];
  if (!p) return undefined;
  const write = (u.cache_creation_input_tokens ?? 0) * p.input * 1.25;
  const read = (u.cache_read_input_tokens ?? 0) * p.cacheRead;
  return Math.round(((u.input_tokens * p.input + u.output_tokens * p.output + write + read) / 1e6) * 1e5) / 1e5;
}

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    cache_read_input_tokens: (a.cache_read_input_tokens ?? 0) + (b.cache_read_input_tokens ?? 0),
    cache_creation_input_tokens: (a.cache_creation_input_tokens ?? 0) + (b.cache_creation_input_tokens ?? 0),
  };
}
