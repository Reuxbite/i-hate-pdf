import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'dev.ihatepdf.app',
  appName: 'I Hate PDF',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
}

export default config
