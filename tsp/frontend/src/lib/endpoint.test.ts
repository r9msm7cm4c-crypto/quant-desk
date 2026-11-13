// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest'
import {
  describeApiTarget,
  getApiBase,
  normalizeApiBase,
  resolveApiUrl,
  setApiBase,
  subscribeApiBase,
  probeEndpoint,
} from './endpoint'

// 这些用例守护的是「原生壳连不上后端」那类回归：
// 地址规范化一旦放宽/收紧，用户填 http://192.168.1.5:8000 就会静默失效。

describe('normalizeApiBase', () => {
  it('空值与纯空白 → 空串（表示同源）', () => {
    expect(normalizeApiBase('')).toBe('')
    expect(normalizeApiBase('   ')).toBe('')
    expect(normalizeApiBase(undefined as unknown as string)).toBe('')
  })

  it('缺协议时自动补 http://', () => {
    expect(normalizeApiBase('192.168.1.5:8000')).toBe('http://192.168.1.5:8000')
  })

  it('保留 https 并对端口与主机原样保留', () => {
    expect(normalizeApiBase('https://quant.example.com:8443')).toBe('https://quant.example.com:8443')
  })

  it('去掉尾部斜杠', () => {
    expect(normalizeApiBase('http://10.0.0.2:8000///')).toBe('http://10.0.0.2:8000')
  })

  it('误粘贴的 /api 后缀会被去掉（真实基址不含 /api）', () => {
    expect(normalizeApiBase('http://192.168.1.5:8000/api')).toBe('http://192.168.1.5:8000')
    expect(normalizeApiBase('http://192.168.1.5:8000/api/')).toBe('http://192.168.1.5:8000')
  })

  it('保留子路径（反代到子目录的部署）', () => {
    expect(normalizeApiBase('https://host/qd')).toBe('https://host/qd')
  })

  it('拒绝非 http(s) 协议', () => {
    expect(normalizeApiBase('javascript:alert(1)')).toBe('')
    expect(normalizeApiBase('ftp://host')).toBe('')
  })

  it('去掉粘贴时带上的引号与尖括号', () => {
    expect(normalizeApiBase('"http://a.b:1"')).toBe('http://a.b:1')
    expect(normalizeApiBase('<http://a.b:1>')).toBe('http://a.b:1')
  })

  it('反斜杠会被纠正为斜杠', () => {
    expect(normalizeApiBase('http:\\\\192.168.1.5:8000')).toBe('http://192.168.1.5:8000')
  })
})

describe('基址持久化与订阅', () => {
  beforeEach(() => {
    localStorage.clear()
    setApiBase('')
  })

  it('写入后立即读到，且已规范化', () => {
    const saved = setApiBase('192.168.1.5:8000/')
    expect(saved).toBe('http://192.168.1.5:8000')
    expect(getApiBase()).toBe('http://192.168.1.5:8000')
    expect(localStorage.getItem('qd:endpoint:base')).toBe('http://192.168.1.5:8000')
  })

  it('清空后回落为同源', () => {
    setApiBase('http://a.b:1')
    setApiBase('')
    expect(getApiBase()).toBe('')
    expect(localStorage.getItem('qd:endpoint:base')).toBeNull()
  })

  it('变更会通知订阅者，退订后不再收到', () => {
    const fn = vi.fn()
    const off = subscribeApiBase(fn)
    setApiBase('http://a.b:1')
    expect(fn).toHaveBeenCalledTimes(1)
    off()
    setApiBase('http://c.d:2')
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('resolveApiUrl', () => {
  beforeEach(() => {
    localStorage.clear()
    setApiBase('')
  })

  it('Web 同源：保持相对路径', () => {
    expect(resolveApiUrl('/api/watchlist')).toBe('/api/watchlist')
  })

  it('配置基址后拼成绝对地址', () => {
    setApiBase('http://192.168.1.5:8000')
    expect(resolveApiUrl('/api/watchlist')).toBe('http://192.168.1.5:8000/api/watchlist')
  })

  it('缺少前导斜杠也能正确拼接', () => {
    setApiBase('http://192.168.1.5:8000')
    expect(resolveApiUrl('api/watchlist')).toBe('http://192.168.1.5:8000/api/watchlist')
  })

  it('传入完整 URL 时原样返回，不被二次拼接', () => {
    setApiBase('http://192.168.1.5:8000')
    expect(resolveApiUrl('https://other.host/x')).toBe('https://other.host/x')
  })
})

describe('describeApiTarget', () => {
  beforeEach(() => {
    localStorage.clear()
    setApiBase('')
  })

  it('未配置的 Web 环境显示同源部署', () => {
    expect(describeApiTarget()).toBe('同源部署')
  })

  it('配置后显示实际地址', () => {
    setApiBase('http://192.168.1.5:8000')
    expect(describeApiTarget()).toBe('http://192.168.1.5:8000')
  })
})

describe('probeEndpoint', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('探活成功时解析版本与模式', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ status: 'ok', version: '0.9.2', mode: 'api_key' }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )))
    const r = await probeEndpoint('http://192.168.1.5:8000')
    expect(r.ok).toBe(true)
    expect(r.version).toBe('0.9.2')
    expect(r.mode).toBe('api_key')
  })

  it('返回网页而不是 JSON 时明确报错（端口指到了别的服务）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<!doctype html><html></html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    })))
    const r = await probeEndpoint('http://192.168.1.5:8000')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('不是接口数据')
  })

  it('连接异常时给出可操作提示', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    const r = await probeEndpoint('http://192.168.1.5:8000')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('连接失败')
  })

  it('HTTP 非 2xx 时报状态码', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 502 })))
    const r = await probeEndpoint('http://192.168.1.5:8000')
    expect(r.ok).toBe(false)
    expect(r.status).toBe(502)
  })
})
