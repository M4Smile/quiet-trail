FROM node:22-bookworm-slim

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NODE_ENV=production
ENV WRANGLER_WRITE_LOGS=false
ENV WRANGLER_LOG_PATH=/tmp/wrangler-logs
ENV MINIFLARE_REGISTRY_PATH=/tmp/miniflare-registry

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

EXPOSE 3000

CMD ["npm", "run", "start:node"]
