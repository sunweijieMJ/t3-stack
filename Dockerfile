##### BASE
FROM node:22-alpine AS base
ENV COREPACK_NPM_REGISTRY=https://registry.npmmirror.com
RUN corepack enable && corepack prepare pnpm@10.20.0 --activate

##### DEPENDENCIES
FROM base AS deps
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm config set registry https://registry.npmmirror.com && \
    pnpm install --frozen-lockfile

##### BUILDER
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# drizzle/ 目录在首次部署前可能不存在，预建空目录避免 RUNNER 阶段 COPY 失败
RUN mkdir -p drizzle/meta

ENV SKIP_ENV_VALIDATION=1
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm build

# Compile seed scripts for production (no tsx in runner)
RUN pnpm exec esbuild scripts/seed-test-data.ts \
    --bundle --platform=node --format=esm \
    --outfile=seed.mjs \
    --external:postgres \
    --tsconfig=tsconfig.json

RUN pnpm exec esbuild scripts/seed-admin.ts \
    --bundle --platform=node --format=esm \
    --outfile=seed-admin.mjs \
    --external:postgres \
    --tsconfig=tsconfig.json

# 启动期从 Secrets Manager 取 DB 密码、拼出 DATABASE_URL（AWS 模式）
# @aws-sdk 是 CJS 包，bundle 到 ESM 时其内部 require() 会被 esbuild shim 成抛错；
# 用 banner 注入 createRequire，让被 bundle 的 CJS 依赖能用原生 require 加载。
RUN pnpm exec esbuild scripts/resolve-db-url.ts \
    --bundle --platform=node --format=esm \
    --outfile=resolve-db-url.mjs \
    --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);" \
    --tsconfig=tsconfig.json

##### NGINX - serve 静态文件 + 反代 Next.js
FROM nginx:alpine AS nginx

# 构建产物 _next/static
COPY --from=builder /app/.next/static /usr/share/nginx/static

# public 目录静态资源（favicon.ico 等，排除 uploads）
COPY --from=builder /app/public /usr/share/nginx/public
RUN rm -rf /usr/share/nginx/public/uploads

# uploads 目录由卷挂载，预创建空目录
RUN mkdir -p /usr/share/nginx/uploads

##### RUNNER（默认构建目标）
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# 预创建 uploads 目录，确保 volume 挂载后权限正确
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/postgres ./node_modules/postgres
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/migrate.mjs ./migrate.mjs
COPY --from=builder --chown=nextjs:nodejs /app/seed.mjs ./seed.mjs
COPY --from=builder --chown=nextjs:nodejs /app/seed-admin.mjs ./seed-admin.mjs
COPY --from=builder --chown=nextjs:nodejs /app/resolve-db-url.mjs ./resolve-db-url.mjs

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# 启动顺序：解析 DATABASE_URL（直传或 Secrets Manager）→ 迁移 → 可选 seed → server
# 用 set -e 保证任一步失败立刻退容器（让 compose 的 on-failure 介入而不是带病运行）
CMD ["sh", "-c", "set -e; DATABASE_URL=$(node resolve-db-url.mjs) || exit 1; export DATABASE_URL; node migrate.mjs; if [ \"$RUN_SEEDS\" = 'true' ]; then node seed.mjs; fi; if [ -n \"$SEED_ADMIN_EMAIL\" ]; then node seed-admin.mjs; fi; exec node server.js"]
