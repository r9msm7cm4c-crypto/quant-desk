import type { Config } from 'tailwindcss'
import animate from 'tailwindcss-animate'

// 设计语言 §6.0:暗色为主 + 单一钢蓝强调 + 等宽数字
// 方向:Institutional Quantitative Research Terminal(见 UI_AUDIT.md)
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '1rem' },
    extend: {
      colors: {
        // §6.0.1 色板 — CSS variables 见 src/index.css
        // 注意: base 与字号 token 撞名, text-base 会生成 color 规则 (文字变背景色)。
        // 字号 16px 一律写 text-[16px] leading-6, 禁用 text-base。
        base:      'hsl(var(--base) / <alpha-value>)',
        surface:   'hsl(var(--surface) / <alpha-value>)',
        elevated:  'hsl(var(--elevated) / <alpha-value>)',
        border:    'hsl(var(--border) / <alpha-value>)',
        foreground: 'hsl(var(--fg-primary) / <alpha-value>)',
        secondary:  'hsl(var(--fg-secondary) / <alpha-value>)',
        muted:      'hsl(var(--fg-muted) / <alpha-value>)',
        accent:     'hsl(var(--accent) / <alpha-value>)',
        // A 股语义色:仅用于价格 / K 线,不用于 UI 状态
        bull:       'hsl(var(--bull) / <alpha-value>)',
        bear:       'hsl(var(--bear) / <alpha-value>)',
        warning:    'hsl(var(--warning) / <alpha-value>)',
        danger:     'hsl(var(--danger) / <alpha-value>)',
        // 图表专用:一图一主色,其余走中性
        chart: {
          1: 'hsl(var(--chart-1) / <alpha-value>)',
          2: 'hsl(var(--chart-2) / <alpha-value>)',
          3: 'hsl(var(--chart-3) / <alpha-value>)',
          4: 'hsl(var(--chart-4) / <alpha-value>)',
          5: 'hsl(var(--chart-5) / <alpha-value>)',
          6: 'hsl(var(--chart-6) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Inter', '"HarmonyOS Sans SC"', '"PingFang SC"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      // 字号阶梯:11 / 12 / 13 / 14 / 16 / 20 / 24 / 32
      // 低于 11px 的字号不再使用(全站 9px/10px 已上提)
      // 原有代码大量使用 /8 /12 /15 /35 … 这类非默认档位；补齐后这些边框与底色才真正生效
      opacity: {
        8: '0.08', 12: '0.12', 15: '0.15', 35: '0.35', 45: '0.45', 55: '0.55', 65: '0.65', 85: '0.85',
      },
      fontSize: {
        micro: ['11px', { lineHeight: '15px' }],
        label: ['12px', { lineHeight: '16px' }],
        body: ['13px', { lineHeight: '19px' }],
        lead: ['14px', { lineHeight: '21px' }],
      },
      // 圆角收敛:4 / 6 / 8 / 12。lg/xl/2xl 向下压,避免页面各自为政
      borderRadius: {
        chip: '4px',
        input: '6px',
        btn: '6px',
        card: '8px',
        panel: '10px',
        dialog: '12px',
        lg: '8px',
        xl: '10px',
        '2xl': '12px',
        '3xl': '14px',
      },
      boxShadow: {
        // 暗色下层级靠表面阶梯 + hairline;仅浮层保留中性阴影
        pop: '0 8px 24px -8px hsl(214 30% 4% / 0.55), 0 0 0 1px hsl(var(--border))',
        hairline: 'inset 0 1px 0 hsl(0 0% 100% / 0.04)',
      },
      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
      transitionDuration: {
        140: '140ms',
        180: '180ms',
        240: '240ms',
      },
    },
  },
  plugins: [animate],
} satisfies Config
