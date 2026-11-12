import { cn } from '@/lib/cn'

interface Props {
  title: string
  subtitle?: React.ReactNode
  /** 标题右侧、subtitle 之前的额外节点(如状态徽标) */
  titleExtra?: React.ReactNode
  right?: React.ReactNode
  className?: string
}

/**
 * 页头 — 标题与操作区。
 * 窄屏下操作区整体换行并可横向滑动，任何按钮都不允许把文字压成竖排。
 */
export function PageHeader({ title, subtitle, titleExtra, right, className }: Props) {
  return (
    <header
      className={cn(
        'flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-3 pl-14 sm:px-6',
        className,
      )}
    >
      <div className="flex w-full min-w-0 flex-col justify-center gap-1 sm:w-auto sm:shrink-0">
        <div className="flex items-center gap-2">
          {/* 标题不做渐变：层级交给字号与颜色，避免文字被背景裁切 */}
          <h1 className="shrink-0 whitespace-nowrap text-[17px] font-medium leading-tight text-foreground">
            {title}
          </h1>
          {titleExtra}
        </div>
        {subtitle && (
          <span className="truncate whitespace-nowrap text-[11px] leading-tight text-muted">{subtitle}</span>
        )}
      </div>
      {right && (
        <div className="tf-toolbar flex w-full min-w-0 items-center gap-1.5 sm:w-auto">
          {right}
        </div>
      )}
    </header>
  )
}
