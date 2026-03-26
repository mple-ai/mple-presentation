FROM node:23-alpine AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN apk add --no-cache libc6-compat openssl python3 make g++ \
  && corepack enable && corepack prepare pnpm@10.17.0 --activate

# ─── Installer (prod deps only)
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

ENV NODE_ENV=production
ENV CI=true
RUN pnpm run build \
  && pnpm prune --prod --ignore-scripts

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

ENV NODE_ENV=production
ENV PORT=3005
ENV HOSTNAME=0.0.0.0

EXPOSE 3005

CMD ["node", "server.js"]   