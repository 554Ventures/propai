import OpenAI from "openai";

let client: OpenAI | null = null;

export const getOpenAIClient = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  if (!client) {
    client = new OpenAI({ apiKey });
  }

  return client;
};

export const getOpenAIModel = () => {
  return process.env.OPENAI_MODEL ?? "gpt-4o-mini";
};

export const getAgentOpenAIModel = () => {
  return process.env.AI_AGENT_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4.1";
};
