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

CI 由运维基于 `Dockerfile` 在 Jenkins 中自行配置构建/部署，仓库不内置 GitHub Actions。

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
| `BETTER_AUTH_SECRET` | JWT 签发密钥（生产环境必填） |
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

项目提供 `Dockerfile` 和 `docker-compose.yml`，由运维在 Jenkins 中基于此自行配置构建与发布，仓库不维护 CI 流水线。

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
