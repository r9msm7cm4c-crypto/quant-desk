import { type LucideIcon, CloudOff, RefreshCw } from 'lucide-react'

interface Props {
  icon?: LucideIcon
  title?: string
  hint?: string
  retrying?: boolean
  onRetry?: () => void
}

// §6.0.5 四态评审 — error 状态: 图示 + 归因提示 + 重试入口。
// 与 EmptyState 同构但语义是「加载失败」而非「无数据」, 避免错误被伪装成空态误导排查方向。
export function ErrorState({ icon: Icon = CloudOff, title = '数据加载失败', hint, retrying, onRetry }: Props) {
  return (
    <div className="grid h-full place-items-center px-6 py-12">
      <div className="text-center max-w-md">
        <Icon className="mx-auto h-8 w-8 text-danger/70" strokeWidth={1.5} />
        <h2 className="mt-3 text-[14px] font-medium leading-5 text-foreground">{title}</h2>
        {hint && <p className="mx-auto mt-2 max-w-sm text-[12px] leading-relaxed text-muted">{hint}</p>}
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="tf-btn-secondary mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] disabled:opacity-50"
          >
            <RefreshCw className={retrying ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
            重试
          </button>
        )}
      </div>
    </div>
  )
}
