export type RuntimeConfig = {
  apiBaseUrl: string;
  googleClientId: string;
  deviceId: string;
};

const fallback: RuntimeConfig = {
  apiBaseUrl: '',
  googleClientId: '',
  deviceId: 'honours-board-tv',
};

export function getRuntimeConfig(): RuntimeConfig {
  if (typeof window === 'undefined') return fallback;
  const value = window.OPENCOURT_WEB_CONFIG;
  return {
    apiBaseUrl: value?.apiBaseUrl?.replace(/\/$/, '') ?? fallback.apiBaseUrl,
    googleClientId: value?.googleClientId ?? fallback.googleClientId,
    deviceId: value?.deviceId ?? fallback.deviceId,
  };
}

declare global {
  interface Window {
    OPENCOURT_WEB_CONFIG?: Partial<RuntimeConfig>;
  }
}
