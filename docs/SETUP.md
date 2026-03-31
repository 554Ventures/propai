# Local Setup

## Prereqs
- Node.js 20+
- pnpm 9+
- Docker (for PostgreSQL)

## 1) Start Postgres
```bash
docker-compose up -d
```

## 2) Install dependencies
```bash
pnpm install
```

## 3) Configure API env
```bash
cp apps/api/.env.example apps/api/.env
```
Update values as needed. Add your OpenAI API key for AI features.
Optional: adjust AI_RATE_LIMIT_WINDOW_MS and AI_RATE_LIMIT_MAX for chat throttling.

## 4) Run migrations
```bash
pnpm -C apps/api prisma generate
pnpm -C apps/api prisma migrate dev --name init
```
If you are pulling new chatbot changes, run `pnpm -C apps/api prisma migrate dev` to apply the ChatSession/ChatMessage/ToolCallLog tables.

## 5) Start API
```bash
pnpm -C apps/api dev
```

## 6) Start Web
```bash
pnpm -C apps/web dev
```

## 7) Chatbot quick check
- Log in and open the chat widget (bottom-right). 
- Try: \"How much rent did I collect last month?\" or \"List my properties\".
