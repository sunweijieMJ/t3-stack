import chalk from 'chalk';

/**
 * pre-push 钩子。
 *
 * 目前这里**不做任何检查**：
 * - lint-staged / 类型检查 / 单元测试 已在 pre-commit 全部跑过（见 pre-commit.ts）
 * - 构建检查（pnpm build）耗时数十秒，挂在每次 push 上会逼着大家用 --no-verify
 *   绕过钩子，反而更糟；构建错误由 Jenkins 基于 Dockerfile 兜底
 *
 * 之前的实现打印「✓ 构建检查通过」，但真正执行构建的那行是注释掉的，属于会误导人
 * 的假通过，已改为如实说明。若确实想在 push 前拦住构建错误，取消下面两行注释即可。
 */

// import { execSync } from 'node:child_process';
// execSync('pnpm run build', { stdio: 'inherit' });

console.log(
  chalk.gray(
    'pre-push: 跳过构建检查（lint / 类型 / 测试已在 pre-commit 执行）',
  ),
);

process.exit(0);
