import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** 出错时展示的替代内容；缺省使用内置的错误面板 */
  fallback?: (error: Error, reset: () => void) => ReactNode
  /** 出错回调（用于上报，不弹窗） */
  onError?: (error: Error, info: ErrorInfo) => void
}

interface State {
  error: Error | null
}

/**
 * 顶层错误边界。
 *
 * 目的不是吞掉错误，而是避免单个页面/组件的渲染异常把整棵树卸载成白屏——
 * 在 iOS WebView 里白屏没有任何可操作入口，用户只能杀进程。
 *
 * 注意：只捕获渲染期同步错误；事件回调与异步 request 的错误仍由各自调用方处理。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 保留到 console，便于真机 Safari Inspector 排查；不上报远端。
    console.error('[Quant Desk] render error:', error, info.componentStack)
    this.props.onError?.(error, info)
  }

  private reset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    if (this.props.fallback) return this.props.fallback(error, this.reset)

    return (
      <div className="min-h-full bg-base grid place-items-center p-6">
        <div className="w-full max-w-md rounded-xl border border-border bg-elevated p-5">
          <div className="text-sm font-medium text-foreground">页面渲染出错</div>
          <p className="mt-2 text-xs text-secondary">
            这一页没能正常显示。可以先重试；若持续出现，请记录下方信息。
          </p>
          <pre className="mt-3 max-h-40 overflow-auto rounded-lg bg-base p-3 text-[11px] leading-relaxed text-muted whitespace-pre-wrap break-all">
            {error.name}: {error.message}
          </pre>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={this.reset}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-base"
            >
              重试
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-base"
            >
              重新加载
            </button>
          </div>
        </div>
      </div>
    )
  }
}
