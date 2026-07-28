#!/bin/sh
# Vercel 构建入口（由 vercel.json 的 buildCommand 调用）。
#
# 存在的唯一理由是迁移：Docker 部署里 `node migrate.mjs` 挂在容器启动命令上
# （见 Dockerfile 的 CMD），而 Vercel 没有对应的启动钩子。不在这里跑的话，
# 一键部署出来的站点会连不上任何表 —— 「一键」就名不副实。
#
# 只在 production 环境迁移：预览部署（VERCEL_ENV=preview）常常与生产共用
# 同一个 DATABASE_URL，若不加这道判断，任何一个 PR 的预览构建都会去改生产库结构。
#
# migrate.mjs 本身是幂等的（按 __drizzle_migrations 表比对 hash 增量执行），
# 重复构建不会重复应用；DATABASE_URL 缺失时它会打印提示并正常退出，不阻断构建。
#
# 不想要构建期自动迁移，把下面整个 if 块删掉，改为发版前手动执行：
#   DATABASE_URL='<生产连接串>' pnpm db:migrate

set -e

if [ "$VERCEL_ENV" = "production" ]; then
  echo "[vercel-build] VERCEL_ENV=production，执行数据库迁移"
  node migrate.mjs
else
  echo "[vercel-build] VERCEL_ENV=${VERCEL_ENV:-unknown}，跳过数据库迁移（仅生产环境执行）"
fi

next build
