import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bumpalert.app',
  appName: 'BumpAlert',
  webDir: 'www',
  plugins: {
    // Reserve the iPhone status-bar/Dynamic Island region for native chrome.
    // The map can stay fullscreen without its actionable overlays being clipped.
    StatusBar: {
      overlaysWebView: false,
      backgroundColor: '#071e28',
      style: 'LIGHT',
    },
  },
};

export default config;
