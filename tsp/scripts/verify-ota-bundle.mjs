#!/usr/bin/env node
/**
 * verify-ota-bundle.mjs — 离线校验 OTA 发布产物
 *
 * 校验链路与 iOS 端 @capawesome/capacitor-live-update 的 verifySignatureForFile 等价：
 *   1. 对 ZIP 文件内容做 SHA-256，与 manifest.sha256 比对
 *   2. 用 manifest.signature（base64）对同一份文件做 RSA PKCS#1 v1.5 + SHA-256 验签
 *
 * 用法：
 *   node scripts/verify-ota-bundle.mjs \
 *     --bundle artifacts/ota/quant-desk-ota-0.1.1.zip \
 *     --manifest ota/stable.json \
 *     --public-key ota-public.pem
 */
import { createHash, createVerify } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function parseArgs(argv) {
  const args = {}
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) {
      args[argv[i].slice(2)] = argv[i + 1]
      i += 1
    }
  }
  return args
}

function fail(message) {
  console.error(`FAIL  ${message}`)
  process.exit(1)
}

const args = parseArgs(process.argv.slice(2))
if (!args.bundle || !args.manifest || !args['public-key']) {
  fail('缺少参数：--bundle <zip> --manifest <json> --public-key <pem>')
}

const bundlePath = resolve(args.bundle)
const manifest = JSON.parse(readFileSync(resolve(args.manifest), 'utf8'))
const publicKey = readFileSync(resolve(args['public-key']), 'utf8')
const bundle = readFileSync(bundlePath)

// 1. 完整性：SHA-256
const sha256 = createHash('sha256').update(bundle).digest('hex')
if (sha256 !== String(manifest.sha256).toLowerCase()) {
  fail(`SHA-256 不匹配\n  manifest: ${manifest.sha256}\n  actual:   ${sha256}`)
}
console.log(`OK    sha256 ${sha256}`)

// 2. 真实性：RSA PKCS#1 v1.5 + SHA-256
const signature = Buffer.from(manifest.signature, 'base64')
const verifier = createVerify('sha256')
verifier.update(bundle)
verifier.end()
if (!verifier.verify(publicKey, signature)) {
  fail('数字签名验证失败（公钥不匹配或包体被篡改）')
}
console.log('OK    signature RSA-SHA256 验签通过')

// 3. 清单自洽性
if (manifest.enabled !== true) fail('manifest.enabled 不为 true，安装端会跳过此更新')
if (!manifest.bundleId) fail('manifest.bundleId 缺失')
console.log(`OK    manifest v${manifest.version} / ${manifest.bundleId} / runtime ${manifest.runtimeVersion}`)
console.log('\nPASS  该包可安全发布到 OTA 通道')
