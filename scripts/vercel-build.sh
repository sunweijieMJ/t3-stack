#!/bin/sh
# Vercel 构建入口（由 vercel.json 的 buildCommand 调用）。
#
# 存在的理由是补上 Vercel 缺失的「容器启动钩子」：Docker 部署里迁移与建号都挂在
# Dockerfile 的 CMD 上，Vercel 没有对应位置，只能塞进构建期。
#   1. 迁移：不跑的话一键部署出来的站点连不上任何表 —— 「一键」名不副实。
#   2. 初始管理员：不跑的话表建好了却一个用户都没有，而站点刻意不提供公开注册，
#      于是没人能进后台，也就没法用后台去建第一个用户 —— 死锁。
#      更隐蔽的是它不报错：发验证码时 better-auth 因 disableSignUp 对「库里不存在的
#      邮箱」静默返回 200 且不发信（见 email-otp/routes.mjs 的 shouldSendOTP 分支），
#      现场表现是「点了获取验证码，接口 200，邮箱永远收不到」，极难定位。
#
# 只在 production 环境迁移：预览部署（VERCEL_ENV=preview）常常与生产共用
# 同一个 DATABASE_URL，若不加这道判断，任何一个 PR 的预览构建都会去改生产库结构。
#
# migrate.mjs 本身是幂等的：它直接调用 drizzle 官方 migrator，与 `pnpm db:migrate`
# 共用 drizzle.__drizzle_migrations 这一张账本，重复构建不会重复应用。
# DATABASE_URL 缺失时它会打印提示并正常退出，不阻断构建。
#
# 不想要构建期自动迁移，把下面整个 if 块删掉，改为发版前手动执行：
#   DATABASE_URL='<生产连接串>' pnpm db:migrate
# 两条路径记同一本账，手动跑过之后再走构建期迁移不会冲突（旧版本会 42P07 报错）。

set -e

if [ "$VERCEL_ENV" = "production" ]; then
  echo "[vercel-build] VERCEL_ENV=production，执行数据库迁移"
  node migrate.mjs

  # 初始管理员，与 Dockerfile 的 CMD 保持同样的触发条件（SEED_ADMIN_EMAIL 非空）。
  # 脚本自身幂等：账号已存在时打印「已存在，跳过创建」并正常退出，重复构建无副作用，
  # 也不会覆盖已有账号的密码，所以这两个变量留在环境里长期存在是安全的。
  # 用 tsx 直接跑 TS（构建期 devDependencies 齐全），不必像 Dockerfile 那样先 esbuild
  # 成 .mjs —— 那是为了 runner 阶段没有 tsx 才做的编译。
  # 建号后建议去 Vercel 删掉 SEED_ADMIN_PASSWORD，避免明文密码长期驻留在项目配置里。
  if [ -n "$SEED_ADMIN_EMAIL" ]; then
    echo "[vercel-build] 检测到 SEED_ADMIN_EMAIL，创建初始管理员"
    pnpm exec tsx scripts/seed-admin.ts
  else
    echo "[vercel-build] 未设置 SEED_ADMIN_EMAIL，跳过初始管理员创建"
  fi
else
  echo "[vercel-build] VERCEL_ENV=${VERCEL_ENV:-unknown}，跳过数据库迁移（仅生产环境执行）"
fi

next build
