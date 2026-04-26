type PlaidEnvironment = "sandbox" | "development" | "production";

type PlaidApiError = {
  error_code?: string;
  error_message?: string;
  display_message?: string;
};

type PlaidAccount = {
  account_id: string;
  name: string;
  mask?: string | null;
  type?: string | null;
  subtype?: string | null;
};

type PlaidTransaction = {
  transaction_id: string;
  account_id: string;
  name: string;
  merchant_name?: string | null;
  amount: number;
  date: string;
  authorized_date?: string | null;
  iso_currency_code?: string | null;
  category?: string[] | null;
  personal_finance_category?: { primary?: string | null; detailed?: string | null } | null;
  pending?: boolean;
};

type PlaidRemovedTransaction = {
  transaction_id: string;
};

const baseUrls: Record<PlaidEnvironment, string> = {
  sandbox: "https://sandbox.plaid.com",
  development: "https://development.plaid.com",
  production: "https://production.plaid.com"
};

const getPlaidEnv = (): PlaidEnvironment => {
  const value = process.env.PLAID_ENV ?? "sandbox";
  if (value === "development" || value === "production" || value === "sandbox") {
    return value;
  }
  return "sandbox";
};

const getPlaidCredentials = () => {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  if (!clientId || !secret) {
    throw new Error("Plaid is not configured. Set PLAID_CLIENT_ID and PLAID_SECRET.");
  }
  return { clientId, secret };
};

const plaidRequest = async <T>(path: string, body: Record<string, unknown>): Promise<T> => {
  const { clientId, secret } = getPlaidCredentials();
  const env = getPlaidEnv();
  const response = await fetch(`${baseUrls[env]}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, secret, ...body })
  });

  const data = (await response.json()) as T | PlaidApiError;
  if (!response.ok) {
    const plaidError = data as PlaidApiError;
    throw new Error(plaidError.display_message ?? plaidError.error_message ?? "Plaid request failed");
  }

  return data as T;
};

export const createPlaidLinkToken = async (input: {
  userId: string;
  clientName?: string;
  webhook?: string;
}) => {
  const data = await plaidRequest<{ link_token: string; expiration: string }>("/link/token/create", {
    client_name: input.clientName ?? "PropAI",
    country_codes: ["US"],
    language: "en",
    products: ["transactions"],
    user: { client_user_id: input.userId },
    ...(input.webhook ? { webhook: input.webhook } : {})
  });

  return { linkToken: data.link_token, expiration: data.expiration };
};

export const exchangePlaidPublicToken = async (publicToken: string) => {
  const data = await plaidRequest<{ access_token: string; item_id: string }>("/item/public_token/exchange", {
    public_token: publicToken
  });

  return { accessToken: data.access_token, itemId: data.item_id };
};

export const getPlaidAccounts = async (accessToken: string) => {
  const data = await plaidRequest<{ accounts: PlaidAccount[]; item: { institution_id?: string | null } }>("/accounts/get", {
    access_token: accessToken
  });

  return data;
};

export const syncPlaidTransactions = async (accessToken: string, cursor?: string | null) => {
  const data = await plaidRequest<{
    added: PlaidTransaction[];
    modified: PlaidTransaction[];
    removed: PlaidRemovedTransaction[];
    next_cursor: string;
    has_more: boolean;
  }>("/transactions/sync", {
    access_token: accessToken,
    ...(cursor ? { cursor } : {})
  });

  return {
    added: data.added,
    modified: data.modified,
    removed: data.removed,
    nextCursor: data.next_cursor,
    hasMore: data.has_more
  };
};
