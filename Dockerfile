# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:22-bookworm-slim
ARG PNPM_VERSION=10.18.2

FROM ${NODE_IMAGE} AS runtime-base
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

FROM runtime-base AS base
ARG PNPM_VERSION

ENV PNPM_HOME="/pnpm"
ENV PATH="${PNPM_HOME}:${PATH}"

RUN corepack enable \
  && corepack prepare "pnpm@${PNPM_VERSION}" --activate

FROM base AS deps

COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/server/package.json apps/server/package.json

RUN pnpm install --frozen-lockfile

FROM deps AS web-builder

ARG INTERNAL_API_BASE_URL=http://server:7001
ARG NEXT_PUBLIC_API_BASE_PATH=/api
ARG NEXT_PUBLIC_ASSET_ORIGIN=

ENV INTERNAL_API_BASE_URL=${INTERNAL_API_BASE_URL}
ENV NEXT_PUBLIC_API_BASE_PATH=${NEXT_PUBLIC_API_BASE_PATH}
ENV NEXT_PUBLIC_ASSET_ORIGIN=${NEXT_PUBLIC_ASSET_ORIGIN}
ENV NEXT_TELEMETRY_DISABLED=1

COPY . .

RUN pnpm --filter @coding-agent/web build

FROM deps AS server-builder

ENV NODE_ENV=production

COPY . .

RUN pnpm --filter @coding-agent/server build

FROM runtime-base AS web-runner

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=web-builder --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=web-builder --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=web-builder --chown=node:node /app/apps/web/public ./apps/web/public

USER node

EXPOSE 3000

CMD ["node", "apps/web/server.js"]

FROM base AS server-runner

ENV NODE_ENV=production
ENV PORT=7001

COPY --from=server-builder --chown=node:node /app /app

USER node

EXPOSE 7001

CMD ["pnpm", "--filter", "@coding-agent/server", "start"]
