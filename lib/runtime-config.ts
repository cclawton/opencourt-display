export type RuntimeConfig = {
  apiBaseUrl: string;
  googleClientId: string;
  deviceId: string;
  devices: { deviceId: string; name: string }[];
  cognitoUserPoolId: string;
  cognitoUserPoolClientId: string;
};

const fallback: RuntimeConfig = {
  apiBaseUrl: '',
  googleClientId: '',
  deviceId: 'honours-board-tv',
  devices: [
    { deviceId: 'honours-board-tv', name: 'Bar Room TV' },
    { deviceId: 'opencourt-kitchen', name: 'Kitchen TV' },
  ],
  cognitoUserPoolId: '',
  cognitoUserPoolClientId: '',
};

export function getRuntimeConfig(): RuntimeConfig {
  if (typeof window === 'undefined') return fallback;
  const value = window.OPENCOURT_WEB_CONFIG;
  return {
    apiBaseUrl: value?.apiBaseUrl?.replace(/\/$/, '') ?? fallback.apiBaseUrl,
    googleClientId: value?.googleClientId ?? fallback.googleClientId,
    deviceId: value?.deviceId ?? fallback.deviceId,
    devices: value?.devices?.length ? value.devices : fallback.devices,
    cognitoUserPoolId: value?.cognitoUserPoolId ?? fallback.cognitoUserPoolId,
    cognitoUserPoolClientId:
      value?.cognitoUserPoolClientId ?? fallback.cognitoUserPoolClientId,
  };
}

declare global {
  interface Window {
    OPENCOURT_WEB_CONFIG?: Partial<RuntimeConfig>;
  }
}
