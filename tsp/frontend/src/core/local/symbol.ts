/**
 * 标的代码归一化 —— 本地行情引擎的入口。
 *
 * 项目内 symbol 有三种写法并存（历史原因，前后端都用过）：
 *   1. `600519.SH` / `000001.SH`   （带交易所后缀，指数页与扩展数据用）
 *   2. `sh600519` / `sz000001`     （腾讯/新浪源的原生写法）
 *   3. `600519` / `000001`         （用户手输、旧自选记录）
 *
 * 本地模式下必须收敛到唯一形式，否则同一只票会生成两份缓存、两份 K 线。
 * 约定：内部规范形式 = 大写后缀的 `CODE.EX`（与后端 `/api/index/*` 一致），
 * 对外请求第三方源时再转成其原生前缀写法。
 */

export type Exchange = 'SH' | 'SZ' | 'BJ'

export interface ParsedSymbol {
  /** 规范形式：`600519.SH` */
  symbol: string
  /** 6 位代码 */
  code: string
  exchange: Exchange
  /** 判断依据，便于诊断「裸代码猜错市场」 */
  inferred: boolean
}

const CODE_RE = /^\d{6}$/

/** 裸 6 位代码推断交易所：A 股现行号段。 */
export function inferExchange(code: string): Exchange {
  const h = code[0]
  if (h === '6' || h === '9') return 'SH' // 60/68 沪主板+科创, 9 为 B 股
  if (h === '4' || h === '8') return 'BJ' // 北交所 43/83/87/88/92
  return 'SZ' // 00/30/12/15/16 深市
}

/**
 * 解析任意写法的标的代码。无法识别时返回 null（由调用方决定报错还是忽略）。
 */
export function parseSymbol(raw: string | null | undefined): ParsedSymbol | null {
  if (!raw) return null
  let s = String(raw).trim().toUpperCase().replace(/\s+/g, '')
  if (!s) return null

  // sh600519 / sz000001 / bj430047
  const prefixed = /^(SH|SZ|BJ)(\d{6})$/.exec(s)
  if (prefixed) {
    return { symbol: `${prefixed[2]}.${prefixed[1]}`, code: prefixed[2], exchange: prefixed[1] as Exchange, inferred: false }
  }

  // 600519.SH / 600519.SS / 000001.XSHE
  const suffixed = /^(\d{6})\.(SH|SS|SZ|XSHE|XSHG|BJ|BSE)$/.exec(s)
  if (suffixed) {
    const ex = suffixed[2]
    const exchange: Exchange = ex === 'SH' || ex === 'SS' || ex === 'XSHG' ? 'SH' : ex === 'BJ' || ex === 'BSE' ? 'BJ' : 'SZ'
    return { symbol: `${suffixed[1]}.${exchange}`, code: suffixed[1], exchange, inferred: false }
  }

  // 裸 6 位
  if (CODE_RE.test(s)) {
    const exchange = inferExchange(s)
    return { symbol: `${s}.${exchange}`, code: s, exchange, inferred: true }
  }

  return null
}

/** 规范形式；无法识别时原样返回（调用方据此判断失败）。 */
export function normalizeSymbol(raw: string | null | undefined): string {
  return parseSymbol(raw)?.symbol ?? String(raw ?? '').trim()
}

/** 规范形式 → 腾讯/新浪前缀写法：`sh600519`。 */
export function toSourceCode(symbol: string): string | null {
  const p = parseSymbol(symbol)
  if (!p) return null
  return `${p.exchange.toLowerCase()}${p.code}`
}

/** 规范形式 → 展示用 6 位代码。 */
export function toCode(symbol: string): string {
  return parseSymbol(symbol)?.code ?? String(symbol ?? '')
}

const INDEX_CODES = new Set([
  '000001.SH', '000300.SH', '000016.SH', '000688.SH', '000905.SH', '000852.SH', '000010.SH',
  '399001.SZ', '399006.SZ', '399005.SZ', '399673.SZ', '399300.SZ',
])

/**
 * 是否为指数。
 * 注意 `000001` 裸代码在自选里指平安银行（深市），只有带 `.SH` 才是上证指数，
 * 所以这里必须看规范形式，不能只看 6 位代码。
 */
export function isIndexSymbol(symbol: string): boolean {
  const p = parseSymbol(symbol)
  if (!p) return false
  if (INDEX_CODES.has(p.symbol)) return true
  // 深市 399xxx 全是指数；沪市 000xxx 只有在带 .SH 时才是指数（裸 000001 是平安银行）
  return p.code.startsWith('399') || (p.exchange === 'SH' && /^000\d{3}$/.test(p.code))
}

/** 资产类型，用于 enriched 行的 asset_type 字段。 */
export function assetTypeOf(symbol: string): 'index' | 'etf' | 'stock' {
  const p = parseSymbol(symbol)
  if (!p) return 'stock'
  if (isIndexSymbol(p.symbol)) return 'index'
  // 沪市 51/56/58、深市 15/16 为 ETF/LOF
  return /^(51|56|58|15|16)\d{4}$/.test(p.code) ? 'etf' : 'stock'
}
