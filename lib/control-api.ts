import type { RuntimeConfig } from './runtime-config';

export type RemoteProgramme = {
  programmeId: string;
  name: string;
  shortName: string;
  day: string;
  startTime: string;
  endTime: string;
  activities: string[];
};

export type RemoteDevice = {
  schemaVersion: number;
  deviceId: string;
  revision: number;
  pollIntervalSeconds: number;
  source: { type: 'image' | 'google_slides'; url: string };
  activeSelection: { kind: string; name?: string; programmeId?: string } | null;
  override: { name: string; programmeId: string; startedAt: string } | null;
  updatedAt: string | null;
  updatedBy: string | null;
};

async function request<T>(config: RuntimeConfig, token: string, path: string, init: RequestInit = {}): Promise<T> {
  if (!config.apiBaseUrl) throw new Error('The control API is not configured for this site.');
  const headers = new Headers(init.headers);
  headers.set('authorization', `Bearer ${token}`);
  if (init.body) headers.set('content-type', 'application/json');
  const response = await fetch(`${config.apiBaseUrl}${path}`, { ...init, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
  return body as T;
}

export async function loadAdminState(config: RuntimeConfig, token: string) {
  const [programmeResponse, deviceResponse] = await Promise.all([
    request<{ programmes: RemoteProgramme[] }>(config, token, '/admin/programmes'),
    request<{ device: RemoteDevice }>(config, token, `/admin/devices/${encodeURIComponent(config.deviceId)}`),
  ]);
  return { programmes: programmeResponse.programmes, device: deviceResponse.device };
}

export async function issueDeviceAction(config: RuntimeConfig, token: string, action: Record<string, unknown>) {
  const response = await request<{ device: RemoteDevice }>(config, token, `/admin/devices/${encodeURIComponent(config.deviceId)}/actions`, {
    method: 'POST',
    body: JSON.stringify(action),
  });
  return response.device;
}
