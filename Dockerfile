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

# 预建空目录，避免后续阶段 COPY 一个不存在的路径而构建失败：
#   drizzle/ —— 首次部署、尚未生成任何迁移时不存在
#   public/  —— 仓库里没有任何静态资源，next build 也不会创建它；
#               运行时它是 uploads 卷的挂载点（见 docker-compose.yml），
#               所以必须存在，但内容为空是正常的
RUN mkdir -p drizzle/meta public

ENV SKIP_ENV_VALIDATION=1
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm build

# Compile seed scripts for production (no tsx in runner)
RUN pnpm exec esbuild scripts/seed-admin.ts \
    --bundle --platform=node --format=esm \
    --outfile=seed-admin.mjs \
    --external:postgres \
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
COPY --from=builder --chown=nextjs:nodejs /app/seed-admin.mjs ./seed-admin.mjs

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# 启动顺序：迁移（DATABASE_URL 由 env_file 提供）→ 可选管理员 seed → server
# 用 set -e 保证任一步失败立刻退容器（让 compose 的 on-failure 介入而不是带病运行）
CMD ["sh", "-c", "set -e; node migrate.mjs; if [ -n \"$SEED_ADMIN_EMAIL\" ]; then node seed-admin.mjs; fi; exec node server.js"]
