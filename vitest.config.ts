import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      SKIP_ENV_VALIDATION: '1',
    },
    environment: 'node',
    globals: true,
    passWithNoTests: true,
    // 默认 5s 不够：DB 测试要在 beforeAll 里启动 PGlite（把 Postgres 编译成 WASM
    // 跑在进程内），冷启动实测约 5-6s，正好卡在默认超时线上。
    // 这个值只影响单个用例的上限，纯逻辑测试仍然是毫秒级返回，不会因此变慢。
    testTimeout: 30_000,
    hookTimeout: 30_000,
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      // 必须显式声明 include，否则 v8 provider 只统计「被测试 import 过」的文件，
      // 报告会显示 100% 而实际上 90 多个源文件一个都没测 —— 阈值形同虚设。
      //
      // 这里只圈定「纯逻辑、不依赖 DB / 网络 / DOM / React」的模块，让 80% 这个数字
      // 是真的。router、组件、storage / email / config 等需要集成测试或 mock 大量 IO，
      // 故意不纳入门禁，免得为了凑数写一堆无意义的浅测试。新增纯函数模块请加到这里。
      include: [
        'src/lib/auth-error.ts',
        'src/lib/auth-methods.ts',
        'src/lib/content-html.ts',
        'src/lib/content-visibility.ts',
        'src/lib/frontend-config.ts',
        'src/lib/i18n-text.ts',
        'src/lib/rbac.ts',
        'src/lib/safe-path.ts',
        'src/server/db/pg-error.ts',
        'src/server/services/get-client-ip.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
    exclude: [
      'node_modules',
      '.next',
      'coverage',
      'e2e',
      'playwright-report',
      'test-results',
    ],
  },
  resolve: {
    alias: {
      // 见 tests/stubs/server-only.ts 的说明：不替换的话，任何 import 服务端模块
      // 的测试都会在导入阶段被 server-only 抛错中断。
      'server-only': path.resolve(__dirname, './tests/stubs/server-only.ts'),
      '@': path.resolve(__dirname, './src'),
    },
  },
});
