import { useMemo, useState, type ChangeEvent } from 'react'
import { Activity, AlertTriangle, FileUp, FlaskConical, ShieldCheck, TrendingUp } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import {
  calculateRiskMetrics,
  classifyMarketRegime,
  donchianBreakoutSignals,
  linearTrendForecast,
  meanReversionSignals,
  meanReversionZScores,
  parseOHLCVCsv,
  technicalFactors,
  type OHLCVBar,
} from '../../../../native-core/src/index.ts'

function percent(value: number | null | undefined, digits = 2) {
  return value == null || !Number.isFinite(value) ? '—' : `${(value * 100).toFixed(digits)}%`
}

function number(value: number | null | undefined, digits = 2) {
  return value == null || !Number.isFinite(value) ? '—' : value.toFixed(digits)
}

const regimeLabels: Record<string, string> = {
  insufficient: '数据不足',
  'high-volatility': '高波动状态',
  uptrend: '上行趋势状态',
  downtrend: '下行趋势状态',
  range: '区间震荡状态',
}

export function QuantLab() {
  const [bars, setBars] = useState<OHLCVBar[]>([])
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const analysis = useMemo(() => {
    if (bars.length < 50) return null
    const closes = bars.map(bar => bar.close)
    const returns = bars.slice(1).map((bar, index) => bar.close / bars[index]!.close - 1)
    const risk = calculateRiskMetrics(returns)
    const forecast = linearTrendForecast(closes, 1)
    const regime = classifyMarketRegime(bars).at(-1)
    const factors = technicalFactors(bars)
    const breakout = donchianBreakoutSignals(bars, 20).at(-1) ?? 0
    const meanReversion = meanReversionSignals(meanReversionZScores(closes, 20), 2).at(-1) ?? 0
    return { risk, forecast, regime, factors, breakout, meanReversion }
  }, [bars])

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setBusy(true)
    setError('')
    try {
      if (file.size > 20 * 1024 * 1024) throw new RangeError('CSV 文件不能超过 20 MB')
      const parsed = parseOHLCVCsv(await file.text())
      if (parsed.length < 50) throw new RangeError('至少需要 50 条按日期升序排列的日线数据，才能完成默认趋势状态识别')
      setBars(parsed)
      setFileName(file.name)
    } catch (cause) {
      setBars([])
      setFileName('')
      setError(cause instanceof Error ? cause.message : '无法读取 CSV 文件')
    } finally {
      setBusy(false)
      event.target.value = ''
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="量化研究实验室"
        subtitle="本地 CSV · 技术因子 · 市场状态 · 风险统计 · 趋势区间研究"
      />
      <div className="w-full px-4 pb-8 md:px-8 space-y-5">
        <section className="rounded-xl border border-border bg-card p-4 md:p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <FileUp className="h-4 w-4 text-accent" />
            导入历史行情
          </div>
          <p className="text-xs leading-5 text-muted">
            支持中文或英文 CSV 表头：日期、开盘、最高、最低、收盘、成交量。数据只在当前设备内存中计算，不会上传到服务器。
          </p>
          <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-border bg-elevated px-4 text-sm text-foreground hover:bg-elevated/70">
            <FileUp className="h-4 w-4" />
            {busy ? '正在读取…' : '选择 CSV 文件'}
            <input className="sr-only" type="file" accept=".csv,text/csv" disabled={busy} onChange={onFile} />
          </label>
          {fileName && (
            <div className="text-xs text-muted">
              已载入 <span className="font-medium text-foreground">{fileName}</span> · {bars.length.toLocaleString()} 条记录 · {bars[0]?.date} 至 {bars.at(-1)?.date}
            </div>
          )}
          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-xs text-rose-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
        </section>

        {!analysis ? (
          <div className="rounded-xl border border-dashed border-border p-8 text-center">
            <FlaskConical className="mx-auto h-7 w-7 text-muted" />
            <p className="mt-3 text-sm text-foreground">导入至少 50 条历史日线数据开始完整研究</p>
            <p className="mt-1 text-xs text-muted">本页计算在本机完成；当前主应用其他页面仍可能依赖原后端。</p>
          </div>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Metric label="累计收益" value={percent(analysis.risk.cumulativeReturn)} />
              <Metric label="年化波动率" value={percent(analysis.risk.annualizedVolatility)} />
              <Metric label="最大回撤" value={percent(analysis.risk.maxDrawdown)} />
              <Metric label="Sharpe Ratio" value={number(analysis.risk.sharpe)} />
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Activity className="h-4 w-4 text-accent" /> 市场状态识别
                </div>
                <div className="text-lg font-semibold text-foreground">
                  {regimeLabels[analysis.regime?.regime ?? 'insufficient']}
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <Metric label="ADX 趋势强度" value={number(analysis.regime?.adx)} />
                  <Metric label="年化历史波动" value={percent(analysis.regime?.annualizedVolatility)} />
                </div>
                <p className="text-xs leading-5 text-muted">状态识别仅使用当前及过去数据；高波动阈值相对该标的历史波动分布计算。</p>
              </div>

              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <TrendingUp className="h-4 w-4 text-accent" /> 线性趋势外推
                </div>
                <Metric label="下一周期模型估计" value={number(analysis.forecast.forecastClose)} />
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <Metric label="95% 模型区间下界" value={number(analysis.forecast.lower95)} />
                  <Metric label="95% 模型区间上界" value={number(analysis.forecast.upper95)} />
                </div>
                <p className="text-xs leading-5 text-muted">基于历史对数价格线性回归的一周期探索性外推；区间依赖模型假设，不代表真实价格边界。</p>
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck className="h-4 w-4 text-accent" /> 因子与事件检测
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Metric label="20 日动量" value={percent(analysis.factors.momentum)} />
                <Metric label="低波动因子（负波动）" value={number(analysis.factors.lowVolatility, 4)} />
                <Metric label="成交量偏离" value={percent(analysis.factors.volumeSurprise)} />
                <Metric label="区间位置" value={percent(analysis.factors.rangePosition)} />
              </div>
              <div className="grid gap-2 text-xs text-muted md:grid-cols-2">
                <div className="rounded-lg bg-elevated p-3">Donchian 突破事件：{analysis.breakout === 1 ? '向上突破' : analysis.breakout === -1 ? '向下跌破' : '无事件'}</div>
                <div className="rounded-lg bg-elevated p-3">均值偏离事件：{analysis.meanReversion === 1 ? '低于历史基线' : analysis.meanReversion === -1 ? '高于历史基线' : '未达到阈值'}</div>
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card p-4 space-y-2">
              <div className="text-sm font-semibold text-foreground">风险统计补充</div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Metric label="Sortino Ratio" value={number(analysis.risk.sortino)} />
                <Metric label="Calmar Ratio" value={number(analysis.risk.calmar)} />
                <Metric label="历史 VaR 95%" value={percent(analysis.risk.historicalVaR)} />
                <Metric label="历史 CVaR 95%" value={percent(analysis.risk.historicalCVaR)} />
              </div>
            </section>
          </>
        )}

        <p className="text-[11px] leading-5 text-muted">
          研究工具说明：结果取决于数据完整性、复权方式、样本区间和模型假设。统计指标及外推结果仅用于学习与研究，不构成投资建议，也不保证未来表现。数据仅保留在当前页面内存中，关闭页面后需重新导入；未导入数据不会显示模拟行情。
        </p>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-elevated/70 p-3">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="mt-1 break-words font-mono text-base font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  )
}
