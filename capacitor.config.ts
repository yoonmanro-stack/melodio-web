import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.melodio.pioneer',
  appName: 'Pioneer 119 Rescue',
  webDir: 'public',
  server: {
    url: 'https://melodio.app/pioneer',
    cleartext: true
  }
};

export default config;
