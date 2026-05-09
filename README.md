# Doclane Backend

NestJS API for Doclane. The backend owns PostgreSQL/Prisma access, authentication, document metadata, S3 signed URLs, and BullMQ queue production.

## Requirements

- Node.js 22
- pnpm
- PostgreSQL
- Redis
- S3-compatible object storage

## Environment

Copy `.env.example` to `.env` and adjust values for your local services.

```bash
cp .env.example .env
```

Application code reads configuration through aliases such as `database.url`, `redis.host`, and `auth.jwt.accessSecret`.

## Local Development

```bash
pnpm install
pnpm prisma:generate
pnpm start:dev
```

Run migrations when your database is available:

```bash
pnpm prisma migrate deploy
```

## Dockerfile

Build the backend image:

```bash
docker build -t doclane-backend .
```

Run the backend image against your own PostgreSQL, Redis, and S3-compatible services:

```bash
docker run --rm -p 3000:3000 \
  -e PORT=3000 \
  -e DATABASE_URL="postgresql://doclane:doclane@host.docker.internal:5432/doclane?schema=public" \
  -e REDIS_HOST="host.docker.internal" \
  -e REDIS_PORT=6379 \
  -e S3_REGION="us-east-1" \
  -e S3_BUCKET="doclane" \
  -e S3_ACCESS_KEY_ID="change-me" \
  -e S3_SECRET_ACCESS_KEY="change-me" \
  -e S3_ENDPOINT="http://host.docker.internal:9000" \
  -e S3_FORCE_PATH_STYLE=true \
  -e OIDC_ISSUER_URL="https://issuer.example.com" \
  -e OIDC_CLIENT_ID="doclane" \
  -e OIDC_CLIENT_SECRET="change-me" \
  -e OIDC_REDIRECT_URI="http://localhost:3000/auth/oidc/callback" \
  -e JWT_ACCESS_SECRET="replace-with-at-least-32-characters" \
  -e JWT_REFRESH_SECRET="replace-with-at-least-32-characters-refresh" \
  doclane-backend
```

The backend image generates the Prisma client at build time. Database migrations are still an explicit deployment step.

## Verification

After backend changes, run:

```bash
pnpm prisma:generate
pnpm build
pnpm lint
pnpm test
```
