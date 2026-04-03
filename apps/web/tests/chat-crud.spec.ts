import { test, expect, Page } from "@playwright/test";

const API = "http://localhost:4000";

type AiChatRequest = {
  message?: string;
  pendingActionId?: string | null;
  confirm?: boolean;
  sessionId?: string;
  clientRequestId?: string;
};

async function setupAuthAndMocks(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("propai_token", "test-token");
  });

  // Default: keep the app happy by returning empty payloads for unmocked API calls.
  await page.route(`${API}/**/*`, async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path === "/auth/me") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: { id: "u1", email: "test@example.com", name: "Test" },
          organization: { id: "org1", name: "Test Org" },
          role: "OWNER"
        })
      });
    }

    if (path === "/api/chat/history") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ sessionId: "s1", messages: [] })
      });
    }

    if (path === "/api/chat/sessions") {
      if (route.request().method() === "POST") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ sessionId: "s1" })
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ sessions: [] })
      });
    }

    if (path === "/ai/cancel") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true })
      });
    }

    // Allow test cases to register their own /ai/chat handler via page.route in each test.
    if (path === "/ai/chat") {
      return route.fallback();
    }

    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
}

async function openDashboard(page: Page) {
  await page.goto("/dashboard");
  await expect(page.getByText("Assistant")).toBeVisible();
}

test("createTenant: shows draft card with confirm then result", async ({ page }) => {
  await setupAuthAndMocks(page);

  let step = 0;
  await page.route(`${API}/ai/chat`, async (route) => {
    const body = (await route.request().postDataJSON()) as AiChatRequest;

    if (body.confirm) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          mode: "result",
          pendingActionId: null,
          receipt: { title: "Saved", detail: "createTenant" },
          result: [{ toolName: "createTenant", output: { id: "t1" } }],
          sessionId: "s1"
        })
      });
    }

    step += 1;
    expect(step).toBe(1);
    expect(body.pendingActionId ?? null).toBe(null);

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        mode: "draft",
        pendingActionId: "a1",
        summary: "Create tenant John Doe",
        requiresConfirm: true,
        draft: {
          kind: "createTenant",
          fields: { firstName: "John", lastName: "Doe" },
          toolCalls: [{ toolName: "createTenant", args: { firstName: "John", lastName: "Doe" } }]
        },
        sessionId: "s1"
      })
    });
  });

  await openDashboard(page);

  await page.getByPlaceholder("Ask about rent, properties, expenses...").fill("Create tenant John Doe");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("Create tenant John Doe")).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm" })).toBeVisible();

  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Saved")).toBeVisible();
  await expect(page.getByText(/Confirmed createTenant/)).toBeVisible();
});

test("log expense (cashflow): clarify allows free-text, then draft confirm", async ({ page }) => {
  await setupAuthAndMocks(page);

  let phase: "first" | "second" | "confirm" = "first";
  await page.route(`${API}/ai/chat`, async (route) => {
    const body = (await route.request().postDataJSON()) as AiChatRequest;

    if (body.confirm) {
      phase = "confirm";
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          mode: "result",
          pendingActionId: null,
          receipt: { title: "Saved", detail: "createCashflowTransaction" },
          result: [{ toolName: "createCashflowTransaction", output: { id: "c1" } }],
          sessionId: "s1"
        })
      });
    }

    if (phase === "first") {
      expect(body.pendingActionId ?? null).toBe(null);
      phase = "second";
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          mode: "clarify",
          pendingActionId: "a2",
          summary: "I still need: category.",
          draft: {
            kind: "createCashflowTransaction",
            fields: { type: "expense", amount: 50 },
            toolCalls: [{ toolName: "createCashflowTransaction", args: { type: "expense", amount: 50 } }]
          },
          clarify: {
            missing: ["category"],
            choices: [{ field: "category", options: [{ label: "Repairs", value: "repairs" }] }]
          },
          sessionId: "s1"
        })
      });
    }

    // free-text follow-up continues pending action
    expect(body.pendingActionId).toBe("a2");
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        mode: "draft",
        pendingActionId: "a2",
        summary: "Log expense $50 (repairs)",
        requiresConfirm: true,
        draft: {
          kind: "createCashflowTransaction",
          fields: { type: "expense", amount: 50, category: "repairs" },
          toolCalls: [
            {
              toolName: "createCashflowTransaction",
              args: { type: "expense", amount: 50, category: "repairs" }
            }
          ]
        },
        sessionId: "s1"
      })
    });
  });

  await openDashboard(page);

  await page.getByPlaceholder("Ask about rent, properties, expenses...").fill("Log an expense of $50");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText(/I still need/)).toBeVisible();
  await expect(page.getByText("Missing: category")).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirm" })).toHaveCount(0);

  await page.getByPlaceholder(/Continue this action/).fill("repairs");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("Log expense $50 (repairs)")).toBeVisible();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Saved")).toBeVisible();
});

test("create maintenance request: draft -> confirm -> result", async ({ page }) => {
  await setupAuthAndMocks(page);

  await page.route(`${API}/ai/chat`, async (route) => {
    const body = (await route.request().postDataJSON()) as AiChatRequest;

    if (body.confirm) {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          mode: "result",
          pendingActionId: null,
          receipt: { title: "Saved", detail: "createMaintenanceRequest" },
          result: [{ toolName: "createMaintenanceRequest", output: { id: "m1" } }],
          sessionId: "s1"
        })
      });
    }

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        mode: "draft",
        pendingActionId: "a3",
        summary: "Create maintenance request: Leaky faucet",
        requiresConfirm: true,
        draft: {
          kind: "createMaintenanceRequest",
          fields: { title: "Leaky faucet", propertyId: "p1" },
          toolCalls: [{ toolName: "createMaintenanceRequest", args: { title: "Leaky faucet", propertyId: "p1" } }]
        },
        sessionId: "s1"
      })
    });
  });

  await openDashboard(page);

  await page.getByPlaceholder("Ask about rent, properties, expenses...").fill("Create a maintenance request: leaky faucet at property p1");
  await page.getByRole("button", { name: "Send" }).click();

  await expect(page.getByText("Create maintenance request: Leaky faucet")).toBeVisible();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Saved")).toBeVisible();
});

test("delete transaction + delete property: supports multiple draft cards and switching active action", async ({ page }) => {
  await setupAuthAndMocks(page);

  const seen: string[] = [];
  await page.route(`${API}/ai/chat`, async (route) => {
    const body = (await route.request().postDataJSON()) as AiChatRequest;

    if (body.confirm) {
      // Confirm whichever action is active.
      const actionId = body.pendingActionId;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          mode: "result",
          pendingActionId: null,
          receipt: { title: "Saved", detail: `confirmed ${actionId}` },
          result: [{ toolName: "deleteThing", output: { ok: true, actionId } }],
          sessionId: "s1"
        })
      });
    }

    // First draft: delete transaction
    if (seen.length === 0) {
      seen.push("tx");
      expect(body.pendingActionId ?? null).toBe(null);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          mode: "draft",
          pendingActionId: "del-tx",
          summary: "Delete transaction tx_123",
          requiresConfirm: true,
          draft: {
            kind: "deleteTransaction",
            fields: { transactionId: "tx_123" },
            toolCalls: [{ toolName: "deleteTransaction", args: { transactionId: "tx_123" } }]
          },
          sessionId: "s1"
        })
      });
    }

    // Second draft: delete property (send as new action)
    if (seen.length === 1) {
      seen.push("prop");
      expect(body.pendingActionId ?? null).toBe(null);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          mode: "draft",
          pendingActionId: "del-prop",
          summary: "Delete property p_999",
          requiresConfirm: true,
          draft: {
            kind: "deleteProperty",
            fields: { propertyId: "p_999" },
            toolCalls: [{ toolName: "deleteProperty", args: { propertyId: "p_999" } }]
          },
          sessionId: "s1"
        })
      });
    }

    throw new Error("Unexpected /ai/chat call");
  });

  await openDashboard(page);

  // Draft 1
  await page.getByPlaceholder("Ask about rent, properties, expenses...").fill("Delete transaction tx_123");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Delete transaction tx_123")).toBeVisible();

  // Start a new action while draft 1 still exists
  await page.getByRole("button", { name: "New action" }).click();
  await page.getByPlaceholder("Ask about rent, properties, expenses...").fill("Delete property p_999");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Delete property p_999")).toBeVisible();

  // Continue the first draft explicitly, then confirm it.
  const txCard = page.locator("div", { hasText: "Delete transaction tx_123" }).first();
  await txCard.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText(/Continuing pending action/)).toBeVisible();
  await txCard.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText(/confirmed del-tx/)).toBeVisible();
});
