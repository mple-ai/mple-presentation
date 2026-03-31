FROM node:23-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN apk add --no-cache libc6-compat openssl python3 make g++ \
  && corepack enable && corepack prepare pnpm@10.17.0 --activate

# ─── Installer
FROM base AS installer
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma

RUN pnpm install --frozen-lockfile

# ─── Builder
FROM base AS builder
WORKDIR /app

COPY --from=installer /app/node_modules ./node_modules
COPY . .

ARG DATABASE_URL
ARG NEXTAUTH_URL
ARG NEXTAUTH_SECRET
ARG GOOGLE_CLIENT_ID
ARG GOOGLE_CLIENT_SECRET
ARG OPENAI_API_KEY
ARG TOGETHER_AI_API_KEY
ARG FAL_API_KEY
ARG UPLOADTHING_TOKEN
ARG UNSPLASH_ACCESS_KEY
ARG TAVILY_API_KEY
ARG COGNITO_REGION
ARG COGNITO_USER_POOL_ID
ARG COGNITO_CLIENT_ID

ENV DATABASE_URL=$DATABASE_URL \
    NEXTAUTH_URL=$NEXTAUTH_URL \
    NEXTAUTH_SECRET=$NEXTAUTH_SECRET \
    GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID \
    GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET \
    OPENAI_API_KEY=$OPENAI_API_KEY \
    TOGETHER_AI_API_KEY=$TOGETHER_AI_API_KEY \
    FAL_API_KEY=$FAL_API_KEY \
    UPLOADTHING_TOKEN=$UPLOADTHING_TOKEN \
    UNSPLASH_ACCESS_KEY=$UNSPLASH_ACCESS_KEY \
    TAVILY_API_KEY=$TAVILY_API_KEY \
    COGNITO_REGION=$COGNITO_REGION \
    COGNITO_USER_POOL_ID=$COGNITO_USER_POOL_ID \
    COGNITO_CLIENT_ID=$COGNITO_CLIENT_ID \
    NODE_ENV=production \
    CI=true \
    SKIP_ENV_VALIDATION=true

RUN pnpm run build

# ─── Runner
FROM node:23-alpine AS runner
WORKDIR /app

RUN apk add --no-cache libc6-compat openssl \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

USER nextjs

ENV NODE_ENV=production \
    PORT=3005 \
    HOSTNAME=0.0.0.0 \
    SKIP_ENV_VALIDATION=true

EXPOSE 3005

CMD ["node", "server.js"]