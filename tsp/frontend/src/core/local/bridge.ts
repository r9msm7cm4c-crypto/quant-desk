/**
 * 本地后端的 fetch 适配层。
 *
 * `lib/api.ts` 的 request() 可以直接返回数据对象；但项目里还有若干调用点
 * 直接用 `fetch('/api/...')` 拿 Response（扩展运行时、偏好同步、页面包列表）。
 * 那些点在原生壳里同样打不到后端，所以这里把本地处理结果包成标准 Response，
 * 让它们无需改动就能继续工作。
 */

import { handleLocalRequest, LocalApiError } from './backend'
import { isLocalModeEnabled } from './mode'

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data ?? null), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

/**
 * 命中本地模式时返回 Response；否则返回 null，由调用方走真实 fetch。
 */
export async function tryLocalResponse(path: string, init?: RequestInit): Promise<Response | null> {
  if (!path.startsWith('/api/') || !isLocalModeEnabled()) return null
  try {
    const data = await handleLocalRequest(path, init)
    return jsonResponse(data)
  } catch (e) {
    if (e instanceof LocalApiError) {
      return jsonResponse({ detail: e.message }, e.status)
    }
    return jsonResponse({ detail: e instanceof Error ? e.message : String(e) }, 502)
  }
}
