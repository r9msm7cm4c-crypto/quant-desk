/// <reference types="vite/client" />

declare module '*.css' {
  const content: string
  export default content
}

interface ImportMetaEnv {
  readonly VITE_OTA_MANIFEST_URL?: string
  readonly VITE_OTA_PUBLIC_KEY_CONFIGURED?: string
  readonly VITE_OTA_BUNDLED_VERSION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
