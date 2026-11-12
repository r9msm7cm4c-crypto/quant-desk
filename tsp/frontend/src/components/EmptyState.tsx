import { type LucideIcon, Construction } from 'lucide-react'

interface Props {
  icon?: LucideIcon
  title: string
  hint?: string
}

// §6.0.5 四态评审 — empty 状态:图示 + 引导,而不是一句"暂无数据"
export function EmptyState({ icon: Icon = Construction, title, hint }: Props) {
  return (
    <div className="grid h-full place-items-center px-6 py-12">
      <div className="text-center max-w-md">
        <Icon className="mx-auto h-8 w-8 text-muted" strokeWidth={1.5} />
        <h2 className="mt-3 text-[14px] font-medium leading-5 text-foreground">{title}</h2>
        {hint && <p className="mx-auto mt-2 max-w-sm text-[12px] leading-relaxed text-muted">{hint}</p>}
      </div>
    </div>
  )
}
