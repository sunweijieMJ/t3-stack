# Organova Website

Organova 官网全栈项目，包含一个门户首页和一个仅提供系统配置功能的管理后台。

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | [Next.js 16](https://nextjs.org) (App Router + Turbopack) |
| API | [tRPC](https://trpc.io) — 端到端类型安全 |
| ORM | [Drizzle ORM](https://orm.drizzle.team) |
| 数据库 | [PostgreSQL 18](https://www.postgresql.org/) |
| 认证 | [Better Auth](https://www.better-auth.com/)（邮箱验证码 / 邮箱密码） |
| CSS | [UnoCSS](https://unocss.dev/) + [Ant Design](https://ant.design/)（后台） |
| 校验 | [Zod](https://zod.dev/) |
| 文件存储 | 本地 / 阿里云 OSS |

## 工程化

| 工具 | 用途 |
|------|------|
| [Biome](https://biomejs.dev/) | 代码格式化与 Lint |
| [Vitest](https://vitest.dev/) | 单元测试 |
| [Playwright](https://playwright.dev/) | E2E 测试 |
| [Husky](https://typicode.github.io/husky/) | Git hooks（pre-commit / commit-msg / pre-push） |
| [Commitlint](https://commitlint.js.org/) | 提交信息规范 (`type: subject`) |
| [cspell](https://cspell.org/) | 拼写检查 |
| [GitHub Actions](https://docs.github.com/actions) | CI（质量门禁）与自建服务器部署 |

`.github/workflows/check-quality.yml` 在每次 push / PR 上跑 lint、类型检查、拼写检查、
单测（含覆盖率阈值）与构建 —— 与本地 pre-commit 钩子是同一套命令。

## 项目结构

```
src/
├── app/                    # Next.js App Router 路由
│   ├── (portal)/           # 门户网站页面（仅首页 `/`）
│   ├── admin/              # 管理后台页面（用户管理 + 审计日志 + 门户设置）
│   ├── api/                # API 路由（tRPC、Better Auth、文件上传）
│   └── signin/             # 登录页
├── components/             # 通用组件
├── server/
│   ├── api/routers/        # tRPC routers（sys / page）
│   ├── db/                 # Drizzle schema & 数据库连接
│   └── services/           # 服务层（鉴权、限流、审计、存储、邮件）
└── hooks/                  # 自定义 React hooks
```

## 功能模块

### 门户网站

| 页面 | 路径 |
|------|------|
| 首页 | `/` |

### 管理后台

| 模块 | 路径 | 说明 |
|------|------|------|
| 用户管理 | `/admin/users` | 创建 / 删除后台账号（管理员权限由 `ADMIN_EMAILS` 决定） |
| 审计日志 | `/admin/audit-logs` | 后台操作日志查询、导出与清理策略配置 |
| 门户设置 | `/admin/setting` | 门户配置（站点标题、Logo、主题色、SEO、页脚、社交链接） |

## 快速开始

**环境要求：** Node.js ≥ 22、pnpm ≥ 10、Docker

```bash
# 1. 安装依赖
pnpm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填入数据库连接和认证配置

# 3. 启动数据库（Docker）
docker compose --profile dev up -d db

# 4. 执行数据库迁移
pnpm db:migrate

# 5. 启动开发服务器
pnpm dev
```

访问 [http://localhost:3000](http://localhost:3000) 查看门户，[http://localhost:3000/admin](http://localhost:3000/admin) 进入管理后台。

## 环境变量

完整配置说明见 [.env.example](.env.example)，以下为必填项：

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | PostgreSQL 连接字符串 |
| `BETTER_AUTH_SECRET` | session cookie 签名密钥（生产环境必填，**至少 32 字符**，用 `openssl rand -base64 32` 生成） |
| `BETTER_AUTH_URL` | 应用访问地址 |
| `ADMIN_EMAILS` | 管理员邮箱白名单（逗号分隔） |

### 认证方式

通过 `AUTH_METHOD` 切换：

- `email-otp`（默认）— 邮箱验证码登录，需配置 SMTP
- `email-password` — 邮箱密码登录

站点不提供任何公开注册入口，账号只能由服务端内部创建：

- `scripts/seed-admin.ts`（Docker 启动时通过 `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` 自动执行）
- 后台「用户管理」页（`/admin/users`，走 tRPC 的 `sys.createUser`，内部调用 Better Auth，不经过公开注册端点）

两条公开注册路径都已封堵：`/api/auth/sign-up/email` 在 HTTP 层返回 404，emailOTP 插件开启 `disableSignUp`（否则任意邮箱都能凭验证码自助建号）。

### 文件存储

通过 `STORAGE_PROVIDER` 切换：

- `local`（默认）— 存储到 `public/uploads/`。Docker 部署时该目录挂在 `uploads_data` 卷上并由 nginx 直接对外提供
- `oss` — 阿里云 OSS，需配置 `OSS_*` 变量

## 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动开发服务器（Turbopack） |
| `pnpm build` | 生产构建 |
| `pnpm start` | 启动生产服务器 |
| `pnpm lint` | Biome lint 检查 |
| `pnpm lint:fix` | Biome 自动修复 |
| `pnpm type-check` | TypeScript 类型检查 |
| `pnpm spell-check` | 拼写检查 |
| `pnpm test` | 运行单元测试 |
| `pnpm test:watch` | 监听模式运行测试 |
| `pnpm test:coverage` | 测试覆盖率报告 |
| `pnpm test:e2e` | 运行 E2E 测试 |
| `pnpm db:generate` | 生成数据库迁移文件 |
| `pnpm db:migrate` | 执行数据库迁移 |
| `pnpm db:push` | 推送 schema 到数据库（开发用） |
| `pnpm db:studio` | 打开 Drizzle Studio |
| `pnpm commit` | 交互式规范提交（czg） |

## 部署

支持两条路径：**Vercel**（一键，适合演示与轻量生产）与 **自建服务器**（Docker + Nginx，
功能完整）。两者的能力差异见下方对照表。

### 部署到 Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FsunweijieMJ%2Ft3-stack&env=DATABASE_URL,BETTER_AUTH_SECRET,ADMIN_EMAILS,SMTP_USER,SMTP_PASS&envDescription=%E5%BF%85%E5%A1%AB%E9%A1%B9%EF%BC%9A%E6%95%B0%E6%8D%AE%E5%BA%93%E3%80%81%E8%AE%A4%E8%AF%81%E5%AF%86%E9%92%A5%E3%80%81%E7%AE%A1%E7%90%86%E5%91%98%E9%82%AE%E7%AE%B1%E4%B8%8E%20SMTP&envLink=https%3A%2F%2Fgithub.com%2FsunweijieMJ%2Ft3-stack%2Fblob%2Fmaster%2F.env.example&project-name=organova-website&repository-name=organova-website)

点击后需要填 5 个变量：

| 变量 | 说明 | 缺失时 |
|------|------|--------|
| `DATABASE_URL` | PostgreSQL 连接串。Vercel 上可用 Neon / Supabase 等托管库 | 构建期直接失败 |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` 生成，**至少 32 字符** | 构建期直接失败 |
| `ADMIN_EMAILS` | 管理员邮箱白名单，不填则没有人能进后台 | 站点能起，但没人能进后台 |
| `SMTP_USER` / `SMTP_PASS` | 默认登录方式是邮箱验证码，没有 SMTP 就登不进去。<br>若改用 `AUTH_METHOD=email-password` 则可留空 | 构建能过，**启动时报错** |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | **创建第一个账号**，邮箱须同时在 `ADMIN_EMAILS` 里 | 见下方说明 |

### 为什么必须填 `SEED_ADMIN_*`

站点刻意不提供任何公开注册入口，而 Vercel 又没有容器启动钩子，所以初始管理员由
`scripts/vercel-build.sh` 在构建期创建（Docker 那边对应 `Dockerfile` 的 CMD）。

不填的后果很隐蔽，**不会有任何报错**：表建好了但 `user` 表是空的 → 在登录页点「获取
验证码」时，better-auth 因 `disableSignUp: true` 对「库里不存在的邮箱」**静默返回 200
且不发信**（防用户枚举，见 `email-otp/routes.mjs` 的 `shouldSendOTP` 分支）→ 现场表现
是「接口 200、邮箱永远收不到验证码」，而且进不去后台也就无法用后台去建第一个用户。

`ADMIN_EMAILS` 只决定「谁算管理员」，**不会创建账号**，两者都要配。

脚本幂等，账号已存在时会打印「已存在，跳过创建」，重复部署无副作用，也不会重置密码。
建号成功后建议删掉 `SEED_ADMIN_PASSWORD`，避免明文密码长期驻留在项目配置里。

SMTP 两项之所以不在构建期拦：它们是纯运行时依赖，编译产物一个字节都不依赖它们。
一键部署时用户往往还没申请好邮箱授权码，卡在构建期只会让首次部署无谓地红一次。
校验并没有被削弱 —— `next start` 拉起时依旧 fail-fast（见 `src/env.js` 的 `isNextBuild` 分支）。

**`BETTER_AUTH_URL` 不需要填** —— 一键部署时域名还没分配，根本填不出来。
`src/env.js` 会在 Vercel 上自动取 `VERCEL_PROJECT_PRODUCTION_URL`（生产）
或 `VERCEL_URL`（预览）兜底；有自定义域名后再显式配置它即可。

部署完成后，建议在 Project Settings → Environment Variables 补上：

| 变量 | 建议值 | 不配的后果 |
|------|--------|-----------|
| `REDIS_URL` | Upstash 等 | 限流退化为单实例内存计数，Serverless 下几乎失效 |
| `STORAGE_PROVIDER` + `OSS_*` | `oss` | 后台上传 Logo / PDF 直接失败（函数文件系统只读） |
| `CRON_SECRET` | `openssl rand -base64 32` 生成 | 审计日志自动清理不会定时执行，只在有人打开后台审计页时被动触发一次 |

`TRUST_PROXY_HEADERS` 在 Vercel 上**不需要配**：函数必经平台代理，`X-Forwarded-For`
由平台改写、伪造不了，因此 `src/env.js` 检测到 `VERCEL` 时默认就是 `true`。
自建部署（nginx 在前）才需要显式打开。

配好 `CRON_SECRET` 后，`vercel.json` 里声明的 cron 会每天 04:00 调用
`/api/cron/audit-purge`，Vercel 自动带上 `Authorization: Bearer $CRON_SECRET`。
自建部署用系统 crontab 调同一个地址、自己带上这个头即可。

数据库迁移由 `scripts/vercel-build.sh` 在构建期自动执行，**仅限 production 环境** ——
预览部署常与生产共用同一个 `DATABASE_URL`，自动迁移会让任意 PR 的预览构建改动生产库结构。

### Vercel 与自建服务器的能力差异

| 能力 | 自建（Docker + Nginx） | Vercel |
|------|----------------------|--------|
| 文件上传 | `local` 直接写卷，开箱可用 | 必须接 OSS（函数文件系统只读且实例短暂） |
| 限流 | 单实例内存计数即可 | 必须接 Redis，否则各实例各算各的 |
| 审计日志 / 异步清理 | 长进程自然 flush | 依赖 `after()` 保活（代码已统一处理） |
| 数据库迁移 | 容器启动时自动 | 构建期自动（仅 production） |
| 静态资源 | Nginx 直出 + 强缓存 | Vercel CDN |

### 部署到自建服务器

项目提供 `Dockerfile` 和 `docker-compose.yml`；`.github/workflows/build-deploy.yml`
会把镜像推到 GHCR 并通过 SSH 调用服务器上的 `manage.sh` 完成滚动更新。
该工作流只在**推送 `v*` tag** 或**手动触发**时运行，未配置服务器 secrets 时会自动跳过部署。

```bash
# 构建镜像（两个 target：应用 + Nginx）
docker build -t organova-app:local --target runner .
docker build -t organova-nginx:local --target nginx .

# 启动服务（需设置 APP_IMAGE、NGINX_IMAGE 环境变量）
APP_IMAGE=organova-app:local NGINX_IMAGE=organova-nginx:local docker compose up -d
```

Nginx 镜像必须由本仓库的 `--target nginx` 构建：它内含 `nginx.conf`、`_next/static`
与 public 静态资源，用官方 `nginx:alpine` 顶替会得到一个没有任何配置的空容器。

生产环境默认监听 `HOST_PORT`（默认 `80`，见 `.env.example` 与 `docker-compose.yml`），
通过 Nginx 反向代理到应用容器。

数据库迁移**无需手动执行**：容器启动命令里已包含 `node migrate.mjs`，每次部署会自动
按 `drizzle/meta/_journal.json` 增量应用未执行的迁移，失败则直接退出容器（`set -e`）。
本地开发才需要手动跑 `pnpm db:migrate`。
