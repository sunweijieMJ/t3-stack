# 变更说明

<!-- 这次改了什么，以及为什么。若关联 issue 请写 Closes #123 -->

## 变更类型

<!-- 勾选适用项 -->

- [ ] fix — 修复缺陷
- [ ] feat — 新增功能
- [ ] refactor — 重构（不改变外部行为）
- [ ] docs / test / chore — 文档、测试、杂项
- [ ] 涉及数据库迁移
- [ ] 涉及新增或修改环境变量

## 自检

<!-- CI 会跑同样的命令；本地先过一遍能省一轮往返 -->

- [ ] `pnpm lint` / `pnpm type-check` / `pnpm spell-check` 通过
- [ ] `pnpm test:coverage` 通过（含覆盖率阈值）
- [ ] `pnpm build` 通过

## 需要额外确认的情况

<!-- 只勾选与本次变更相关的项，不相关的可整段删掉 -->

- [ ] **改了环境变量**：已同步更新 `src/env.js` 的校验 schema 与 `.env.example` 的说明
- [ ] **加了 adminProcedure 的 mutation**：已在 `src/server/api/audit-action-labels.ts` 登记中文名
      （未登记会被 `tests/audit-action-labels.test.ts` 拦下）
- [ ] **加了数据库迁移**：`pnpm db:generate` 产物已提交，且迁移可重复执行
- [ ] **加了响应后才完成的异步任务**：已用 `next/server` 的 `after()` 包裹
      （Serverless 下裸 `void` 的 Promise 会被丢弃，参见 `server/api/trpc.ts` 的审计写入）
- [ ] **改了文件存储或上传**：已确认 `local` 与 `oss` 两种 `STORAGE_PROVIDER` 下行为一致
- [ ] **改了 Dockerfile / nginx.conf / docker-compose.yml**：已在本地实际起容器验证过

## 影响范围与回滚

<!-- 出问题时怎么发现、怎么退回。无特殊风险可写「无」 -->
