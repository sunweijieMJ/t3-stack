import UnoCSS from '@unocss/postcss';

export default {
  plugins: [
    UnoCSS({
      content: ['./src/**/*.{html,js,ts,jsx,tsx}'],
    }),
    // 这里曾挂 postcss-px-to-viewport-8-plugin（viewportWidth: 1920，把 px 转成 vw）。
    // 移除原因：
    //   1. 全项目只有 6 个样式文件，其中 5 个是门户（_home + 4 个 Portal* 组件），
    //      admin 根本没有 CSS 文件（用 antd inline style + UnoCSS 类），
    //      所以插件的真实作用范围就是「门户全部样式」，exclude 里排除 admin 等于空转。
    //   2. 按 1920 基准转 vw 会让门户在手机上等比缩到 19.5%：正文 13px → 2.54px。
    //      作者手写的 4 档移动端媒体查询（500/600/768/900）只改了栅格列数与间距、
    //      没有重申字号（该插件本来也不转换媒体查询块内的 px），兜不住可读性。
    //   3. 门户 SCSS 已有 max-width 容器（560~1200px）+ 上述媒体查询，
    //      本身就是一套完整的常规响应式方案，vw 转换是与之冲突的第二套机制。
    // 影响范围：UnoCSS 工具类输出 rem，本就不受该插件（unitToConvert: 'px'）影响，
    // 所以登录页与 admin 渲染不变；1920 宽度下门户渲染也完全不变
    // （原 0.833vw @1920 == 16px，现在就是 16px）。
    // devDependencies 里的 postcss-px-to-viewport-8-plugin 已无引用，可执行
    //   pnpm remove postcss-px-to-viewport-8-plugin
    // 单独清理（会改动 pnpm-lock.yaml，故未与本次功能改动混在一起）。
  ],
};
