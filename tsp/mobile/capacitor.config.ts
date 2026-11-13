import type { CapacitorConfig } from '@capacitor/cli';

const buildEnv = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};
const otaPublicKey = String(buildEnv.OTA_PUBLIC_KEY ?? '').replace(/\\n/g, '\n').trim();
if (buildEnv.VITE_OTA_PUBLIC_KEY_CONFIGURED === 'true' && !otaPublicKey.includes('BEGIN PUBLIC KEY')) {
  throw new Error('OTA is enabled for the web build but OTA_PUBLIC_KEY is missing from the native build environment.');
}

const config: CapacitorConfig = {
  appId: 'com.quantdesk.mobile',
  appName: 'Quant Desk',
  webDir: '../frontend/dist',
  ios: {
    contentInset: 'automatic'
  },
  plugins: {
    LiveUpdate: {
      publicKey: otaPublicKey,
      defaultChannel: 'stable',
      autoUpdateStrategy: 'none',
      autoBlockRolledBackBundles: true,
      autoDeleteBundles: true,
      readyTimeout: 20000,
      httpTimeout: 60000
    }
  }
};

export default config;
