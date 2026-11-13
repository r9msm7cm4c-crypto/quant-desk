/**
 * 本地模式开关。
 *
 * 判定顺序（不可颠倒）：
 *   1. 用户配了远端地址 → 一律走远端（他明确要连服务器）
 *   2. 用户手动关掉本地模式 → 走远端（此时未配置会在界面上提示去设置）
 *   3. 其余情况 → 原生壳默认本地模式
 *
 * 「原生壳默认本地」是这次的核心修正：用户手上只有一台 iPhone，
 * 没有电脑、没有服务器，不能要求他先跑一个 FastAPI 才能看行情。
 *
 * 注意：本文件刻意不 import lib/endpoint —— endpoint 的 apiFetch 需要反向引用本模块，
 * 互相 import 会形成 ESM 循环，`isLocalModeEnabled` 在被调用前可能仍是未初始化的绑定。
 * 地址判断在这里独立实现（只依赖 localStorage 与 Capacitor）。
 */

import { Capacitor } from '@capacitor/core'

const LOCAL_KEY = 'qd:local-mode'
const ENDPOINT_KEY = 'qd:endpoint:base'

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function isNativePlatform(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

/** 与 endpoint.normalizeApiBase 同口径的最小判定：只要存了合法 http(s) 基址就算配置过。 */
export function hasRemoteEndpoint(): boolean {
  const raw = (readStorage(ENDPOINT_KEY) ?? '').trim()
  if (!raw) return false
  return /^https?:\/\//i.test(raw)
}

/** 'on' | 'off' | null（未设置 = 跟随平台默认） */
export function getLocalModeSetting(): 'on' | 'off' | null {
  const v = readStorage(LOCAL_KEY)
  return v === 'on' || v === 'off' ? v : null
}

export function setLocalModeSetting(v: 'on' | 'off' | null): void {
  try {
    if (v === null) localStorage.removeItem(LOCAL_KEY)
    else localStorage.setItem(LOCAL_KEY, v)
  } catch {
    /* 隐私模式忽略 */
  }
}

/** 当前是否由本地后端应答请求。 */
export function isLocalModeEnabled(): boolean {
  if (hasRemoteEndpoint()) return false
  const setting = getLocalModeSetting()
  if (setting === 'off') return false
  if (setting === 'on') return true
  return isNativePlatform()
}

/** 设置页展示：为什么现在是本地模式 / 为什么不是。 */
export function describeLocalMode(): { active: boolean; reason: string } {
  if (hasRemoteEndpoint()) {
    return { active: false, reason: '已配置远端服务器，所有请求走该地址' }
  }
  const setting = getLocalModeSetting()
  if (setting === 'off') {
    return { active: false, reason: '已手动关闭本机模式，需配置服务器地址才能取数' }
  }
  if (setting === 'on') {
    return { active: true, reason: '已手动开启本机模式，行情直连公开源' }
  }
  return isNativePlatform()
    ? { active: true, reason: '未配置服务器，自动使用本机模式（行情直连公开源）' }
    : { active: false, reason: '浏览器内运行，默认走同源后端' }
}
