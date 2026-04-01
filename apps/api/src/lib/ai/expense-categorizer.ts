import { getOpenAIClient, getOpenAIModel } from "../openai.js";

const CATEGORIES = [
  "Mortgage",
  "Insurance",
  "Utilities",
  "Repairs",
  "Maintenance",
  "Taxes",
  "HOA",
  "Supplies",
  "Landscaping",
  "Cleaning",
  "Marketing",
  "Legal",
  "Travel",
  "Office",
  "Payroll",
  "Other"
] as const;

export type ExpenseCategorization = {
  category: (typeof CATEGORIES)[number] | "Other";
  confidence: number;
  reasoning: string;
};

const safeJsonParse = (value: string): ExpenseCategorization | null => {
  try {
    const parsed = JSON.parse(value) as ExpenseCategorization;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.category !== "string") return null;
    if (typeof parsed.confidence !== "number") return null;
    if (typeof parsed.reasoning !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
};

export const categorizeExpense = async (payload: {
  description: string;
  amount?: number;
  vendor?: string;
}): Promise<ExpenseCategorization> => {
  const client = getOpenAIClient();
  const model = getOpenAIModel();

  const response = await client.responses.create({
    model,
    input: [
      {
        role: "system",
        content:
          "You are an accounting assistant for property managers. Return JSON only with keys: category, confidence, reasoning. Confidence is a number 0-1. Category must be one of the allowed categories. Reasoning is a concise sentence."
      },
      {
        role: "user",
        content: [
          "Categorize this expense:",
          `Description: ${payload.description}`,
          `Amount: ${payload.amount ?? "unknown"}`,
          `Vendor: ${payload.vendor ?? "unknown"}`,
          `Allowed categories: ${CATEGORIES.join(", ")}`
        ].join("\n")
      }
    ],
    temperature: 0.2
  });

  const text = response.output_text?.trim() ?? "";
  const parsed = safeJsonParse(text);

  if (parsed && CATEGORIES.includes(parsed.category as (typeof CATEGORIES)[number])) {
    return {
      category: parsed.category,
      confidence: Math.min(Math.max(parsed.confidence, 0), 1),
      reasoning: parsed.reasoning
    };
  }

  return {
    category: "Other",
    confidence: 0.2,
    reasoning: "Insufficient signal from the description to choose a specific category."
  };
};

export const expenseCategories = CATEGORIES;
