# Deployment Guide

This guide covers deploying PropAI with Railway (API + PostgreSQL) and Vercel (Web).

## Railway Setup (API)

### 1) Create a project
- Create a new Railway project.
- Add a **PostgreSQL** plugin.

### 2) Configure environment variables
Set the following variables in Railway (from `apps/api/.env.example`):
- `DATABASE_URL`
- `JWT_SECRET`
- `CORS_ORIGIN` (set to your Vercel web URL)
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (optional)
- `PORT` (optional; Railway injects its own)

### 3) Connect GitHub repo
- Link the GitHub repository.
- Choose the `main` branch for deployments.

### 4) Build & deploy
Railway will build and deploy the API automatically.

### 5) Run migrations
From the Railway service shell (or local with `DATABASE_URL` set):
```bash
npx prisma migrate deploy
```

### 6) Health check verification
- Verify `GET /health` returns `{ status: "ok" }`.
- Confirm the app starts without DB errors.

### 7) Custom domain (optional)
- Add a custom domain in Railway settings.
- Update DNS records as instructed by Railway.
- Update `CORS_ORIGIN` to match the custom domain.

---

## Vercel Setup (Web)

### 1) Import from GitHub
- Import the repository into Vercel.
- Select the `apps/web` project.

### 2) Build settings
- Framework preset: **Next.js** (default)
- Root directory: `apps/web`

### 3) Environment variables
Set:
- `NEXT_PUBLIC_API_URL` = your Railway API URL

### 4) Deploy
- Deploy from `main`.
- Confirm the app loads and API calls succeed.

### 5) Custom domain (optional)
- Add a custom domain in Vercel.
- Update DNS records as instructed by Vercel.

---

## Post-Deployment Checklist
- Verify `GET /health` on the API.
- Test login/signup.
- Test AI chatbot flow.
- Create the first property and unit.

---

## Troubleshooting

### Common errors
- **CORS issues**: Ensure `CORS_ORIGIN` matches the Vercel domain.
- **DB connection failures**: Confirm `DATABASE_URL` is correct and migrations ran.
- **OpenAI errors**: Validate `OPENAI_API_KEY` and account limits.

### Logs
- Railway: Service logs for API errors and build failures.
- Vercel: Deploy logs for build errors and runtime logs for requests.

### Re-running migrations
```bash
npx prisma migrate deploy
```

