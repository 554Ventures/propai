import { describe, expect, it, vi, beforeAll } from "vitest";
import request from "supertest";
import app from "../app.js";
import prisma from "../lib/prisma.js";
import { signupAndGetToken } from "./helpers/auth.js";

process.env.OPENAI_API_KEY = "test-key";
process.env.AI_OUTPUT_MODERATION_ENABLED = "false";

vi.mock("openai", () => {
  return {
    default: class {
      responses = {
        create: vi.fn().mockResolvedValue({
          id: "resp_1",
          output_text: "Here’s a read-only answer.",
          output: []
        })
      };
    }
  };
});

beforeAll(async () => {
  // Ensure prisma client is reachable before the test suite runs.
  await prisma.$connect();
});

describe("/ai/chat (read-only)", () => {
  it("returns mode=chat when no write action is planned", async () => {
    const { token } = await signupAndGetToken();

    const r1 = await request(app)
      .post("/ai/chat")
      .set("Authorization", `Bearer ${token}`)
      .send({ message: "What’s my portfolio overview?" })
      .expect(200);

    expect(r1.body.mode).toBe("chat");
    expect(r1.body.pendingActionId).toBe(null);
    expect(typeof r1.body.sessionId).toBe("string");
    expect(r1.body.message).toContain("read-only");

    const session = await prisma.chatSession.findUnique({
      where: { id: r1.body.sessionId },
      select: { id: true, summary: true, title: true }
    });

    expect(session).toBeTruthy();
    expect(session?.title).toBeTruthy();
    expect(session?.summary).toBeTruthy();
    expect(String(session?.summary ?? "")).toMatch(/portfolio overview/i);
  });
});
