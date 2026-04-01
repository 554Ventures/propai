import type { UsageSnapshot } from "./costs.js";

export const extractUsage = (response: unknown): UsageSnapshot => {
  const usage = (response as { usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number } })?.usage;

  const inputTokens = Number(usage?.input_tokens ?? 0) || 0;
  const outputTokens = Number(usage?.output_tokens ?? 0) || 0;
  const totalTokens = Number(usage?.total_tokens ?? inputTokens + outputTokens) || inputTokens + outputTokens;

  return { inputTokens, outputTokens, totalTokens };
};
