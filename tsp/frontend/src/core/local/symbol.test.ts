import { describe, expect, it } from 'vitest'
import { assetTypeOf, inferExchange, isIndexSymbol, normalizeSymbol, parseSymbol, toSourceCode } from './symbol'

describe('parseSymbol', () => {
  it('识别带交易所后缀的写法', () => {
    expect(parseSymbol('600519.SH')).toMatchObject({ symbol: '600519.SH', code: '600519', exchange: 'SH', inferred: false })
    expect(parseSymbol('000001.XSHE')).toMatchObject({ symbol: '000001.SZ', exchange: 'SZ' })
    expect(parseSymbol('430047.BJ')).toMatchObject({ symbol: '430047.BJ', exchange: 'BJ' })
  })

  it('识别小写前缀写法', () => {
    expect(parseSymbol('sh600519')).toMatchObject({ symbol: '600519.SH' })
    expect(parseSymbol('SZ000001')).toMatchObject({ symbol: '000001.SZ' })
  })

  it('裸 6 位按号段推断市场', () => {
    expect(parseSymbol('600519')).toMatchObject({ symbol: '600519.SH', inferred: true })
    expect(parseSymbol('000001')).toMatchObject({ symbol: '000001.SZ', inferred: true })
    expect(parseSymbol('300750')).toMatchObject({ symbol: '300750.SZ' })
    expect(parseSymbol('688981')).toMatchObject({ symbol: '688981.SH' })
    expect(parseSymbol('830799')).toMatchObject({ symbol: '830799.BJ' })
  })

  it('非法输入返回 null', () => {
    expect(parseSymbol('')).toBeNull()
    expect(parseSymbol('茅台')).toBeNull()
    expect(parseSymbol('12345')).toBeNull()
    expect(parseSymbol(null)).toBeNull()
  })

  it('inferExchange 覆盖各号段', () => {
    expect(inferExchange('900901')).toBe('SH')
    expect(inferExchange('200011')).toBe('SZ')
    expect(inferExchange('870204')).toBe('BJ')
  })
})

describe('toSourceCode', () => {
  it('转成行情源前缀写法', () => {
    expect(toSourceCode('600519.SH')).toBe('sh600519')
    expect(toSourceCode('000001')).toBe('sz000001')
    expect(toSourceCode('000001.SH')).toBe('sh000001')
    expect(toSourceCode('nonsense')).toBeNull()
  })
})

describe('isIndexSymbol', () => {
  it('裸 000001 是平安银行，不是上证指数', () => {
    expect(isIndexSymbol('000001')).toBe(false)
    expect(isIndexSymbol('000001.SZ')).toBe(false)
  })

  it('带 .SH 的 000001 与 399 开头是深市指数', () => {
    expect(isIndexSymbol('000001.SH')).toBe(true)
    expect(isIndexSymbol('000300.SH')).toBe(true)
    expect(isIndexSymbol('399001.SZ')).toBe(true)
    expect(isIndexSymbol('399006.SZ')).toBe(true)
  })

  it('普通个股不是指数', () => {
    expect(isIndexSymbol('600519.SH')).toBe(false)
    expect(isIndexSymbol('300750.SZ')).toBe(false)
  })
})

describe('assetTypeOf', () => {
  it('区分股票/ETF/指数', () => {
    expect(assetTypeOf('600519.SH')).toBe('stock')
    expect(assetTypeOf('510300.SH')).toBe('etf')
    expect(assetTypeOf('159915.SZ')).toBe('etf')
    expect(assetTypeOf('000001.SH')).toBe('index')
  })
})

describe('normalizeSymbol', () => {
  it('收敛到唯一形式', () => {
    expect(normalizeSymbol('sh600519')).toBe('600519.SH')
    expect(normalizeSymbol(' 600519 ')).toBe('600519.SH')
    expect(normalizeSymbol('600519.sh')).toBe('600519.SH')
  })
})
