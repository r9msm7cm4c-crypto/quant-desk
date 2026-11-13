import { describe, expect, it } from 'vitest'
import { compareVersions, OTA_MANIFEST_URL, validateManifest } from './otaUpdate'

const validManifest = {
  schemaVersion: 1,
  enabled: true,
  appId: 'com.quantdesk.mobile',
  channel: 'stable',
  runtimeVersion: 'qd-cap8-v1',
  version: '0.1.1',
  bundleId: 'qd-web-0.1.1',
  minAppVersion: '0.1.0',
  bundleUrl: 'https://github.com/r9msm7cm4c-crypto/quant-desk/releases/download/ota-v0.1.1/quant-desk-ota-0.1.1.zip',
  sha256: 'a'.repeat(64),
  signature: 'c2lnbmF0dXJl',
  publishedAt: '2026-11-13T00:00:00.000Z',
  releaseNotes: 'test',
}

const withField = <K extends string>(key: K, value: unknown) =>
  ({ ...validManifest, [key]: value }) as unknown

describe('OTA version ordering', () => {
  it('compares numeric components rather than lexicographic strings', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0)
    expect(compareVersions('1.2.0', '1.2')).toBe(0)
    expect(compareVersions('0.9.9', '1.0.0')).toBeLessThan(0)
  })

  it('accepts a v prefix and build metadata', () => {
    expect(compareVersions('v2.1.0+build.7', '2.0.9')).toBeGreaterThan(0)
  })

  it('never treats a replayed manifest as an upgrade', () => {
    expect(compareVersions('0.1.1', '0.1.1')).toBe(0)
    expect(compareVersions('0.1.0', '0.1.1')).toBeLessThan(0)
  })
})

describe('OTA manifest validation', () => {
  it('accepts a well-formed manifest', () => {
    const parsed = validateManifest(validManifest)
    expect(parsed.version).toBe('0.1.1')
    expect(parsed.bundleUrl).toContain('github.com')
  })

  it('rejects a manifest from another application or schema', () => {
    expect(() => validateManifest(withField('appId', 'com.evil.app'))).toThrow()
    expect(() => validateManifest(withField('schemaVersion', 2))).toThrow()
  })

  it('rejects a missing or non-boolean enabled flag', () => {
    expect(() => validateManifest(withField('enabled', 'true'))).toThrow()
    const { enabled: _drop, ...rest } = validManifest
    expect(() => validateManifest(rest)).toThrow()
  })

  it('rejects bundle URLs that are not trusted HTTPS GitHub releases', () => {
    expect(() => validateManifest(withField('bundleUrl', 'http://github.com/a.zip'))).toThrow()
    expect(() => validateManifest(withField('bundleUrl', 'https://evil.example.com/a.zip'))).toThrow()
    expect(() => validateManifest(withField('bundleUrl', 'javascript:alert(1)'))).toThrow()
  })

  it('rejects malformed integrity fields', () => {
    expect(() => validateManifest(withField('sha256', 'abc'))).toThrow()
    expect(() => validateManifest(withField('sha256', 'z'.repeat(64)))).toThrow()
    expect(() => validateManifest(withField('signature', ''))).toThrow()
    expect(() => validateManifest(withField('signature', 'has space'))).toThrow()
  })

  it('rejects malformed versions and bundle identifiers', () => {
    expect(() => validateManifest(withField('version', 'latest'))).toThrow()
    expect(() => validateManifest(withField('minAppVersion', ''))).toThrow()
    expect(() => validateManifest(withField('bundleId', '../etc/passwd'))).toThrow()
    expect(() => validateManifest(withField('bundleId', 'public'))).toThrow()
  })

  it('rejects an invalid publish timestamp', () => {
    expect(() => validateManifest(withField('publishedAt', 'not-a-date'))).toThrow()
  })
})

describe('OTA prerelease ordering (SemVer 2.0.0 §11)', () => {
  it('ranks a prerelease below the same numbered release', () => {
    expect(compareVersions('0.1.1-alpha.1', '0.1.1')).toBeLessThan(0)
    expect(compareVersions('0.1.1-beta.1', '0.1.1')).toBeLessThan(0)
    expect(compareVersions('0.1.1-rc.1', '0.1.1')).toBeLessThan(0)
    expect(compareVersions('0.1.1', '0.1.1-rc.1')).toBeGreaterThan(0)
  })

  it('orders alpha < beta < rc < release', () => {
    const order = ['0.1.1-alpha.1', '0.1.1-beta.1', '0.1.1-rc.1', '0.1.1']
    for (let i = 1; i < order.length; i += 1) {
      expect(compareVersions(order[i - 1], order[i])).toBeLessThan(0)
    }
  })

  it('compares numeric prerelease identifiers numerically, not lexicographically', () => {
    expect(compareVersions('0.1.1-beta.2', '0.1.1-beta.10')).toBeLessThan(0)
    expect(compareVersions('0.1.1-beta.10', '0.1.1-beta.9')).toBeGreaterThan(0)
    expect(compareVersions('0.1.1-rc.1', '0.1.1-beta.9')).toBeGreaterThan(0)
  })

  it('still ranks a higher core version above any prerelease of a lower one', () => {
    expect(compareVersions('0.1.2-alpha.1', '0.1.1')).toBeGreaterThan(0)
    expect(compareVersions('0.1.1-beta.1', '0.1.0')).toBeGreaterThan(0)
    expect(compareVersions('0.1.1-beta.1', '0.2.0-rc.1')).toBeLessThan(0)
  })

  it('regression guard: a prerelease must never be mistaken for the release', () => {
    expect(compareVersions('0.1.1-beta.1', '0.1.1')).not.toBe(0)
    expect(compareVersions('0.1.1', '0.1.1-beta.1')).not.toBe(0)
  })
})

describe('OTA manifest location', () => {
  it('never points at /main/ota/, which does not exist and returns 404', () => {
    expect(OTA_MANIFEST_URL).not.toMatch(/\/main\/ota\//)
  })

  it('points at the tsp/ota directory where the manifest is actually committed', () => {
    expect(OTA_MANIFEST_URL).toMatch(/\/main\/tsp\/ota\/stable\.json$/)
  })
})
