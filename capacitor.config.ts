import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dasaft.biteboss',
  appName: 'BiteBoss',
  webDir: 'www',
  server: { androidScheme: 'https', cleartext: false },
  plugins: { Geolocation: { permissions: ['location'] } },
  ios: { contentInset: 'automatic', handleApplicationNotifications: true },
  android: { allowMixedContent: false }
};

export default config;
