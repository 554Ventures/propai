import { getOpenAIClient } from "../lib/openai.js";

export type ModerationResult = {
  flagged: boolean;
  categories: Record<string, boolean>;
  categoryScores?: Record<string, number>;
  model?: string;
};

export const moderateText = async (input: string): Promise<ModerationResult> => {
  const client = getOpenAIClient();
  const model = process.env.OPENAI_MODERATION_MODEL ?? "omni-moderation-latest";

  const response = await client.moderations.create({
    model,
    input
  });

  const result = response.results?.[0];

  return {
    flagged: Boolean(result?.flagged),
    categories: (result?.categories ?? {}) as unknown as Record<string, boolean>,
    categoryScores: (result?.category_scores ?? {}) as unknown as Record<string, number>,
    model
  };
};
