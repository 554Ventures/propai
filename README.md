# PropAI

**AI-Powered Property Management Platform**

> Add a product screenshot at `docs/assets/screenshot.png` (or update this path once you add one).

## Features
- Property & unit management
- Tenant & lease tracking
- Rent collection & expense tracking
- AI chatbot assistant
- Cash flow forecasting
- Document storage
- AI-powered insights

## Tech Stack
- Frontend: Next.js 14, React, TailwindCSS
- Backend: Node.js, Express, TypeScript
- Database: PostgreSQL (Prisma ORM)
- AI: OpenAI API (GPT-4o-mini)
- Deployment: Vercel (web) + Railway (api)

## Getting Started (Local Development)

### 1) Prerequisites
- Node.js 18+
- pnpm
- PostgreSQL
- Docker

### 2) Clone repo
```bash
git clone <your-repo-url>
cd propai
```

### 3) Install dependencies
```bash
pnpm install
```

### 4) Set up environment variables
```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

### 5) Start database
```bash
docker compose up -d
```

### 6) Run migrations
```bash
pnpm -C apps/api prisma migrate dev
```

### 7) Seed data
```bash
pnpm -C apps/api prisma db seed
```

### 8) Start API
```bash
pnpm -C apps/api dev
```

### 9) Start web
```bash
pnpm -C apps/web dev
```

### 10) Open the app
Visit `http://localhost:3000`.

## Test Credentials
- Email: `demo@propai.com`
- Password: `Password123!`

## Deployment

### API (Railway)
1. Create a PostgreSQL database.
2. Set environment variables (see `apps/api/.env.example`).
3. Connect the GitHub repo.
4. Deploy from `main` branch.
5. Run migrations: `npx prisma migrate deploy`
6. (Optional) Seed demo data.

### Web (Vercel)
1. Connect the GitHub repo.
2. Set `NEXT_PUBLIC_API_URL` to the Railway API URL.
3. Deploy from `main` branch.
4. Verify routing works.

## Project Structure
```
propai/
├── apps/
│   ├── api/          # Express backend
│   └── web/          # Next.js frontend
├── docs/             # Documentation
├── docker-compose.yml
├── package.json      # pnpm workspace
└── README.md
```

## Security
- AI rate limiting & prompt injection defense
- JWT authentication
- Input validation & sanitization
- OpenAI content moderation
- Row-level security (Prisma)

## Code Quality

PropAI uses automated tooling to maintain code quality and prevent TypeScript errors from reaching production:

### Pre-Commit Hooks (Husky + lint-staged)

Every commit automatically runs:
- **ESLint** - Lints and auto-fixes TypeScript code
- **Type checking** - Ensures no TypeScript errors with `strict: true`

**Bypassing hooks** (use sparingly):
```bash
git commit --no-verify
```

### Manual Commands

```bash
# Run ESLint on all files
pnpm lint

# Auto-fix ESLint issues
pnpm lint:fix

# Type-check the API
pnpm type-check

# Build (full type check)
pnpm build
```

### TypeScript Configuration

- **Strict mode enabled** (`strict: true`)
- All implicit `any` types must be explicitly typed
- Custom Express types defined in `apps/api/src/global.d.ts`

The pre-commit hooks ensure that only type-safe, linted code gets committed, preventing the TypeScript errors that previously blocked Railway deployment.

## License
MIT (or your choice)

## Contributing
- Issues and PRs welcome
- Follow existing code style

## Support
- Open an issue
- (Optional) Discord/email
