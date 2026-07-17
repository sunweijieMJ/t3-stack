import UnoCSS from '@unocss/postcss';
import pxToViewport from 'postcss-px-to-viewport-8-plugin';

export default {
  plugins: [
    UnoCSS({
      content: ['./src/**/*.{html,js,ts,jsx,tsx}'],
    }),
    pxToViewport({
      unitToConvert: 'px',
      viewportWidth: 1920,
      unitPrecision: 3,
      propList: ['*'],
      viewportUnit: 'vw',
      fontViewportUnit: 'vw',
      // 排除 admin 路径与 admin 专用组件，防止后台固定布局被错误按 1920 视口缩放；
      // node_modules 通常不走 PostCSS，写上是为了双保险。
      exclude: [
        /[\\/]admin[\\/]/,
        /[\\/]RichTextEditor[\\/]/,
        /[\\/]ConfigEditor[\\/]/,
        /[\\/]DraggableTable[\\/]/,
        /[\\/]ImageUploader[\\/]/,
        /node_modules/,
      ],
      // antd / antd-pro / codemirror 选择器即使路径漏网也兜底跳过
      selectorBlackList: ['.ant-', '.cm-', '.rich-text-editor'],
      minPixelValue: 1,
      mediaQuery: false,
      replace: true,
      landscape: false,
    }),
  ],
};
