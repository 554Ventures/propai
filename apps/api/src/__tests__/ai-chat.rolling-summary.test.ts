import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../app.js";
import prisma from "../lib/prisma.js";
import { signupAndGetToken } from "./helpers/auth.js";

process.env.OPENAI_API_KEY = "test-key";
process.env.AI_OUTPUT_MODERATION_ENABLED = "false";
process.env.AI_ROLLING_SUMMARY_USE_OPENAI = "false";

vi.mock("openai", () => {
  return {
    default: class {
      responses = {
        // /ai/chat may call OpenAI twice per request (plan attempt + read-only chat).
        create: vi.fn().mockResolvedValue({ id: "resp_any", output_text: "OK.", output: [] })
      };
    }
  };
});

describe("/ai/chat rolling summary", () => {
  it("updates ChatSession.summary after assistant messages", async () => {
    const { token } = await signupAndGetToken();

    const r1 = await request(app)
      .post("/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ message: "Remember: Maple Court rent is $1200." })
      .expect(200);

    expect(r1.body.mode).toBe("chat");
    const sessionId = r1.body.sessionId as string;

    const s1 = await prisma.chatSession.findUnique({ where: { id: sessionId }, select: { summary: true } });
    expect(String(s1?.summary ?? "")).toMatch(/Maple Court/i);

    await request(app)
      .post("/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ sessionId, message: "Also note: Utilities average $90/month." })
      .expect(200);

    const s2 = await prisma.chatSession.findUnique({ where: { id: sessionId }, select: { summary: true } });
    expect(String(s2?.summary ?? "")).toMatch(/Utilities/i);
  });
});
